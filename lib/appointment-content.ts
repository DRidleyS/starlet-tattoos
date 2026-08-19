/**
 * Single source of truth for the pre-appointment and aftercare instruction copy.
 *
 * The booking funnel success screen (`components/BookingFunnel.tsx`) and the
 * client-facing emails (`lib/send-client-emails.ts`) both import from here, so
 * what a client sees on screen always matches what lands in their inbox.
 */

export const PRE_APPOINTMENT_INSTRUCTIONS = [
  "Eat a full meal before your appointment.",
  "Stay hydrated.",
  "Avoid alcohol for 24 hours before your appointment.",
  "Wear comfortable clothing that allows easy access to the tattoo area.",
];

export const AFTERCARE_INSTRUCTIONS = [
  "Keep your tattoo covered with the bandage provided for 2–24 hours.",
  "Gently wash with lukewarm water and fragrance-free soap.",
  "Pat dry with a clean paper towel.",
  "Apply a thin layer of recommended ointment or lotion.",
  "Keep your tattoo clean and moisturized.",
  "Do not pick, scratch, or peel.",
  "Avoid soaking in water (baths, pools, hot tubs, etc.) for 2 weeks.",
  "Avoid direct sun exposure and tanning.",
];

export const AFTERCARE_CLOSING_LINES = [
  "Proper aftercare helps your tattoo heal beautifully!",
  "Thank you for trusting me with your skin!",
];

/** Days after a booking is marked completed before the healed-photo/review follow-up email goes out. */
export const FOLLOWUP_DELAY_DAYS = 14;
