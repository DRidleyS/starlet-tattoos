import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import {
  CONSENT_ACK_LINE,
  CONSENT_INTRO,
  CONSENT_ITEMS,
  CONSENT_TITLE,
  STERILE_NOTE,
  STUDIO_INFO,
} from "./consent-content";

// US Letter, in PDF points (72pt = 1in).
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.45, 0.45, 0.45);
const HAIRLINE = rgb(0.8, 0.8, 0.8);
const RULE = rgb(0.6, 0.6, 0.6);

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
  const words = text
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

/** Move to a new page if `needed` points won't fit below the current cursor. */
function ensureSpace(doc: Doc, needed: number) {
  if (doc.cursor + needed > PAGE_H - MARGIN) addPage(doc);
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
  const size = opts.size ?? 10;
  const lineHeight = opts.lineHeight ?? size * 1.35;
  const color = opts.color ?? INK;
  ensureSpace(doc, lineHeight);
  let x = opts.x ?? MARGIN;
  if (opts.align === "center") {
    x = (PAGE_W - font.widthOfTextAtSize(text, size)) / 2;
  }
  doc.page.drawText(text, { x, y: PAGE_H - doc.cursor - size, size, font, color });
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
  const size = opts.size ?? 10;
  const maxWidth = opts.maxWidth ?? CONTENT_W;
  for (const line of wrapText(font, size, text, maxWidth)) {
    drawLine(doc, line, { ...opts, font, size });
  }
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

/** Draw an image scaled to fit a box, anchored to the box's bottom-left, preserving aspect. */
function drawImageInBox(
  page: PDFPage,
  image: PDFImage,
  box: { x: number; y: number; w: number; h: number }
) {
  const scale = Math.min(box.w / image.width, box.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: box.x + (box.w - w) / 2,
    y: box.y,
    width: w,
    height: h,
  });
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
  pdf.setTitle(`${CONSENT_TITLE} — ${data.fullName}`);
  pdf.setProducer("Starlet Tattoos booking");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const doc: Doc = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    font,
    bold,
    italic,
    cursor: MARGIN,
  };

  // Embed the client's initials / signature once; the initials are reused per clause.
  let initialsImage: PDFImage | null = null;
  if (data.initialsPngDataUrl) {
    const bytes = dataUrlToBytes(data.initialsPngDataUrl);
    if (bytes) {
      try {
        initialsImage = await pdf.embedPng(bytes);
      } catch {
        initialsImage = null;
      }
    }
  }

  let signatureImage: PDFImage | null = null;
  if (data.signaturePngDataUrl) {
    const bytes = dataUrlToBytes(data.signaturePngDataUrl);
    if (bytes) {
      try {
        signatureImage = await pdf.embedPng(bytes);
      } catch {
        signatureImage = null;
      }
    }
  }

  // ---- Header ---------------------------------------------------------------
  drawLine(doc, STUDIO_INFO.name, {
    font: bold,
    size: 20,
    lineHeight: 24,
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

  doc.cursor += 6;
  drawLine(doc, CONSENT_TITLE, {
    font: bold,
    size: 14,
    lineHeight: 18,
    align: "center",
  });
  drawDivider(doc, 8);

  // ---- Client + procedure ---------------------------------------------------
  const labelValue = (label: string, value: string) => {
    ensureSpace(doc, 16);
    const y = PAGE_H - doc.cursor - 10;
    doc.page.drawText(label, { x: MARGIN, y, size: 10, font: bold, color: MUTED });
    const labelW = bold.widthOfTextAtSize(label, 10);
    doc.page.drawText(value || "—", {
      x: MARGIN + labelW + 6,
      y,
      size: 10,
      font,
      color: INK,
    });
    doc.cursor += 16;
  };

  labelValue("Client name:", data.fullName);
  labelValue("Date of birth:", formatDate(data.dob));

  doc.cursor += 4;
  drawLine(doc, "Tattoo / procedure description", {
    font: bold,
    size: 10,
    lineHeight: 14,
    color: MUTED,
  });
  drawParagraph(doc, data.tattooDescription?.trim() || "—", {
    size: 10,
    lineHeight: 14,
  });

  drawDivider(doc, 8);

  // ---- Intro ----------------------------------------------------------------
  drawParagraph(doc, CONSENT_INTRO, { size: 10, lineHeight: 14.5 });
  doc.cursor += 6;
  drawLine(doc, "Please initial each statement below.", {
    font: bold,
    size: 10.5,
    lineHeight: 16,
  });
  doc.cursor += 4;

  // ---- Initialled statements -----------------------------------------------
  const CLAUSE_SIZE = 10;
  const CLAUSE_LH = 13.5;
  const BOX_W = 44;
  const BOX_H = 16;
  const GAP = 14;
  const textX = MARGIN + BOX_W + GAP;
  const textMaxW = CONTENT_W - BOX_W - GAP;

  CONSENT_ITEMS.forEach((item, i) => {
    const numbered = `${i + 1}.  ${item.text}`;
    const lines = wrapText(font, CLAUSE_SIZE, numbered, textMaxW);
    const textH = lines.length * CLAUSE_LH;
    const rowH = Math.max(textH, BOX_H) + 10;

    // Keep each statement (text + initials box) together on one page.
    ensureSpace(doc, rowH);
    const rowTop = doc.cursor;

    lines.forEach((line, li) => {
      doc.page.drawText(line, {
        x: textX,
        y: PAGE_H - (rowTop + li * CLAUSE_LH) - CLAUSE_SIZE,
        size: CLAUSE_SIZE,
        font,
        color: INK,
      });
    });

    // Initials box: a baseline aligned with the first text line, image centered on it.
    const baselineY = PAGE_H - rowTop - BOX_H;
    doc.page.drawLine({
      start: { x: MARGIN, y: baselineY },
      end: { x: MARGIN + BOX_W, y: baselineY },
      thickness: 0.75,
      color: HAIRLINE,
    });
    if (initialsImage) {
      drawImageInBox(doc.page, initialsImage, {
        x: MARGIN,
        y: baselineY + 1.5,
        w: BOX_W,
        h: BOX_H - 1.5,
      });
    }

    doc.cursor = rowTop + rowH;
  });

  doc.cursor += 2;
  drawParagraph(doc, STERILE_NOTE, {
    font: italic,
    size: 9.5,
    lineHeight: 13,
    color: MUTED,
  });

  // ---- Signature block (kept together) --------------------------------------
  doc.cursor += 10;
  ensureSpace(doc, 150);
  drawDivider(doc, 6);

  drawParagraph(doc, CONSENT_ACK_LINE, { size: 10, lineHeight: 14 });
  doc.cursor += 14;

  const SIG_W = 240;
  const SIG_H = 46;
  const sigTop = doc.cursor;
  const sigLineY = PAGE_H - sigTop - SIG_H;

  // Signature line (left).
  doc.page.drawLine({
    start: { x: MARGIN, y: sigLineY },
    end: { x: MARGIN + SIG_W, y: sigLineY },
    thickness: 0.75,
    color: RULE,
  });
  if (signatureImage) {
    drawImageInBox(doc.page, signatureImage, {
      x: MARGIN,
      y: sigLineY + 2,
      w: SIG_W,
      h: SIG_H - 2,
    });
  }
  doc.page.drawText("Signature", {
    x: MARGIN,
    y: sigLineY - 12,
    size: 8.5,
    font,
    color: MUTED,
  });

  // Date line (right).
  const dateX = MARGIN + SIG_W + 40;
  const dateW = PAGE_W - MARGIN - dateX;
  doc.page.drawText(formatDate(data.consentDate), {
    x: dateX,
    y: sigLineY + 4,
    size: 11,
    font,
    color: INK,
  });
  doc.page.drawLine({
    start: { x: dateX, y: sigLineY },
    end: { x: dateX + dateW, y: sigLineY },
    thickness: 0.75,
    color: RULE,
  });
  doc.page.drawText("Date", {
    x: dateX,
    y: sigLineY - 12,
    size: 8.5,
    font,
    color: MUTED,
  });

  doc.cursor = sigTop + SIG_H + 22;

  // Printed name for the record.
  labelValue("Printed name:", data.fullName);

  // ---- Studio / practitioner (official) -------------------------------------
  // Every field prints its configured value, or a labeled blank line to fill in by
  // hand. Address/phone appear in the header letterhead when configured, so they only
  // get a fill-in line here when they are left blank.
  const officialRows: Array<[string, string]> = [];
  if (!STUDIO_INFO.address.trim()) officialRows.push(["Studio address:", ""]);
  if (!STUDIO_INFO.phone.trim()) officialRows.push(["Studio phone:", ""]);
  officialRows.push(["County:", STUDIO_INFO.county]);
  officialRows.push(["Facility permit #:", STUDIO_INFO.facilityPermitNo]);
  officialRows.push(["Practitioner registration #:", STUDIO_INFO.practitionerRegNo]);
  officialRows.push(["Artist / practitioner:", STUDIO_INFO.artistName]);

  doc.cursor += 6;
  drawDivider(doc, 6);
  drawLine(doc, "Studio details", { font: bold, size: 9, lineHeight: 14, color: MUTED });

  officialRows.forEach(([label, value]) => {
    ensureSpace(doc, 18);
    const y = PAGE_H - doc.cursor - 10;
    doc.page.drawText(label, { x: MARGIN, y, size: 9.5, font, color: MUTED });
    const labelW = font.widthOfTextAtSize(label, 9.5);
    const lineStartX = MARGIN + labelW + 6;
    const lineEndX = PAGE_W - MARGIN;
    if (value.trim()) {
      doc.page.drawText(value.trim(), {
        x: lineStartX,
        y,
        size: 9.5,
        font,
        color: INK,
      });
    } else {
      // Blank line to fill in by hand.
      doc.page.drawLine({
        start: { x: lineStartX, y: y - 2 },
        end: { x: lineEndX, y: y - 2 },
        thickness: 0.5,
        color: HAIRLINE,
      });
    }
    doc.cursor += 18;
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
