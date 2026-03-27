import { Resend } from "resend";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");
  return new Resend(key);
}

const FROM = process.env.EMAIL_FROM || "bookings@starlettattoos.ink";
const TO = process.env.EMAIL_TO || "bookings@starlettattoos.ink";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendBookingEmail(
  booking: {
    fullName: string;
    email: string;
    phone: string;
    dob: string;
    tattooDescription: string;
    consentDate: string;
  },
  attachments: {
    consentForm: Buffer | Uint8Array;
    photoId?: Buffer | Uint8Array;
    referencePhotos?: (Buffer | Uint8Array)[];
  }
) {
  const emailAttachments: { filename: string; content: Buffer }[] = [
    {
      filename: `${booking.fullName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_")}_consent_form.png`,
      content: Buffer.from(attachments.consentForm),
    },
  ];

  if (attachments.photoId) {
    emailAttachments.push({
      filename: "photo_id.jpg",
      content: Buffer.from(attachments.photoId),
    });
  }

  if (attachments.referencePhotos) {
    attachments.referencePhotos.forEach((buf, i) => {
      emailAttachments.push({
        filename: `reference_${i + 1}.jpg`,
        content: Buffer.from(buf),
      });
    });
  }

  await getResend().emails.send({
    from: `Starlet Tattoos <${FROM}>`,
    to: [TO],
    replyTo: booking.email,
    subject: `New Booking Request — ${escapeHtml(booking.fullName)}`,
    html: `
      <h2>New Booking Request</h2>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Name</td><td>${escapeHtml(booking.fullName)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Email</td><td>${escapeHtml(booking.email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Phone</td><td>${escapeHtml(booking.phone)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">DOB</td><td>${escapeHtml(booking.dob)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;font-weight:bold">Consent Date</td><td>${escapeHtml(booking.consentDate)}</td></tr>
      </table>
      <h3>Tattoo Description</h3>
      <p>${escapeHtml(booking.tattooDescription)}</p>
      <p style="color:#888;font-size:12px">Consent form, photo ID, and reference photos are attached.</p>
    `,
    attachments: emailAttachments,
  });
}
