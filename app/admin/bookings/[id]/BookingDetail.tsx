"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STATUSES = ["new", "contacted", "booked", "completed", "cancelled"];

type Booking = {
  id: string;
  created_at: string;
  full_name: string;
  email: string;
  phone: string;
  dob: string;
  tattoo_description: string;
  consent_date: string;
  status: string;
  notes: string | null;
  followup_email_id?: string | null;
  followup_scheduled_for?: string | null;
};

type Followup = {
  emailId: string | null;
  scheduledFor: string | null;
};

export default function BookingDetail({
  booking,
  photoIdUrl,
  consentFormUrl,
  initialsUrl,
  signatureUrl,
  referencePhotoUrls,
  healedPhotoUrls,
  now,
}: {
  booking: Booking;
  photoIdUrl: string | null;
  consentFormUrl: string | null;
  initialsUrl: string | null;
  signatureUrl: string | null;
  referencePhotoUrls: string[];
  healedPhotoUrls: string[];
  /** Server render time (ms) — used instead of Date.now() to keep render pure. */
  now: number;
}) {
  const [status, setStatus] = useState(booking.status);
  const [notes, setNotes] = useState(booking.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [followup, setFollowup] = useState<Followup>({
    emailId: booking.followup_email_id ?? null,
    scheduledFor: booking.followup_scheduled_for ?? null,
  });
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [followupBusy, setFollowupBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const router = useRouter();

  const followupPending = Boolean(
    followup.emailId &&
      followup.scheduledFor &&
      new Date(followup.scheduledFor).getTime() > now
  );
  // `scheduledFor` must be present, not just the email id: an id without a date
  // used to fall through to the "Sent ..." branch below, where the non-null
  // assertion handed `new Date(null)` to the formatter and printed 31 Dec 1969.
  const followupSent = Boolean(
    followup.emailId && followup.scheduledFor && !followupPending
  );

  const applyFollowupResponse = (data: {
    followup?: Followup;
    followupError?: string | null;
  }) => {
    if (data.followup) setFollowup(data.followup);
    setFollowupError(data.followupError ?? null);
  };

  /**
   * Turns a failed response into something the owner can act on. An expired
   * session is by far the most likely cause here — the admin portal is left
   * open for days — and it needs different advice than a genuine server error.
   */
  const describeFailure = (res: Response, fallback: string) =>
    res.status === 401 || res.status === 403
      ? "Your sign-in has expired. Reload the page and sign in again."
      : fallback;

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        // Deliberately leaves the button disabled: the navigation is the
        // feedback, and re-enabling it invites a second delete mid-transition.
        router.push("/admin/bookings");
        return;
      }
      setActionError(
        describeFailure(res, "Could not delete this booking. Please try again.")
      );
    } catch {
      setActionError("Network error - the booking was not deleted.");
    }
    // Only reached on failure; success navigates away.
    setDeleting(false);
    setConfirmDelete(false);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      // The success banner used to be set unconditionally, so a rejected save
      // still flashed "Saved!" and the owner walked away believing a status
      // change had been written when nothing had.
      if (!res.ok) {
        setActionError(
          describeFailure(res, "Could not save your changes. Please try again.")
        );
        return;
      }
      try {
        applyFollowupResponse(await res.json());
      } catch {
        // ignore malformed response body
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // fetch() itself rejects when the connection drops. Without this the
      // button sat on "Saving..." forever with no way back.
      setActionError("Network error - your changes were not saved.");
    } finally {
      setSaving(false);
    }
  };

  const followupAction = async (action: "schedule" | "cancel") => {
    setFollowupBusy(true);
    setFollowupError(null);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followupAction: action }),
      });
      if (res.ok) {
        applyFollowupResponse(await res.json());
      } else {
        setFollowupError("Request failed — please try again.");
      }
    } catch {
      setFollowupError("Request failed — please try again.");
    }
    setFollowupBusy(false);
  };

  return (
    <div className="max-w-3xl w-full">
      <Link
        href="/admin/bookings"
        className="text-sm text-neutral-500 hover:text-white mb-4 inline-block"
      >
        &larr; Back to bookings
      </Link>

      <h1 className="text-2xl font-bold mb-1">{booking.full_name}</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Submitted {new Date(booking.created_at).toLocaleString()}
      </p>

      {/* Contact info */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <Field label="Email" value={booking.email} />
        <Field label="Phone" value={booking.phone} />
        <Field label="Date of Birth" value={booking.dob} />
        <Field label="Consent Date" value={booking.consent_date} />
      </section>

      {/* Tattoo description */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase mb-2">
          Tattoo Description
        </h2>
        <p className="bg-neutral-900 rounded-lg p-4 text-neutral-200 whitespace-pre-wrap">
          {booking.tattoo_description || "—"}
        </p>
      </section>

      {/* Images */}
      <section className="mb-8 space-y-4">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase mb-2">
          Attachments
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {consentFormUrl && (
            <DocCard label="Consent Form (PDF)" src={consentFormUrl} />
          )}
          {photoIdUrl && <ImageCard label="Photo ID" src={photoIdUrl} />}
          {initialsUrl && <ImageCard label="Initials" src={initialsUrl} />}
          {signatureUrl && <ImageCard label="Signature" src={signatureUrl} />}
          {referencePhotoUrls.map((url, i) => (
            <ImageCard key={i} label={`Reference ${i + 1}`} src={url} />
          ))}
        </div>
      </section>

      {/* Healed photos sent by the client via their private follow-up link */}
      {healedPhotoUrls.length > 0 && (
        <section className="mb-8 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase mb-2">
            Healed Photos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {healedPhotoUrls.map((url, i) => (
              <ImageCard key={i} label={`Healed ${i + 1}`} src={url} />
            ))}
          </div>
        </section>
      )}

      {/* Status & Notes */}
      <section className="bg-neutral-900 rounded-xl p-6 space-y-4">
        <div>
          <label
            htmlFor="booking-status"
            className="block text-sm text-neutral-400 mb-1"
          >
            Status
          </label>
          <select
            id="booking-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-neutral-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-400"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          {/* Not a <label>: this heads a status panel, not a form control, and
              a label pointing at nothing is skipped or misread by screen
              readers. */}
          <p className="block text-sm text-neutral-400 mb-1">
            Healing follow-up
          </p>
          <div className="bg-neutral-800 rounded-lg px-4 py-3 space-y-2">
            {followupPending ? (
              <>
                <p className="text-sm text-neutral-200">
                  Scheduled for{" "}
                  <span className="font-semibold">
                    {formatFollowupDate(followup.scheduledFor!)}
                  </span>{" "}
                  — asks {booking.full_name.split(" ")[0]} to reply with healed
                  photos and leave a review.
                </p>
                <button
                  onClick={() => followupAction("cancel")}
                  disabled={followupBusy}
                  className="text-sm text-neutral-400 hover:text-red-400 transition disabled:opacity-50"
                >
                  {followupBusy ? "Cancelling..." : "Cancel follow-up"}
                </button>
              </>
            ) : followupSent ? (
              <p className="text-sm text-neutral-200">
                Sent {formatFollowupDate(followup.scheduledFor!)} — asked for
                healed photos and a review.
              </p>
            ) : status === "completed" ? (
              <>
                <p className="text-sm text-neutral-400">
                  No follow-up scheduled for this booking.
                </p>
                <button
                  onClick={() => followupAction("schedule")}
                  disabled={followupBusy}
                  className="text-sm text-rose-300 hover:text-rose-200 transition disabled:opacity-50"
                >
                  {followupBusy
                    ? "Scheduling..."
                    : "Schedule follow-up (sends in 2 weeks)"}
                </button>
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                When you mark this booking <b>completed</b>, the client is
                automatically emailed 2 weeks later asking for healed photos
                and a review.
              </p>
            )}
            {followupError && (
              <p className="text-sm text-red-400">{followupError}</p>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="booking-notes"
            className="block text-sm text-neutral-400 mb-1"
          >
            Notes
          </label>
          <textarea
            id="booking-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-400 resize-y"
            placeholder="Private notes about this booking..."
          />
        </div>

        {/* Failures are reported here instead of through alert(): the message
            stays on screen next to the control that produced it, and role=alert
            makes a screen reader announce it without stealing focus. */}
        {actionError && (
          <p
            role="alert"
            className="bg-red-500/10 border border-red-500/40 text-red-300 text-sm rounded-lg px-4 py-3"
          >
            {actionError}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>

          {/* The button's own label carries the state visually, but a changed
              label on a focused button is not reliably announced. */}
          <span role="status" aria-live="polite" className="sr-only">
            {saving ? "Saving changes" : saved ? "Changes saved" : ""}
          </span>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-sm text-neutral-500 hover:text-red-400 transition sm:ml-auto"
            >
              Delete booking
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span className="text-sm text-red-400">Are you sure?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-sm text-neutral-500 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function formatFollowupDate(iso: string): string {
  const date = new Date(iso);
  // Better an honest "an unknown date" than a confident 31 December 1969.
  if (Number.isNaN(date.getTime())) return "an unknown date";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 uppercase">{label}</p>
      <p className="text-neutral-200">{value || "—"}</p>
    </div>
  );
}

function DocCard({ label, src }: { label: string; src: string }) {
  return (
    <div className="bg-neutral-800 rounded-lg overflow-hidden flex flex-col">
      <p className="text-xs text-neutral-500 px-3 pt-2">{label}</p>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-center justify-center gap-2 p-6 text-rose-300 hover:text-rose-200 transition"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="text-sm font-medium">View / download</span>
      </a>
    </div>
  );
}

function ImageCard({ label, src }: { label: string; src: string }) {
  return (
    <div className="bg-neutral-800 rounded-lg overflow-hidden">
      <p className="text-xs text-neutral-500 px-3 pt-2">{label}</p>
      <a href={src} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={label}
          className="w-full max-h-64 object-contain p-2"
        />
      </a>
    </div>
  );
}
