/**
 * Single source of truth for the tattoo consent & release form copy.
 *
 * Both the on-screen checklist in the booking funnel (`components/BookingFunnel.tsx`)
 * and the generated PDF (`lib/generate-consent-form.ts`) import from here, so the
 * statements a client initials on screen are guaranteed to match the statements on
 * the signed document.
 */

export type ConsentItem = { key: string; text: string };

/**
 * Studio / practitioner details printed on the consent form.
 *
 * Fill these in to make the form official. California tattoo studios register under
 * the Safe Body Art Act with their county health department — the facility permit and
 * practitioner registration numbers below come from that registration. Any field left
 * as an empty string is printed as a blank line for handwriting.
 */
export const STUDIO_INFO = {
  /** Public-facing studio name (used in the header and intro). */
  name: "Starlet Tattoos",
  /** Registered legal/business name, if different from `name`. */
  legalName: "",
  /** Street, city, CA, ZIP — where the work is performed. */
  address: "",
  /** Studio phone number. */
  phone: "",
  /** Public contact email (optional). */
  email: "",
  /** County whose health department the studio is registered with. */
  county: "",
  /** Body art facility permit number (issued by the county health department). */
  facilityPermitNo: "",
  /** Practitioner registration number (issued by the county health department). */
  practitionerRegNo: "",
  /** Name of the artist / practitioner performing the work. */
  artistName: "",
};

export const CONSENT_TITLE = "Tattoo Consent & Release Form";

export const CONSENT_INTRO =
  "By signing this release form, I acknowledge that I have been given a full opportunity to " +
  "ask any and all questions I may have about obtaining a tattoo from Starlet Tattoos, and " +
  "that all of my questions have been answered to my complete satisfaction. I specifically " +
  "acknowledge that I have been advised of the facts and matters set forth below, and I agree " +
  "as follows:";

/**
 * The twelve statements the client initials. Keys are stable identifiers; the order is
 * the order shown on screen and printed on the form.
 */
export const CONSENT_ITEMS: ConsentItem[] = [
  {
    key: "notUnderInfluence",
    text: "I am not under the influence of drugs or alcohol.",
  },
  {
    key: "notPregnant",
    text: "I am not pregnant or nursing (where applicable).",
  },
  {
    key: "noCommunicableDisease",
    text: "To the best of my knowledge, I am free of any communicable disease.",
  },
  {
    key: "over18",
    text: "I am at least 18 years of age, the legal age to be tattooed in California.",
  },
  {
    key: "noIrritatedSkin",
    text:
      "I have disclosed any skin conditions in the area to be tattooed, and I understand the " +
      "artist may decline to tattoo over moles, raised, irritated, broken, or sunburned skin.",
  },
  {
    key: "designApproved",
    text:
      "I have reviewed and approved the final design, including its spelling, placement, and " +
      "size, and I understand that once the tattoo is started it cannot be undone.",
  },
  {
    key: "allergiesDisclosed",
    text: "I have truthfully disclosed any allergies and relevant medical conditions.",
  },
  {
    key: "infectionRiskUnderstood",
    text:
      "I understand that infection is a risk of any tattoo, and I agree to follow all aftercare " +
      "instructions I am given.",
  },
  {
    key: "permanentChangeUnderstood",
    text:
      "I understand that a tattoo is a permanent modification to my body, and that removal " +
      "is difficult, costly, and may be incomplete.",
  },
  {
    key: "choiceAndConsent",
    text: "I am getting this tattoo of my own free will and voluntarily consent to the procedure.",
  },
  {
    key: "inksNotFdaApproved",
    text:
      "I understand that tattoo inks and pigments are not FDA-approved, and that reactions, " +
      "though rare, are possible.",
  },
  {
    key: "lightheadedRiskUnderstood",
    text: "I understand that I may feel lightheaded, dizzy, or faint during or after the procedure.",
  },
];

/** Reassurance line about equipment, printed near the statements. */
export const STERILE_NOTE =
  "Single-use, pre-sterilized equipment is used for every tattoo application.";

/** Final acknowledgment printed directly above the signature line. */
export const CONSENT_ACK_LINE =
  "I have read this form in full, I understand it, and by signing below I agree to all of " +
  "the statements above.";
