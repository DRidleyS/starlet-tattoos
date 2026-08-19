"use client";

import { useEffect, useRef, useState } from "react";

const ACCENT = "#b76e79";
const MAX_PHOTOS = 6;

export default function HealedUpload({
  bookingId,
  reviewLink,
}: {
  bookingId: string;
  reviewLink: string | null;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setError(null);
    const images = Array.from(incoming).filter((f) =>
      f.type.startsWith("image/")
    );
    setFiles((prev) => [...prev, ...images].slice(0, MAX_PHOTOS));
  };

  const removeFile = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const submit = async () => {
    if (submitting || files.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("bookingId", bookingId);
      formData.append("message", message);
      for (const f of files) formData.append("photos", f);

      const res = await fetch("/api/healed-photos", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        let details = "Something went wrong — please try again.";
        try {
          const body = await res.json();
          if (body.error) details = body.error;
        } catch {
          // keep the generic message
        }
        throw new Error(details);
      }
      setDone(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong — please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
        <div className="text-2xl" aria-hidden>
          ✦
        </div>
        <div className="mt-2 text-lg font-semibold text-black">
          Thank you so much!
        </div>
        <p className="mt-2 text-sm text-black/60">
          Your healed photos are on their way to me. They&apos;ll never be
          shared anywhere without asking you first.
        </p>
        {reviewLink && (
          <a
            href={reviewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            Leave a review
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center">
        <div className="text-2xl" aria-hidden>
          ✦
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-black">
          Share your healed tattoo
        </h1>
        <p className="mt-2 text-sm text-black/60">
          I&apos;d love to see how it healed! These photos come straight to me
          at Starlet Tattoos — they won&apos;t be shared anywhere without
          asking you first.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white px-5 py-5 shadow-[0_10px_24px_rgba(0,0,0,0.06)]">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {previews.length > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            {previews.map((src, i) => (
              <div key={src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Photo ${i + 1}`}
                  className="h-24 w-full rounded-lg object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black text-xs text-white shadow"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={files.length >= MAX_PHOTOS}
          className="w-full rounded-xl border border-dashed border-black/25 px-4 py-6 text-sm text-black/60 transition hover:border-black/40 hover:text-black/80 disabled:opacity-50"
        >
          {files.length === 0
            ? "Tap to add photos"
            : files.length >= MAX_PHOTOS
              ? `${MAX_PHOTOS} photos max`
              : "Add another photo"}
        </button>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Anything you'd like to add? How it healed, how your experience was..."
          className="mt-4 w-full resize-y rounded-xl border border-black/10 px-4 py-3 text-sm text-black outline-none placeholder:text-black/35 focus:border-black/30"
        />

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={submitting || files.length === 0}
          className="mt-4 w-full rounded-full px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: ACCENT }}
        >
          {submitting ? "Sending..." : "Send to Starlet Tattoos"}
        </button>
      </div>
    </div>
  );
}
