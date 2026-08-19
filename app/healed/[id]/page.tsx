import { createServerClient } from "@/lib/supabase-server";
import HealedUpload from "./HealedUpload";

export const dynamic = "force-dynamic";

/**
 * Private healed-photo upload page, reached from the two-week follow-up email.
 * The unguessable booking id in the URL is the access token; the page itself
 * shows no personal details.
 */
export default async function HealedPhotosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status")
    .eq("id", id)
    .single();

  const active = Boolean(booking && booking.status === "completed");

  return (
    <main className="min-h-screen bg-white px-4 py-12 flex flex-col items-center">
      {active ? (
        <HealedUpload
          bookingId={id}
          reviewLink={process.env.REVIEW_LINK || null}
        />
      ) : (
        <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
          <div className="text-lg font-semibold text-black">
            This link isn&apos;t active
          </div>
          <p className="mt-2 text-sm text-black/60">
            It may have expired or been opened from an old email. If you think
            this is a mistake, reach out to Starlet Tattoos and we&apos;ll sort
            it out.
          </p>
        </div>
      )}
    </main>
  );
}
