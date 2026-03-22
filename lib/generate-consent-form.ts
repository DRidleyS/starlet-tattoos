import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "public",
  "{name}_consent_form.PNG"
);

// Measured from the 1024x1536 template
const INITIALS_X = 48;
const INITIALS_W = 65;
const INITIALS_H = 18;

// Y positions for each of the 12 consent item blank lines
const INITIALS_Y = [
  348, // 1. not under influence
  371, // 2. not pregnant
  394, // 3. free of communicable disease
  417, // 4. over 18
  440, // 5. no acne/freckles/moles (wraps)
  486, // 6. viewed design, checked spelling (wraps)
  530, // 7. truthfully represented allergies (wraps)
  576, // 8. infection risk/aftercare (wraps)
  638, // 9. permanent change (wraps)
  684, // 10. my choice alone (wraps)
  727, // 11. inks not FDA approved (wraps)
  773, // 12. chance of feeling lightheaded (wraps)
];

// Bottom fields: x position where text starts (after label), y position
const FIELDS = {
  signature: { x: 135, y: 887, w: 380, h: 40 },
  procedureDescription: { x: 255, y: 934, maxW: 300 },
  printedFullName: { x: 210, y: 974, maxW: 340 },
  date: { x: 90, y: 1053, maxW: 200 },
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function generateConsentForm(data: {
  fullName: string;
  dob: string;
  consentDate: string;
  tattooDescription: string;
  initialsPngDataUrl: string | null;
  signaturePngDataUrl: string | null;
}): Promise<Buffer> {
  const templateBuf = await fs.readFile(TEMPLATE_PATH);
  const meta = await sharp(templateBuf).metadata();
  const width = meta.width!;
  const height = meta.height!;

  // Build SVG overlay
  const initialsImages = data.initialsPngDataUrl
    ? INITIALS_Y.map(
        (y) =>
          `<image href="${data.initialsPngDataUrl}" x="${INITIALS_X}" y="${y}" width="${INITIALS_W}" height="${INITIALS_H}" preserveAspectRatio="xMidYMid meet" />`
      ).join("\n")
    : "";

  const signatureImage = data.signaturePngDataUrl
    ? `<image href="${data.signaturePngDataUrl}" x="${FIELDS.signature.x}" y="${FIELDS.signature.y}" width="${FIELDS.signature.w}" height="${FIELDS.signature.h}" preserveAspectRatio="xMidYMid meet" />`
    : "";

  const description = escapeXml(
    data.tattooDescription.length > 60
      ? data.tattooDescription.slice(0, 57) + "..."
      : data.tattooDescription
  );

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${initialsImages}
  ${signatureImage}
  <text x="${FIELDS.procedureDescription.x}" y="${FIELDS.procedureDescription.y}" font-size="15" font-family="sans-serif" fill="#111">${description}</text>
  <text x="${FIELDS.printedFullName.x}" y="${FIELDS.printedFullName.y}" font-size="15" font-family="sans-serif" fill="#111">${escapeXml(data.fullName)}</text>
  <text x="${FIELDS.date.x}" y="${FIELDS.date.y}" font-size="15" font-family="sans-serif" fill="#111">${escapeXml(data.consentDate)}</text>
</svg>`;

  return sharp(templateBuf)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
