import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServerClient } from "@/lib/supabase-server";
import { generateConsentForm } from "@/lib/generate-consent-form";
import { sendBookingEmail } from "@/lib/send-booking-email";
import { sendPreAppointmentEmail } from "@/lib/send-client-emails";
import { clientIp, hit, tooManyRequests } from "@/lib/rate-limit";

// PDF + image generation depend on the Node.js runtime (sharp / pdf-lib).
export const runtime = "nodejs";

// A real client submits this form once. Five per hour leaves generous room for a
// retry after a failed upload while capping the cost of an abusive caller — every
// submission writes to storage, renders a PDF, and sends two emails.
const BOOKINGS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

/*
 * LIMITS — sized against what the booking funnel actually sends, not guessed.
 *
 * components/BookingFunnel.tsx resizes every chosen image to 1600px / JPEG q0.8
 * (a few hundred KB) and passes a file through untouched ONLY when it is already
 * <=1600px AND <=1.5MB, and it caps reference photos at 3. So a genuine
 * submission is one photo ID plus at most 3 photos of ~1.5MB worst case.
 *
 * Every cap below therefore sits far above real traffic, deliberately: rejecting
 * a real client costs the studio a customer, while a generous cap costs little
 * because sharp re-encodes each image before storage, so what actually LANDS in
 * the bucket is bounded by the re-encode rather than by the upload size.
 *
 * These are the server's own limits. The client-side ones above are convenience,
 * not enforcement — anyone can POST here directly.
 */
const MAX_FILE_BYTES = 15 * 1024 * 1024; // ~10x the largest realistic file
const MAX_TOTAL_UPLOAD_BYTES = 40 * 1024 * 1024; // ~8x a full real submission
const MAX_REFERENCE_PHOTOS = 6; // double the funnel's own cap of 3
const MAX_DATA_URL_CHARS = 2 * 1024 * 1024; // signature PNGs run ~5-50KB
const MAX_NAME_CHARS = 200;
const MAX_EMAIL_CHARS = 320; // RFC 5321 maximum
const MAX_PHONE_CHARS = 40;
const MAX_DESCRIPTION_CHARS = 5000; // ~1000 words
const MAX_DATE_CHARS = 40;

// Deliberately permissive: this exists to catch obvious junk, not to adjudicate
// RFC 5322. A stricter pattern's failure mode is turning away a real customer.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rejection carrying a message that is safe to show a member of the public. */
class InvalidSubmission extends Error {}

function requireText(
  value: FormDataEntryValue | null,
  max: number,
  label: string,
  { required = false }: { required?: boolean } = {}
): string {
  const str = typeof value === "string" ? value.trim() : "";
  if (required && !str) throw new InvalidSubmission(`${label} is required.`);
  if (str.length > max) {
    throw new InvalidSubmission(`${label} is too long (max ${max} characters).`);
  }
  return str;
}

/**
 * The signature and initials arrive as canvas data URLs, i.e. arbitrary
 * caller-supplied strings. Unchecked they flowed straight into a Buffer and a
 * storage upload, so both the size and the shape are pinned down here.
 */
function requireImageDataUrl(
  value: FormDataEntryValue | null,
  label: string
): string | null {
  if (typeof value !== "string" || !value) return null;
  if (value.length > MAX_DATA_URL_CHARS) {
    throw new InvalidSubmission(`Your ${label} image is too large.`);
  }
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new InvalidSubmission(`Your ${label} could not be read.`);
  }
  return value;
}

/**
 * Re-encodes through sharp. This is the actual type check: bytes that are not a
 * decodable image cannot survive it, which is what stops a video (or anything
 * else) renamed to .jpg from being accepted on the strength of its filename.
 * It also normalises every upload to a bounded JPEG, so storage growth no longer
 * depends on what the caller chose to send.
 */
async function reencodeImage(file: File, label: string): Promise<Buffer> {
  try {
    return await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate() // honour EXIF orientation
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    throw new InvalidSubmission(
      `${label} could not be read as an image. Please upload a JPG or PNG.`
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Checked before the body is read: refusing early is the whole point, since
    // parsing the multipart upload is itself the expensive part.
    const limit = hit(
      `bookings:${clientIp(req)}`,
      BOOKINGS_PER_HOUR,
      HOUR_MS
    );
    if (!limit.allowed) {
      return tooManyRequests(
        "Too many booking requests from this connection. Please wait a few minutes and try again.",
        limit.retryAfterSec
      );
    }

    const form = await req.formData();

    /* ---- Validate EVERYTHING before touching storage --------------------
     * Uploads previously ran inline as each field was read, so a request that
     * failed partway through still left orphaned files in the bucket. Nothing
     * below reaches Supabase until every check has passed. */
    const fullName = requireText(form.get("fullName"), MAX_NAME_CHARS, "Name", {
      required: true,
    });
    const email = requireText(form.get("email"), MAX_EMAIL_CHARS, "Email", {
      required: true,
    });
    if (!EMAIL_RE.test(email)) {
      throw new InvalidSubmission("That email address doesn't look right.");
    }
    const phone = requireText(form.get("phone"), MAX_PHONE_CHARS, "Phone");
    const dob = requireText(form.get("dob"), MAX_DATE_CHARS, "Date of birth");
    const tattooDescription = requireText(
      form.get("tattooDescription"),
      MAX_DESCRIPTION_CHARS,
      "Tattoo description"
    );
    const consentDate = requireText(
      form.get("consentDate"),
      MAX_DATE_CHARS,
      "Consent date"
    );
    const initialsPngDataUrl = requireImageDataUrl(
      form.get("initialsPngDataUrl"),
      "initials"
    );
    const signaturePngDataUrl = requireImageDataUrl(
      form.get("signaturePngDataUrl"),
      "signature"
    );

    const photoIdEntry = form.get("photoId");
    const photoId =
      photoIdEntry instanceof File && photoIdEntry.size > 0
        ? photoIdEntry
        : null;
    const referencePhotos = form
      .getAll("referencePhotos")
      .filter((f): f is File => f instanceof File && f.size > 0);

    if (referencePhotos.length > MAX_REFERENCE_PHOTOS) {
      throw new InvalidSubmission(
        `Please attach at most ${MAX_REFERENCE_PHOTOS} reference photos.`
      );
    }

    let totalBytes = 0;
    for (const file of photoId ? [photoId, ...referencePhotos] : referencePhotos) {
      if (file.size > MAX_FILE_BYTES) {
        throw new InvalidSubmission(
          `Each photo must be under ${Math.round(
            MAX_FILE_BYTES / (1024 * 1024)
          )}MB.`
        );
      }
      totalBytes += file.size;
    }
    if (totalBytes > MAX_TOTAL_UPLOAD_BYTES) {
      throw new InvalidSubmission(
        "Those photos are too large in total. Please attach fewer, or smaller, images."
      );
    }

    // Decoding IS the type check — see reencodeImage.
    const photoIdBuffer = photoId
      ? await reencodeImage(photoId, "Your photo ID")
      : undefined;
    const refBuffers: Buffer[] = [];
    for (let i = 0; i < referencePhotos.length; i++) {
      refBuffers.push(
        await reencodeImage(referencePhotos[i], `Reference photo ${i + 1}`)
      );
    }

    /* ---- Everything validated; only now is it safe to write ------------- */
    const supabase = createServerClient();
    const bookingId = crypto.randomUUID();

    const uploadFile = async (
      body: Buffer | Blob,
      storagePath: string,
      contentType: string
    ): Promise<string> => {
      const buf =
        body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : body;
      const { error } = await supabase.storage
        .from("booking-uploads")
        .upload(storagePath, buf, { contentType, upsert: true });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      return storagePath;
    };

    // Stored as .jpg because that is now genuinely what the bytes are; the
    // extension is no longer taken from the caller's claimed MIME type. Older
    // bookings keep whatever path is recorded on their own row, so their
    // attachments still resolve in the admin portal.
    let photoIdUrl: string | null = null;
    if (photoIdBuffer) {
      photoIdUrl = await uploadFile(
        photoIdBuffer,
        `${bookingId}/photo-id.jpg`,
        "image/jpeg"
      );
    }

    const refUrls: string[] = [];
    for (let i = 0; i < refBuffers.length; i++) {
      refUrls.push(
        await uploadFile(refBuffers[i], `${bookingId}/ref-${i}.jpg`, "image/jpeg")
      );
    }

    // Upload initials & signature blobs
    let initialsUrl: string | null = null;
    if (initialsPngDataUrl) {
      const blob = dataUrlToBlob(initialsPngDataUrl);
      initialsUrl = await uploadFile(
        blob,
        `${bookingId}/initials.png`,
        "image/png"
      );
    }

    let signatureUrl: string | null = null;
    if (signaturePngDataUrl) {
      const blob = dataUrlToBlob(signaturePngDataUrl);
      signatureUrl = await uploadFile(
        blob,
        `${bookingId}/signature.png`,
        "image/png"
      );
    }

    // Generate filled consent form PNG
    const consentFormBuffer = await generateConsentForm({
      fullName,
      dob,
      consentDate,
      tattooDescription,
      initialsPngDataUrl,
      signaturePngDataUrl,
    });

    // Upload consent form
    let consentFormUrl: string | null = null;
    {
      const { error } = await supabase.storage
        .from("booking-uploads")
        .upload(`${bookingId}/consent-form.pdf`, consentFormBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      consentFormUrl = `${bookingId}/consent-form.pdf`;
    }

    // Store booking in database
    const { error: dbError } = await supabase.from("bookings").insert({
      id: bookingId,
      full_name: fullName,
      email,
      phone,
      dob: dob || null,
      tattoo_description: tattooDescription,
      consent_date: consentDate || null,
      initials_url: initialsUrl,
      signature_url: signatureUrl,
      consent_form_url: consentFormUrl,
      photo_id_url: photoIdUrl,
      reference_photo_urls: refUrls.length > 0 ? refUrls : null,
      status: "new",
    });

    if (dbError) {
      console.error("DB insert error:", dbError);
      return NextResponse.json(
        { error: "Failed to save booking" },
        { status: 500 }
      );
    }

    // Notify the studio. Best-effort: the booking row + uploads are already
    // committed, so a mail failure must NOT 500 the request — that makes the
    // client retry and double-book. sendBookingEmail now throws on a Resend
    // error; we log it here instead of failing. A missed studio email is
    // recoverable (the booking is in the admin portal); a duplicate is not.
    try {
      await sendBookingEmail(
        { fullName, email, phone, dob, tattooDescription, consentDate },
        {
          consentForm: consentFormBuffer,
          photoId: photoIdBuffer,
          referencePhotos: refBuffers.length > 0 ? refBuffers : undefined,
        }
      );
    } catch (emailErr) {
      console.error("Studio booking-notification email error:", emailErr);
    }

    // Confirmation + pre-appointment instructions to the client. Best-effort:
    // the booking is already saved and the studio notified, so don't fail the
    // request over this.
    try {
      await sendPreAppointmentEmail({ fullName, email });
    } catch (emailErr) {
      console.error("Pre-appointment email error:", emailErr);
    }

    return NextResponse.json({ success: true, bookingId });
  } catch (err) {
    // A validation rejection carries a message written for a member of the
    // public and is answered as a 400. Anything else is logged server-side and
    // answered generically, so Supabase and storage internals — table names,
    // column names, bucket paths — never reach the browser.
    if (err instanceof InvalidSubmission) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Booking submission error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  return new Blob([bytes], { type: mime });
}
