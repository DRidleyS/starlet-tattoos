"use client";
import React, { useEffect, useRef } from "react";

export default function BookNowModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal
      role="dialog"
    >
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg max-w-xl w-full mx-4 p-6 z-10">
        <h3 className="text-lg font-semibold mb-3">Book Now — Intake</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget as HTMLFormElement);
            const payload: Record<string, any> = {};
            fd.forEach((v, k) => (payload[k] = v));
            // Attempt to send via EmailJS if environment variables are provided
            const serviceId = process.env.NEXT_PUBLIC_EMAILJS_SERVICE_ID;
            const templateId = process.env.NEXT_PUBLIC_EMAILJS_TEMPLATE_ID;
            const publicKey = process.env.NEXT_PUBLIC_EMAILJS_PUBLIC_KEY;

            try {
              if (serviceId && templateId && publicKey) {
                const res = await fetch(
                  "https://api.emailjs.com/api/v1.0/email/send",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      service_id: serviceId,
                      template_id: templateId,
                      user_id: publicKey,
                      template_params: payload,
                    }),
                  },
                );
                if (!res.ok) throw new Error(`EmailJS error ${res.status}`);
                alert("Thanks — your intake was sent.");
              } else {
                console.log("Booking payload (no EmailJS config):", payload);
                alert(
                  "Thanks — intake recorded (dev). Set EmailJS env vars to send for real.",
                );
              }
            } catch (err) {
              console.error(err);
              alert(
                "There was an error sending your intake. Check the console.",
              );
            }

            onClose();
          }}
        >
          <div className="grid grid-cols-1 gap-3">
            <label className="flex flex-col">
              <span className="text-sm text-gray-700">Full name</span>
              <input name="name" required className="mt-1 p-2 border rounded" />
            </label>
            <label className="flex flex-col">
              <span className="text-sm text-gray-700">Email</span>
              <input
                name="email"
                type="email"
                required
                className="mt-1 p-2 border rounded"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm text-gray-700">Phone</span>
              <input
                name="phone"
                type="tel"
                className="mt-1 p-2 border rounded"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm text-gray-700">Preferred date</span>
              <input
                name="date"
                type="date"
                className="mt-1 p-2 border rounded"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-sm text-gray-700">
                Tattoo description / placement
              </span>
              <textarea
                name="desc"
                rows={4}
                className="mt-1 p-2 border rounded"
              />
            </label>
            <label className="flex items-center gap-2 mt-2">
              <input type="checkbox" name="consent" />
              <span className="text-sm text-gray-600">
                I agree to be contacted about this booking.
              </span>
            </label>
            <div className="flex gap-3 justify-end mt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded border"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-rose-600 text-white"
              >
                Submit intake
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
