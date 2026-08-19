import { Resend } from "resend";
import {
  PRE_APPOINTMENT_INSTRUCTIONS,
  AFTERCARE_INSTRUCTIONS,
  AFTERCARE_CLOSING_LINES,
  FOLLOWUP_DELAY_DAYS,
} from "./appointment-content";
import { siteUrl } from "./site-url";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("Missing RESEND_API_KEY");
  return new Resend(key);
}

const FROM = process.env.EMAIL_FROM || "bookings@starlettattoos.ink";
// Replies from clients (questions, healed photos) should land in the studio inbox.
const STUDIO_INBOX = process.env.EMAIL_TO || "bookings@starlettattoos.ink";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/* Styled after the studio's printed aftercare card: cream paper, serif type,
   script-style headings, and four-pointed-star bullets. Inline styles only —
   email clients strip <style> blocks. */

const SERIF = "Georgia, 'Times New Roman', serif";
const SCRIPT = "'Snell Roundhand', 'Brush Script MT', 'Segoe Script', cursive";

function heading(text: string): string {
  return `
    <div style="text-align:center;margin:0 0 6px">
      <div style="font-family:${SCRIPT};font-size:30px;line-height:1.25;color:#111">${text}</div>
      <div style="font-size:12px;color:#111;letter-spacing:4px;margin-top:2px">&#9670;</div>
    </div>`;
}

function instructionList(items: string[]): string {
  return items
    .map(
      (item, i) => `
        <tr>
          <td style="vertical-align:top;padding:${i === 0 ? 14 : 7}px 10px 7px 0;font-size:14px;color:#111">&#10022;</td>
          <td style="vertical-align:top;padding:${i === 0 ? 14 : 7}px 0 7px;font-family:${SERIF};font-size:16px;line-height:1.5;color:#111">${escapeHtml(item)}</td>
        </tr>`
    )
    .join("");
}

function emailShell(body: string): string {
  return `
  <div style="background:#f5f2ea;padding:32px 12px">
    <div style="max-width:560px;margin:0 auto;background:#fffdf7;border:1px solid #e3ddcd;border-radius:14px;padding:36px 30px;font-family:${SERIF};color:#111">
      ${body}
      <div style="border-top:1px solid #e3ddcd;margin-top:30px;padding-top:18px;text-align:center">
        <div style="font-family:${SCRIPT};font-size:24px;color:#111">Starlet Tattoos</div>
      </div>
    </div>
  </div>`;
}

function buttonLink(href: string, label: string): string {
  return `
    <div style="text-align:center;margin:0 0 6px">
      <a href="${escapeHtml(href)}"
         style="display:inline-block;background:#111;color:#fffdf7;font-family:${SERIF};font-size:15px;text-decoration:none;padding:12px 28px;border-radius:999px">
        ${escapeHtml(label)}
      </a>
    </div>`;
}

/** Exported for preview/testing as well as sending. */
export function buildPreAppointmentEmailHtml(fullName: string): string {
  const name = escapeHtml(firstName(fullName));

  return emailShell(`
    <p style="font-size:16px;line-height:1.6;margin:0 0 8px">Hi ${name},</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 24px">
      Thank you for your booking request — it's been received, and I'll be in
      touch soon to confirm the details of your appointment. In the meantime,
      here's how to get ready.
    </p>

    ${heading("Pre-Appointment Instructions")}
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 28px">
      ${instructionList(PRE_APPOINTMENT_INSTRUCTIONS)}
    </table>

    ${heading("Tattoo Aftercare Instructions")}
    <p style="font-size:13px;color:#8a8371;text-align:center;margin:6px 0 0">
      For after your session — keep these handy.
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 10px">
      ${instructionList(AFTERCARE_INSTRUCTIONS)}
    </table>
    ${AFTERCARE_CLOSING_LINES.map(
      (line) =>
        `<p style="font-family:${SCRIPT};font-size:20px;text-align:center;margin:10px 0 0;color:#111">${escapeHtml(line)}</p>`
    ).join("")}
  `);
}

/**
 * Confirmation sent to the client right after they submit the booking funnel:
 * thanks them, sets expectations, and delivers the pre-appointment instructions
 * (plus the aftercare card to save for after the session).
 */
export async function sendPreAppointmentEmail(booking: {
  fullName: string;
  email: string;
}) {
  const html = buildPreAppointmentEmailHtml(booking.fullName);

  const { error } = await getResend().emails.send({
    from: `Starlet Tattoos <${FROM}>`,
    to: [booking.email],
    replyTo: STUDIO_INBOX,
    subject: "Your booking request ✦ How to prepare for your appointment",
    html,
  });

  if (error) {
    throw new Error(`Pre-appointment email failed: ${error.message}`);
  }
}

/** Exported for preview/testing as well as sending. */
export function buildHealingFollowupEmailHtml(
  fullName: string,
  bookingId: string
): string {
  const name = escapeHtml(firstName(fullName));
  const uploadUrl = `${siteUrl()}/healed/${bookingId}`;
  const reviewLink = process.env.REVIEW_LINK;

  const reviewSection = reviewLink
    ? `
      <p style="font-size:16px;line-height:1.6;margin:0 0 18px">
        And if you enjoyed your experience, a quick review would mean the world:
      </p>
      ${buttonLink(reviewLink, "Leave a review")}`
    : `
      <p style="font-size:16px;line-height:1.6;margin:0 0 6px">
        And if you have a minute, I'd love to hear how your experience was —
        there's a spot for a note when you send your photos.
      </p>`;

  return emailShell(`
    ${heading("How's Your Tattoo Healing?")}
    <p style="font-size:16px;line-height:1.6;margin:18px 0 8px">Hi ${name},</p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px">
      It's been about two weeks since your session — I hope you're loving your
      new tattoo!
    </p>
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px">
      I'd love to see how it healed. Tap below to send me a photo or two —
      healed photos come straight to me, and they'll never be shared anywhere
      without asking you first.
    </p>
    ${buttonLink(uploadUrl, "Send me your healed photos")}
    <p style="font-size:13px;color:#8a8371;text-align:center;margin:10px 0 22px">
      This private link is just for you.
    </p>
    ${reviewSection}
    <p style="font-family:${SCRIPT};font-size:20px;text-align:center;margin:24px 0 0;color:#111">
      Thank you for trusting me with your skin!
    </p>
  `);
}

/**
 * Schedules the healed-photo + review check-in via Resend's scheduled sending
 * (no cron needed). Called when a booking is marked completed; the email goes
 * out FOLLOWUP_DELAY_DAYS later. Returns the Resend email id so the schedule
 * can be cancelled, plus the send time for display in the admin portal.
 */
export async function scheduleHealingFollowupEmail(booking: {
  bookingId: string;
  fullName: string;
  email: string;
}): Promise<{ emailId: string; scheduledFor: Date }> {
  const scheduledFor = new Date(
    Date.now() + FOLLOWUP_DELAY_DAYS * 24 * 60 * 60 * 1000
  );
  const html = buildHealingFollowupEmailHtml(booking.fullName, booking.bookingId);

  const { data, error } = await getResend().emails.send({
    from: `Starlet Tattoos <${FROM}>`,
    to: [booking.email],
    replyTo: STUDIO_INBOX,
    subject: "How's your tattoo healing? ✦ Starlet Tattoos",
    html,
    scheduledAt: scheduledFor.toISOString(),
  });

  if (error || !data?.id) {
    throw new Error(
      `Couldn't schedule the follow-up email: ${error?.message ?? "no email id returned"}`
    );
  }

  return { emailId: data.id, scheduledFor };
}

/** Cancels a not-yet-sent scheduled email (e.g. booking un-completed or deleted). */
export async function cancelScheduledEmail(emailId: string) {
  const { error } = await getResend().emails.cancel(emailId);
  if (error) {
    throw new Error(`Couldn't cancel the scheduled email: ${error.message}`);
  }
}
