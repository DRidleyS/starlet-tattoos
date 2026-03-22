import { createServerClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import BookingDetail from "./BookingDetail";

export const dynamic = "force-dynamic";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: booking, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !booking) return notFound();

  // Generate signed URLs for private files
  const getSignedUrl = async (path: string | null) => {
    if (!path) return null;
    const { data } = await supabase.storage
      .from("booking-uploads")
      .createSignedUrl(path, 3600);
    return data?.signedUrl || null;
  };

  const [photoIdSignedUrl, consentFormSignedUrl, initialsSignedUrl, signatureSignedUrl] =
    await Promise.all([
      getSignedUrl(booking.photo_id_url),
      getSignedUrl(booking.consent_form_url),
      getSignedUrl(booking.initials_url),
      getSignedUrl(booking.signature_url),
    ]);

  const refSignedUrls: string[] = [];
  if (booking.reference_photo_urls) {
    for (const path of booking.reference_photo_urls) {
      const url = await getSignedUrl(path);
      if (url) refSignedUrls.push(url);
    }
  }

  return (
    <BookingDetail
      booking={booking}
      photoIdUrl={photoIdSignedUrl}
      consentFormUrl={consentFormSignedUrl}
      initialsUrl={initialsSignedUrl}
      signatureUrl={signatureSignedUrl}
      referencePhotoUrls={refSignedUrls}
    />
  );
}
