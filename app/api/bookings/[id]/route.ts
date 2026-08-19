import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";
import {
  scheduleHealingFollowupEmail,
  cancelScheduledEmail,
} from "@/lib/send-client-emails";

type FollowupState = {
  emailId: string | null;
  scheduledFor: string | null;
};

function isFollowupPending(followup: FollowupState): boolean {
  return Boolean(
    followup.emailId &&
      followup.scheduledFor &&
      new Date(followup.scheduledFor).getTime() > Date.now()
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = createServerClient();

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;

    const followupAction = body.followupAction as
      | "schedule"
      | "cancel"
      | undefined;

    if (Object.keys(updates).length === 0 && !followupAction) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Current row: needed for status transitions and follow-up bookkeeping.
    const { data: existing, error: fetchError } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("bookings")
        .update(updates)
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // Healed-photo/review follow-up. Best-effort: the status/notes update above
    // already succeeded, so scheduling problems are reported, not fatal.
    let followup: FollowupState = {
      emailId: existing.followup_email_id ?? null,
      scheduledFor: existing.followup_scheduled_for ?? null,
    };
    let followupError: string | null = null;

    const pending = isFollowupPending(followup);
    const becameCompleted =
      updates.status === "completed" && existing.status !== "completed";
    const leftCompleted =
      body.status !== undefined &&
      body.status !== "completed" &&
      existing.status === "completed";

    const wantsSchedule =
      followupAction === "schedule" ||
      (!followupAction && becameCompleted && !followup.emailId);
    const wantsCancel =
      followupAction === "cancel" || (!followupAction && leftCompleted);

    try {
      if (wantsCancel && pending) {
        await cancelScheduledEmail(followup.emailId!);
        const { error: dbError } = await supabase
          .from("bookings")
          .update({ followup_email_id: null, followup_scheduled_for: null })
          .eq("id", id);
        if (dbError) throw new Error(dbError.message);
        followup = { emailId: null, scheduledFor: null };
      } else if (wantsSchedule && !pending) {
        if (!existing.email) throw new Error("Booking has no email address");
        const scheduled = await scheduleHealingFollowupEmail({
          bookingId: id,
          fullName: existing.full_name,
          email: existing.email,
        });
        const { error: dbError } = await supabase
          .from("bookings")
          .update({
            followup_email_id: scheduled.emailId,
            followup_scheduled_for: scheduled.scheduledFor.toISOString(),
          })
          .eq("id", id);
        if (dbError) {
          // Don't leave an untracked email in the send queue.
          try {
            await cancelScheduledEmail(scheduled.emailId);
          } catch (cancelErr) {
            console.error("Failed to cancel orphaned follow-up:", cancelErr);
          }
          throw new Error(
            `Couldn't record the follow-up (${dbError.message}). ` +
              `Has the booking follow-up migration been run in Supabase?`
          );
        }
        followup = {
          emailId: scheduled.emailId,
          scheduledFor: scheduled.scheduledFor.toISOString(),
        };
      }
    } catch (err) {
      console.error("Follow-up scheduling error:", err);
      followupError =
        err instanceof Error ? err.message : "Follow-up scheduling failed";
    }

    return NextResponse.json({ ok: true, followup, followupError });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // Get booking to find storage paths and any pending follow-up
    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();

    // A deleted client should never get the scheduled check-in email.
    if (
      booking &&
      isFollowupPending({
        emailId: booking.followup_email_id ?? null,
        scheduledFor: booking.followup_scheduled_for ?? null,
      })
    ) {
      try {
        await cancelScheduledEmail(booking.followup_email_id);
      } catch (err) {
        console.error("Failed to cancel follow-up for deleted booking:", err);
      }
    }

    // Delete from database
    const { error } = await supabase.from("bookings").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Delete all files from storage: everything in the booking's folder
    // (consent form, photo ID, references, healed photos), with the tracked
    // column paths as a fallback in case the folder listing fails.
    if (booking) {
      const { data: folderFiles } = await supabase.storage
        .from("booking-uploads")
        .list(id);
      const paths = new Set<string>(
        (folderFiles ?? []).map((f) => `${id}/${f.name}`)
      );
      for (const p of [
        booking.consent_form_url,
        booking.photo_id_url,
        booking.initials_url,
        booking.signature_url,
        ...(booking.reference_photo_urls || []),
      ]) {
        if (p) paths.add(p as string);
      }

      if (paths.size > 0) {
        await supabase.storage.from("booking-uploads").remove([...paths]);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
