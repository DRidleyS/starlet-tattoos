import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";
import {
  scheduleHealingFollowupEmail,
  cancelScheduledEmail,
} from "@/lib/send-client-emails";

// The admin UI offers exactly these, but the UI is not the guard — this route
// is reachable directly. An unrecognised status would sit in the database
// breaking the list page's badges and the completed-status follow-up logic.
const STATUSES = [
  "new",
  "contacted",
  "booked",
  "completed",
  "cancelled",
] as const;

const MAX_NOTES_CHARS = 10000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const supabase = createServerClient();

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) {
      if (
        typeof body.status !== "string" ||
        !(STATUSES as readonly string[]).includes(body.status)
      ) {
        return NextResponse.json({ error: "Unknown status" }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (body.notes !== undefined) {
      if (typeof body.notes !== "string") {
        return NextResponse.json({ error: "Invalid notes" }, { status: 400 });
      }
      if (body.notes.length > MAX_NOTES_CHARS) {
        return NextResponse.json(
          { error: `Notes are too long (max ${MAX_NOTES_CHARS} characters).` },
          { status: 400 }
        );
      }
      updates.notes = body.notes;
    }

    const followupAction = body.followupAction as
      | "schedule"
      | "cancel"
      | undefined;

    if (
      followupAction !== undefined &&
      followupAction !== "schedule" &&
      followupAction !== "cancel"
    ) {
      return NextResponse.json(
        { error: "Unknown follow-up action" },
        { status: 400 }
      );
    }

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
        console.error("Booking update error:", error);
        return NextResponse.json(
          { error: "Could not save your changes" },
          { status: 500 }
        );
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
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid booking id" }, { status: 400 });
    }
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
      console.error("Booking delete error:", error);
      return NextResponse.json(
        { error: "Could not delete the booking" },
        { status: 500 }
      );
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
        // These are the client's photo ID, signature and consent form, so a
        // silent failure here leaves identity documents in the bucket after the
        // owner believes the booking was erased. The row is already gone, so
        // the delete stands — but the leftovers are named in the log rather
        // than discarded.
        const { error: storageErr } = await supabase.storage
          .from("booking-uploads")
          .remove([...paths]);
        if (storageErr) {
          console.error(
            `Booking ${id} row deleted but its files REMAIN in storage ` +
              `(${[...paths].join(", ")}) - remove them manually:`,
            storageErr
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
