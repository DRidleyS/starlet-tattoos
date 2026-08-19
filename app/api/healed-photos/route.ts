import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServerClient } from "@/lib/supabase-server";
import { sendHealedPhotosEmail } from "@/lib/send-booking-email";
import { clientIp, hit, tooManyRequests } from "@/lib/rate-limit";

// Image re-encoding needs the Node.js runtime (sharp).
export const runtime = "nodejs";

// The per-booking caps below already bound total storage; this bounds the RATE,
// so a leaked or shared follow-up link cannot be replayed to spray the studio
// inbox with notification emails. Generous enough for a client uploading in
// several goes from a phone.
const HEALED_UPLOADS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

const MAX_PHOTOS_PER_SUBMISSION = 6;
const MAX_PHOTOS_PER_BOOKING = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_MESSAGE_CHARS = 2000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public endpoint behind an unguessable link: the two-week follow-up email
 * gives each client `/healed/{bookingId}`, and this accepts their healed
 * photos. Uploads only land on real, completed bookings, and everything is
 * re-encoded through sharp so only actual images are stored.
 */
export async function POST(req: NextRequest) {
  try {
    const limit = hit(
      `healed:${clientIp(req)}`,
      HEALED_UPLOADS_PER_HOUR,
      HOUR_MS
    );
    if (!limit.allowed) {
      return tooManyRequests(
        "Too many uploads from this connection. Please wait a few minutes and try again.",
        limit.retryAfterSec
      );
    }

    const form = await req.formData();
    const bookingId = (form.get("bookingId") as string | null)?.trim() ?? "";
    const message = ((form.get("message") as string | null) ?? "").slice(
      0,
      MAX_MESSAGE_CHARS
    );
    const photos = (form.getAll("photos") as File[]).filter(
      (f) => f instanceof File && f.size > 0
    );

    if (!UUID_RE.test(bookingId)) {
      return NextResponse.json({ error: "Invalid link" }, { status: 400 });
    }
    if (photos.length === 0) {
      return NextResponse.json(
        { error: "Please choose at least one photo" },
        { status: 400 }
      );
    }
    if (photos.length > MAX_PHOTOS_PER_SUBMISSION) {
      return NextResponse.json(
        { error: `Up to ${MAX_PHOTOS_PER_SUBMISSION} photos at a time` },
        { status: 400 }
      );
    }
    for (const photo of photos) {
      if (photo.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "Each photo must be under 15MB" },
          { status: 400 }
        );
      }
    }

    const supabase = createServerClient();
    const { data: booking } = await supabase
      .from("bookings")
      .select("id, full_name, email, status")
      .eq("id", bookingId)
      .single();

    if (!booking || booking.status !== "completed") {
      return NextResponse.json(
        { error: "This link is no longer active" },
        { status: 404 }
      );
    }

    const { data: existingFiles } = await supabase.storage
      .from("booking-uploads")
      .list(bookingId);
    const existingHealed = (existingFiles ?? []).filter((f) =>
      f.name.startsWith("healed-")
    ).length;
    if (existingHealed + photos.length > MAX_PHOTOS_PER_BOOKING) {
      return NextResponse.json(
        { error: "Photo limit reached for this booking — thank you!" },
        { status: 400 }
      );
    }

    const buffers: Buffer[] = [];
    for (const photo of photos) {
      try {
        const processed = await sharp(Buffer.from(await photo.arrayBuffer()))
          .rotate() // honor EXIF orientation
          .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        buffers.push(processed);
      } catch {
        return NextResponse.json(
          { error: "One of the files isn't a readable image" },
          { status: 400 }
        );
      }
    }

    const batch = Date.now();
    for (let i = 0; i < buffers.length; i++) {
      const { error } = await supabase.storage
        .from("booking-uploads")
        .upload(`${bookingId}/healed-${batch}-${i + 1}.jpg`, buffers[i], {
          contentType: "image/jpeg",
        });
      if (error) {
        console.error("Healed photo upload error:", error);
        return NextResponse.json(
          { error: "Upload failed — please try again" },
          { status: 500 }
        );
      }
    }

    // Photos are safely stored either way; the email is best-effort.
    try {
      await sendHealedPhotosEmail(
        { id: booking.id, fullName: booking.full_name, email: booking.email },
        buffers,
        message
      );
    } catch (emailErr) {
      console.error("Healed photos email error:", emailErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Healed photo submission error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
