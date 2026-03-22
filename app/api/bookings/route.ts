import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { generateConsentForm } from "@/lib/generate-consent-form";
import { sendBookingEmail } from "@/lib/send-booking-email";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const fullName = form.get("fullName") as string;
    const email = form.get("email") as string;
    const phone = form.get("phone") as string;
    const dob = form.get("dob") as string;
    const tattooDescription = form.get("tattooDescription") as string;
    const consentDate = form.get("consentDate") as string;
    const initialsPngDataUrl = form.get("initialsPngDataUrl") as string | null;
    const signaturePngDataUrl = form.get("signaturePngDataUrl") as string | null;
    const photoId = form.get("photoId") as File | null;
    const referencePhotos = form.getAll("referencePhotos") as File[];

    if (!fullName || !email) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const bookingId = crypto.randomUUID();

    // Upload files to Supabase Storage
    const uploadFile = async (
      file: File | Blob,
      storagePath: string
    ): Promise<string> => {
      const buf = Buffer.from(await file.arrayBuffer());
      const { error } = await supabase.storage
        .from("booking-uploads")
        .upload(storagePath, buf, {
          contentType: file instanceof File ? file.type : "image/png",
          upsert: true,
        });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      return storagePath;
    };

    let photoIdUrl: string | null = null;
    let photoIdBuffer: Uint8Array | undefined;
    if (photoId && photoId.size > 0) {
      photoIdUrl = await uploadFile(
        photoId,
        `${bookingId}/photo-id${extFromType(photoId.type)}`
      );
      photoIdBuffer = new Uint8Array(await photoId.arrayBuffer());
    }

    const refUrls: string[] = [];
    const refBuffers: Uint8Array[] = [];
    for (let i = 0; i < referencePhotos.length; i++) {
      const f = referencePhotos[i];
      if (f.size === 0) continue;
      const url = await uploadFile(
        f,
        `${bookingId}/ref-${i}${extFromType(f.type)}`
      );
      refUrls.push(url);
      refBuffers.push(new Uint8Array(await f.arrayBuffer()));
    }

    // Upload initials & signature blobs
    let initialsUrl: string | null = null;
    if (initialsPngDataUrl) {
      const blob = dataUrlToBlob(initialsPngDataUrl);
      initialsUrl = await uploadFile(blob, `${bookingId}/initials.png`);
    }

    let signatureUrl: string | null = null;
    if (signaturePngDataUrl) {
      const blob = dataUrlToBlob(signaturePngDataUrl);
      signatureUrl = await uploadFile(blob, `${bookingId}/signature.png`);
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
        .upload(`${bookingId}/consent-form.png`, consentFormBuffer, {
          contentType: "image/png",
          upsert: true,
        });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      consentFormUrl = `${bookingId}/consent-form.png`;
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

    // Send email with attachments
    await sendBookingEmail(
      { fullName, email, phone, dob, tattooDescription, consentDate },
      {
        consentForm: consentFormBuffer,
        photoId: photoIdBuffer,
        referencePhotos: refBuffers.length > 0 ? refBuffers : undefined,
      }
    );

    return NextResponse.json({ success: true, bookingId });
  } catch (err) {
    console.error("Booking submission error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function extFromType(mime: string): string {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  return ".jpg";
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  return new Blob([bytes], { type: mime });
}
