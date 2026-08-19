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
  "By signing this form, I acknowledge that I have been given a full opportunity to ask " +
  "any and all questions about receiving a tattoo from Starlet Tattoos, and that all of " +
  "my questions have been answered to my complete satisfaction. I have been advised of " +
  "the facts and matters set forth below, and I agree as follows:";

/**
 * The statements the client initials. Keys are stable identifiers; the order is
 * the order shown on screen and printed on the form.
 */
export const CONSENT_ITEMS: ConsentItem[] = [
  {
    key: "over18",
    text:
      "I am at least 18 years of age, as required by California law, and I have provided " +
      "valid government-issued photo identification confirming my identity and age.",
  },
  {
    key: "notUnderInfluence",
    text: "I am not under the influence of drugs or alcohol.",
  },
  {
    key: "notPregnant",
    text: "To the best of my knowledge, I am not pregnant or nursing.",
  },
  {
    key: "noCommunicableDisease",
    text: "To the best of my knowledge, I am free of any communicable disease.",
  },
  {
    key: "skinDisclosed",
    text:
      "The area to be tattooed is free of acne, moles, rashes, sunburn, and other skin " +
      "conditions — or, if it is not, I have discussed this with the artist, and I " +
      "understand the artist may decline to tattoo over affected skin.",
  },
  {
    key: "designApproved",
    text:
      "I have reviewed and approved the final design, including its spelling, placement, " +
      "and size, and I give my full consent to its application.",
  },
  {
    key: "allergiesDisclosed",
    text:
      "I have truthfully disclosed to the artist any allergies — including to pigments, " +
      "dyes, latex, soaps, or antibiotics — and any medical conditions relevant to this " +
      "procedure.",
  },
  {
    key: "infectionRiskUnderstood",
    text:
      "I understand that infection is a risk of any tattoo, particularly if I do not " +
      "follow the aftercare instructions I am given. I have been advised of the signs of " +
      "infection — including excessive redness, swelling, tenderness, or discharge — and " +
      "I agree to seek medical attention if they appear.",
  },
  {
    key: "permanentChangeUnderstood",
    text:
      "I understand that a tattoo is a permanent change to my appearance, and that no " +
      "promises have been made to me about the ability to later remove or alter it. " +
      "Removal, if attempted, is difficult, costly, and may be incomplete.",
  },
  {
    key: "inksNotFdaApproved",
    text:
      "I understand that tattoo inks, dyes, and pigments have not been approved by the " +
      "U.S. Food and Drug Administration, and that adverse reactions, though rare, are " +
      "possible.",
  },
  {
    key: "lightheadedRiskUnderstood",
    text:
      "I understand that I may feel lightheaded, dizzy, or faint during or after the " +
      "procedure, and I agree to tell the artist immediately if I feel unwell.",
  },
  {
    key: "sterileEquipment",
    text:
      "I understand that single-use, pre-sterilized needles and equipment are used for " +
      "this procedure.",
  },
  {
    key: "voluntaryChoice",
    text:
      "Receiving this tattoo is my choice alone. I am acting of my own free will, and I " +
      "voluntarily consent to the procedure.",
  },
  {
    key: "risksAssumed",
    text:
      "Having been informed of the potential risks associated with getting a tattoo — " +
      "including but not limited to infection, allergic reaction, scarring, and fading — " +
      "I still wish to proceed, and I freely accept and expressly assume any and all " +
      "risks that may arise from tattooing.",
  },
];

/** Final acknowledgment printed directly above the signature line. */
export const CONSENT_ACK_LINE =
  "I have read this form in its entirety, I understand and agree to each statement " +
  "above, and I am signing it freely and voluntarily.";
