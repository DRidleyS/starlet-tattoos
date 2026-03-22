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
};

export default function BookingDetail({
  booking,
  photoIdUrl,
  consentFormUrl,
  initialsUrl,
  signatureUrl,
  referencePhotoUrls,
}: {
  booking: Booking;
  photoIdUrl: string | null;
  consentFormUrl: string | null;
  initialsUrl: string | null;
  signatureUrl: string | null;
  referencePhotoUrls: string[];
}) {
  const [status, setStatus] = useState(booking.status);
  const [notes, setNotes] = useState(booking.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/bookings/${booking.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/admin/bookings");
    } else {
      setDeleting(false);
      setConfirmDelete(false);
      alert("Failed to delete booking");
    }
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
            <ImageCard label="Consent Form" src={consentFormUrl} />
          )}
          {photoIdUrl && <ImageCard label="Photo ID" src={photoIdUrl} />}
          {initialsUrl && <ImageCard label="Initials" src={initialsUrl} />}
          {signatureUrl && <ImageCard label="Signature" src={signatureUrl} />}
          {referencePhotoUrls.map((url, i) => (
            <ImageCard key={i} label={`Reference ${i + 1}`} src={url} />
          ))}
        </div>
      </section>

      {/* Status & Notes */}
      <section className="bg-neutral-900 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Status</label>
          <select
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
          <label className="block text-sm text-neutral-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-400 resize-y"
            placeholder="Private notes about this booking..."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2 rounded-lg transition disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save"}
          </button>

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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 uppercase">{label}</p>
      <p className="text-neutral-200">{value || "—"}</p>
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
