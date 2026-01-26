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
      <div className="relative bg-white bn-modal max-w-xl w-full mx-4 z-10">
        <button aria-label="Close" className="bn-modal-close" onClick={onClose}>
          ✕
        </button>
        <h3 className="bn-title">Book Now — Intake</h3>
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
          <div className="bn-grid">
            <label className="bn-field">
              <span className="bn-label">Full name</span>
              <input name="name" required className="bn-input" />
            </label>
            <label className="bn-field">
              <span className="bn-label">Email</span>
              <input name="email" type="email" required className="bn-input" />
            </label>
            <label className="bn-field">
              <span className="bn-label">Phone</span>
              <input name="phone" type="tel" className="bn-input" />
            </label>
            <label className="bn-field">
              <span className="bn-label">Preferred date</span>
              <input name="date" type="date" className="bn-input" />
            </label>
            <label className="bn-field">
              <span className="bn-label">Tattoo description / placement</span>
              <textarea name="desc" rows={4} className="bn-input bn-textarea" />
            </label>
            <label className="bn-consent">
              <input type="checkbox" name="consent" className="bn-checkbox" />
              <span className="bn-consent-txt">
                I agree to be contacted about this booking.
              </span>
            </label>
            <div className="bn-actions">
              <button type="submit" className="bn-btn bn-submit">
                Submit intake
              </button>
            </div>
          </div>
        </form>
      </div>

      <style jsx>{`
        .bn-modal {
          background: #fff;
          border: 1px solid #111;
          border-radius: 8px;
          padding: 28px;
          box-shadow: none;
        }
        .bn-title {
          font-size: 18px;
          font-weight: 600;
          color: #0b0b0b;
          margin: 0 0 12px 0;
        }
        .bn-grid {
          display: grid;
          gap: 12px;
        }
        .bn-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .bn-label {
          font-size: 13px;
          color: #111;
        }
        .bn-input {
          padding: 10px 12px;
          border: 1px solid #111;
          border-radius: 6px;
          background: transparent;
          color: #000;
          font-size: 15px;
        }
        .bn-textarea {
          min-height: 110px;
          resize: vertical;
        }
        .bn-consent {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 6px;
        }
        .bn-checkbox {
          width: 16px;
          height: 16px;
          border: 1px solid #111;
        }
        .bn-consent-txt {
          font-size: 13px;
          color: #111;
        }
        .bn-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 8px;
        }
        .bn-btn {
          padding: 10px 14px;
          border-radius: 6px;
          font-size: 15px;
          cursor: pointer;
          border: 1px solid #111;
          background: transparent;
          color: #111;
          transition:
            transform 140ms ease,
            box-shadow 160ms ease,
            background 160ms ease,
            color 160ms ease;
        }
        .bn-submit {
          background: linear-gradient(
            135deg,
            #f8e6e8,
            #f0c3c7 35%,
            #b76e79 65%,
            #f6d3d6
          );
          color: #fff;
          border-color: rgba(255, 255, 255, 0.06);
          box-shadow: 0 8px 28px rgba(183, 110, 121, 0.28);
          font-size: 18px;
          padding-left: 20px;
          padding-right: 20px;
        }
        .bn-submit:hover {
          transform: translateY(-2px);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
        }
        .bn-submit:active {
          transform: translateY(0);
        }
        .bn-submit:focus {
          outline: 3px solid rgba(255, 255, 255, 0.06);
          outline-offset: 2px;
        }
        .bn-cancel {
          background: transparent;
        }
        .bn-modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          border: none;
          background: transparent;
          font-size: 18px;
          line-height: 1;
          padding: 6px 8px;
          cursor: pointer;
          color: #111;
          border-radius: 6px;
        }
        .bn-modal-close:hover {
          background: rgba(0, 0, 0, 0.04);
        }
        .bn-modal-close:focus {
          outline: 2px solid rgba(0, 0, 0, 0.08);
        }

        @media (max-width: 640px) {
          .bn-modal {
            padding: 20px;
            margin: 12px;
          }
          .bn-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .bn-submit {
            width: 100%;
          }
          .bn-cancel {
            align-self: flex-end;
          }
        }
      `}</style>
    </div>
  );
}
