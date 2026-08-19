import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import sharp from "sharp";
import {
  CONSENT_ACK_LINE,
  CONSENT_INTRO,
  CONSENT_ITEMS,
  CONSENT_TITLE,
  STUDIO_INFO,
} from "./consent-content";
import { CONSENT_LOGO_JPEG_BASE64 } from "./consent-logo";

// US Letter, in PDF points (72pt = 1in).
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const FOOTER_H = 30; // reserved band at the bottom of every page
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.42, 0.42, 0.42);
const HAIRLINE = rgb(0.78, 0.78, 0.78);
const RULE = rgb(0.55, 0.55, 0.55);

type Doc = {
  pdf: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  /** Distance, in points, from the top of the current page to the next baseline area. */
  cursor: number;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Format an ISO `YYYY-MM-DD` value as e.g. "June 27, 2026"; pass anything else through. */
function formatDate(value?: string | null): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value.trim();
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return value.trim();
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

/**
 * The PDF standard fonts only encode WinAnsi (Latin-1 plus common typographic
 * marks). Client-typed text (names, tattoo descriptions) can contain anything —
 * emoji included — and pdf-lib throws on unencodable characters, which would
 * fail the whole booking. Map or drop everything outside the encodable set.
 */
const WINANSI_EXTRA = new Set(
  "‘’‚“”„–—…•†‡" +
    "ˆ˜‰‹›ŒœŠšŽžŸƒ€™"
);
function sanitizeText(input: string | null | undefined): string {
  const out: string[] = [];
  for (const ch of (input ?? "").replace(/\s+/g, " ")) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x20 && code <= 0x7e) out.push(ch);
    else if (code >= 0xa1 && code <= 0xff) out.push(ch);
    else if (WINANSI_EXTRA.has(ch)) out.push(ch);
    else if (ch === " ") out.push(" ");
    else if (ch === "−") out.push("-");
    // anything else (emoji, dingbats, non-Latin scripts) is dropped
  }
  return out.join("").replace(/ {2,}/g, " ").trim();
}

/** Split a single token that is wider than `maxWidth` into character-level chunks. */
function breakLongWord(
  font: PDFFont,
  size: number,
  word: string,
  maxWidth: number
): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let chunk = "";
  for (const ch of word) {
    const candidate = chunk + ch;
    if (chunk && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      parts.push(chunk);
      chunk = ch;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) parts.push(chunk);
  return parts;
}

/** Greedy word-wrap that respects the font's real glyph widths. */
function wrapText(
  font: PDFFont,
  size: number,
  text: string,
  maxWidth: number
): string[] {
  const words = sanitizeText(text)
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => breakLongWord(font, size, w, maxWidth));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function addPage(doc: Doc) {
  doc.page = doc.pdf.addPage([PAGE_W, PAGE_H]);
  doc.cursor = MARGIN;
}

/** Move to a new page if `needed` points won't fit above the footer band. */
function ensureSpace(doc: Doc, needed: number) {
  if (doc.cursor + needed > PAGE_H - MARGIN - FOOTER_H) addPage(doc);
}

/** Draw a single line of text at the current cursor and advance by `lineHeight`. */
function drawLine(
  doc: Doc,
  text: string,
  opts: {
    font?: PDFFont;
    size?: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
    x?: number;
    align?: "left" | "center";
  } = {}
) {
  const font = opts.font ?? doc.font;
  const size = opts.size ?? 10.5;
  const lineHeight = opts.lineHeight ?? size * 1.4;
  const color = opts.color ?? INK;
  const clean = sanitizeText(text);
  ensureSpace(doc, lineHeight);
  let x = opts.x ?? MARGIN;
  if (opts.align === "center") {
    x = (PAGE_W - font.widthOfTextAtSize(clean, size)) / 2;
  }
  doc.page.drawText(clean, {
    x,
    y: PAGE_H - doc.cursor - size,
    size,
    font,
    color,
  });
  doc.cursor += lineHeight;
}

/** Word-wrap and draw a paragraph, advancing the cursor line by line. */
function drawParagraph(
  doc: Doc,
  text: string,
  opts: {
    font?: PDFFont;
    size?: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
    x?: number;
    maxWidth?: number;
    align?: "left" | "center";
  } = {}
) {
  const font = opts.font ?? doc.font;
  const size = opts.size ?? 10.5;
  const maxWidth = opts.maxWidth ?? CONTENT_W;
  for (const line of wrapText(font, size, text, maxWidth)) {
    drawLine(doc, line, { ...opts, font, size });
  }
}

/** Centered ornament: a hairline broken by a small solid diamond, like the studio's card. */
function drawOrnament(doc: Doc, width = 220, gap = 9) {
  doc.cursor += gap;
  ensureSpace(doc, 8);
  const midY = PAGE_H - doc.cursor - 3;
  const startX = (PAGE_W - width) / 2;
  const d = 3.2; // diamond half-size
  const cx = PAGE_W / 2;
  doc.page.drawLine({
    start: { x: startX, y: midY },
    end: { x: cx - d - 6, y: midY },
    thickness: 0.6,
    color: RULE,
  });
  doc.page.drawLine({
    start: { x: cx + d + 6, y: midY },
    end: { x: startX + width, y: midY },
    thickness: 0.6,
    color: RULE,
  });
  doc.page.drawSvgPath(`M ${d} 0 L ${d * 2} ${d} L ${d} ${d * 2} L 0 ${d} Z`, {
    x: cx - d,
    y: midY + d,
    color: INK,
  });
  doc.cursor += 8 + gap;
}

function drawDivider(doc: Doc, gap = 8) {
  doc.cursor += gap;
  ensureSpace(doc, 1);
  const y = PAGE_H - doc.cursor;
  doc.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color: HAIRLINE,
  });
  doc.cursor += gap;
}

/** Decode a `data:image/png;base64,...` URL to raw bytes for embedding. */
function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return null;
  const base64 = dataUrl.slice(comma + 1);
  if (!base64) return null;
  try {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

/**
 * Embed a signature-pad PNG with its empty margins cropped away.
 *
 * The pads export the full canvas (display size x devicePixelRatio) with the ink
 * somewhere inside a sea of transparency. Scaling that whole canvas into a small
 * box is what used to make initials land as tiny marks in odd spots — trimming
 * first means the ink itself is what gets fitted to the box.
 */
async function embedInkPng(
  pdf: PDFDocument,
  dataUrl: string | null
): Promise<PDFImage | null> {
  if (!dataUrl) return null;
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes) return null;

  let png: Buffer = Buffer.from(bytes);
  try {
    const trimmed = await sharp(png).trim({ threshold: 12 }).png().toBuffer();
    const meta = await sharp(trimmed).metadata();
    if ((meta.width ?? 0) > 2 && (meta.height ?? 0) > 2) png = trimmed;
  } catch {
    // e.g. a fully blank canvas — fall back to the untrimmed image
  }

  try {
    return await pdf.embedPng(png);
  } catch {
    return null;
  }
}

/** Draw an image scaled to fit a box, anchored to the box's bottom-left, preserving aspect. */
function drawImageInBox(
  page: PDFPage,
  image: PDFImage,
  box: { x: number; y: number; w: number; h: number },
  anchor: "left" | "center" = "center"
) {
  const scale = Math.min(box.w / image.width, box.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: anchor === "center" ? box.x + (box.w - w) / 2 : box.x,
    y: box.y,
    width: w,
    height: h,
  });
}

/**
 * A labeled fill-in field: the value (if any) sits on a rule, with a small
 * caption underneath. `topY` is the cursor-space distance to the field's top;
 * returns the field's total height.
 */
function drawField(
  doc: Doc,
  opts: {
    x: number;
    w: number;
    topY: number;
    label: string;
    value?: string;
    valueSize?: number;
    inkH?: number; // vertical room above the rule (for signatures)
    image?: PDFImage | null;
  }
): number {
  const inkH = opts.inkH ?? 16;
  const valueSize = opts.valueSize ?? 11;
  const ruleY = PAGE_H - (opts.topY + inkH);

  if (opts.image) {
    drawImageInBox(
      doc.page,
      opts.image,
      { x: opts.x + 4, y: ruleY + 2, w: opts.w - 8, h: inkH - 2 },
      "left"
    );
  } else if (opts.value) {
    doc.page.drawText(sanitizeText(opts.value), {
      x: opts.x + 2,
      y: ruleY + 4,
      size: valueSize,
      font: doc.font,
      color: INK,
    });
  }

  doc.page.drawLine({
    start: { x: opts.x, y: ruleY },
    end: { x: opts.x + opts.w, y: ruleY },
    thickness: 0.75,
    color: RULE,
  });
  doc.page.drawText(opts.label, {
    x: opts.x,
    y: ruleY - 11,
    size: 7.5,
    font: doc.font,
    color: MUTED,
  });

  return inkH + 14;
}

export async function generateConsentForm(data: {
  fullName: string;
  dob: string;
  consentDate: string;
  tattooDescription: string;
  initialsPngDataUrl: string | null;
  signaturePngDataUrl: string | null;
}): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${CONSENT_TITLE} — ${data.fullName || STUDIO_INFO.name}`);
  pdf.setProducer("Starlet Tattoos booking");

  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);

  const doc: Doc = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    font,
    bold,
    italic,
    cursor: 44,
  };

  const initialsImage = await embedInkPng(pdf, data.initialsPngDataUrl);
  const signatureImage = await embedInkPng(pdf, data.signaturePngDataUrl);

  // ---- Header: script logo (typeset fallback), title, ornament ---------------
  let logoDrawn = false;
  try {
    const logo = await pdf.embedJpg(
      Buffer.from(CONSENT_LOGO_JPEG_BASE64, "base64")
    );
    const w = 128;
    const h = (logo.height / logo.width) * w;
    doc.page.drawImage(logo, {
      x: (PAGE_W - w) / 2,
      y: PAGE_H - doc.cursor - h,
      width: w,
      height: h,
    });
    doc.cursor += h + 14;
    logoDrawn = true;
  } catch {
    // fall through to the typeset name
  }
  if (!logoDrawn) {
    drawLine(doc, STUDIO_INFO.name, {
      font: bold,
      size: 22,
      lineHeight: 26,
      align: "center",
    });
    doc.cursor += 4;
  }

  drawLine(doc, CONSENT_TITLE, {
    font: bold,
    size: 15,
    lineHeight: 19,
    align: "center",
  });

  const contactBits = [STUDIO_INFO.address, STUDIO_INFO.phone, STUDIO_INFO.email]
    .map((s) => s.trim())
    .filter(Boolean);
  if (contactBits.length) {
    drawLine(doc, contactBits.join("   •   "), {
      size: 9,
      lineHeight: 13,
      color: MUTED,
      align: "center",
    });
  }
  drawOrnament(doc);

  // ---- Client + procedure ----------------------------------------------------
  {
    const top = doc.cursor;
    const h1 = drawField(doc, {
      x: MARGIN,
      w: 300,
      topY: top,
      label: "CLIENT NAME",
      value: data.fullName,
    });
    const h2 = drawField(doc, {
      x: MARGIN + 330,
      w: CONTENT_W - 330,
      topY: top,
      label: "DATE OF BIRTH",
      value: formatDate(data.dob),
    });
    doc.cursor = top + Math.max(h1, h2) + 8;
  }

  drawLine(doc, "DESCRIPTION OF PROCEDURE", {
    size: 7.5,
    lineHeight: 12,
    color: MUTED,
  });
  if (data.tattooDescription?.trim()) {
    drawParagraph(doc, data.tattooDescription, {
      size: 10.5,
      lineHeight: 14.5,
    });
  } else {
    // Blank form: fill-in rules for handwriting.
    for (let i = 0; i < 2; i++) {
      ensureSpace(doc, 18);
      doc.cursor += 14;
      doc.page.drawLine({
        start: { x: MARGIN, y: PAGE_H - doc.cursor },
        end: { x: PAGE_W - MARGIN, y: PAGE_H - doc.cursor },
        thickness: 0.75,
        color: RULE,
      });
      doc.cursor += 4;
    }
  }

  drawDivider(doc, 9);

  // ---- Intro -----------------------------------------------------------------
  drawParagraph(doc, CONSENT_INTRO, { size: 10.5, lineHeight: 15 });
  doc.cursor += 8;
  drawLine(doc, "Please initial each of the following statements:", {
    font: bold,
    size: 11,
    lineHeight: 16,
  });
  doc.cursor += 4;

  // ---- Initialled statements -------------------------------------------------
  const CLAUSE_SIZE = 10.5;
  const CLAUSE_LH = 14;
  const INIT_W = 48; // initials rule width
  const INIT_H = 16; // ink room above the rule
  const GAP = 16;
  const numX = MARGIN + INIT_W + GAP;
  const NUM_W = 20; // hanging-indent column for "1."
  const textX = numX + NUM_W;
  const textMaxW = PAGE_W - MARGIN - textX;

  CONSENT_ITEMS.forEach((item, i) => {
    const lines = wrapText(font, CLAUSE_SIZE, item.text, textMaxW);
    const textH = lines.length * CLAUSE_LH;
    const rowH = Math.max(textH, INIT_H + 2) + 9;

    // Keep each statement (text + initials rule) together on one page.
    ensureSpace(doc, rowH);
    const rowTop = doc.cursor;

    doc.page.drawText(`${i + 1}.`, {
      x: numX,
      y: PAGE_H - rowTop - CLAUSE_SIZE,
      size: CLAUSE_SIZE,
      font: bold,
      color: INK,
    });
    lines.forEach((line, li) => {
      doc.page.drawText(line, {
        x: textX,
        y: PAGE_H - (rowTop + li * CLAUSE_LH) - CLAUSE_SIZE,
        size: CLAUSE_SIZE,
        font,
        color: INK,
      });
    });

    // Initials rule, its top edge aligned with the statement's first line.
    const ruleY = PAGE_H - rowTop - INIT_H;
    doc.page.drawLine({
      start: { x: MARGIN, y: ruleY },
      end: { x: MARGIN + INIT_W, y: ruleY },
      thickness: 0.75,
      color: RULE,
    });
    if (initialsImage) {
      drawImageInBox(doc.page, initialsImage, {
        x: MARGIN + 3,
        y: ruleY + 1.5,
        w: INIT_W - 6,
        h: INIT_H - 2,
      });
    }

    doc.cursor = rowTop + rowH;
  });

  // ---- Acknowledgment + signature block (kept together) ----------------------
  const ackLines = wrapText(italic, 10.5, CONSENT_ACK_LINE, CONTENT_W);
  const SIG_INK_H = 40;
  const sigBlockH =
    18 + ackLines.length * 15 + 12 + (SIG_INK_H + 14) + 18 + 30;
  ensureSpace(doc, sigBlockH);

  drawDivider(doc, 9);
  drawParagraph(doc, CONSENT_ACK_LINE, {
    font: italic,
    size: 10.5,
    lineHeight: 15,
  });
  doc.cursor += 12;

  {
    const top = doc.cursor;
    const h1 = drawField(doc, {
      x: MARGIN,
      w: 300,
      topY: top,
      label: "CLIENT SIGNATURE",
      image: signatureImage,
      inkH: SIG_INK_H,
    });
    const h2 = drawField(doc, {
      x: MARGIN + 330,
      w: CONTENT_W - 330,
      topY: top,
      label: "DATE",
      value: formatDate(data.consentDate),
      inkH: SIG_INK_H,
    });
    doc.cursor = top + Math.max(h1, h2) + 18;
  }
  {
    const top = doc.cursor;
    const h1 = drawField(doc, {
      x: MARGIN,
      w: 300,
      topY: top,
      label: "PRINTED NAME",
      value: data.fullName,
    });
    const h2 = drawField(doc, {
      x: MARGIN + 330,
      w: CONTENT_W - 330,
      topY: top,
      label: "ARTIST SIGNATURE",
    });
    doc.cursor = top + Math.max(h1, h2) + 10;
  }

  // ---- Studio / practitioner (official) --------------------------------------
  // California Safe Body Art Act details. Configured values print; blanks become
  // fill-in lines. Address/phone appear in the letterhead when configured, so
  // they only need a line here when left blank.
  const officialFields: Array<[string, string]> = [];
  if (!STUDIO_INFO.address.trim()) officialFields.push(["STUDIO ADDRESS", ""]);
  if (!STUDIO_INFO.phone.trim()) officialFields.push(["STUDIO PHONE", ""]);
  officialFields.push(["COUNTY", STUDIO_INFO.county]);
  officialFields.push(["FACILITY PERMIT #", STUDIO_INFO.facilityPermitNo]);
  officialFields.push([
    "PRACTITIONER REGISTRATION #",
    STUDIO_INFO.practitionerRegNo,
  ]);
  officialFields.push(["ARTIST / PRACTITIONER", STUDIO_INFO.artistName]);

  const officialRowCount = Math.ceil(officialFields.length / 2);
  ensureSpace(doc, 34 + officialRowCount * 32);
  drawDivider(doc, 8);
  drawLine(doc, "STUDIO USE", { size: 7.5, lineHeight: 13, color: MUTED });
  doc.cursor += 2;

  const COL_W = (CONTENT_W - 30) / 2;
  for (let r = 0; r < officialRowCount; r++) {
    const top = doc.cursor;
    const left = officialFields[r * 2];
    const right = officialFields[r * 2 + 1];
    let h = drawField(doc, {
      x: MARGIN,
      w: COL_W,
      topY: top,
      label: left[0],
      value: left[1].trim(),
      valueSize: 10,
      inkH: 14,
    });
    if (right) {
      const h2 = drawField(doc, {
        x: MARGIN + COL_W + 30,
        w: COL_W,
        topY: top,
        label: right[0],
        value: right[1].trim(),
        valueSize: 10,
        inkH: 14,
      });
      h = Math.max(h, h2);
    }
    doc.cursor = top + h + 6;
  }

  // ---- Footer on every page --------------------------------------------------
  const pages = pdf.getPages();
  const clientBit = data.fullName.trim()
    ? `Client: ${sanitizeText(data.fullName)}`
    : "";
  pages.forEach((page, i) => {
    const y = 30;
    page.drawLine({
      start: { x: MARGIN, y: y + 12 },
      end: { x: PAGE_W - MARGIN, y: y + 12 },
      thickness: 0.5,
      color: HAIRLINE,
    });
    page.drawText(`${STUDIO_INFO.name} • ${CONSENT_TITLE}`, {
      x: MARGIN,
      y,
      size: 7.5,
      font,
      color: MUTED,
    });
    const pageLabel = `Page ${i + 1} of ${pages.length}`;
    page.drawText(pageLabel, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(pageLabel, 7.5),
      y,
      size: 7.5,
      font,
      color: MUTED,
    });
    if (clientBit && pages.length > 1) {
      page.drawText(clientBit, {
        x: (PAGE_W - font.widthOfTextAtSize(clientBit, 7.5)) / 2,
        y,
        size: 7.5,
        font,
        color: MUTED,
      });
    }
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
