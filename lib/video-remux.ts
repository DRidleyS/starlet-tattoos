/**
 * Turns an H.264-in-QuickTime recording into a genuine MP4 — without re-encoding
 * a single frame.
 *
 * WHY THIS EXISTS
 * Phones record `.mov`. Supabase stores that with `Content-Type: video/quicktime`,
 * and Chrome reports `canPlayType("video/quicktime") === ""` — not supported, in
 * every form, including the H.264 that is actually inside. So the studio's videos
 * rendered as black rectangles for most visitors while playing fine in Safari,
 * which is why it went unnoticed.
 *
 * WHAT WAS ACTUALLY WRONG (measured, not assumed)
 * The studio's files are `ftyp` brand `qt  ` carrying codec `avc1` — plain H.264.
 * Chrome can decode those bytes; it refuses them on the strength of the container
 * declaration alone. MP4 and MOV are both ISO base media format, so this is a
 * REMUX (a header rewrite), not a transcode. No quality is lost and no frame is
 * touched.
 *
 * HOW
 * `ftyp` is the first box in the file and only declares which specs the file
 * claims to follow. Rewriting it to `mp42`/`isom` is enough — and it is written
 * at EXACTLY the original byte length on purpose, because chunk offsets in the
 * `stco` table are absolute positions into the file. Change the length and every
 * one of them silently points at the wrong bytes.
 *
 * Only the header is read into memory. The payload is passed through by
 * reference via Blob slicing, so a 4K video costs a few hundred bytes of work.
 */

const QUICKTIME_TYPES = ["video/quicktime", "video/x-quicktime"];

/** Brands used to fill the compatible-brands list, in preference order. */
const MP4_COMPATIBLE_BRANDS = ["isom", "mp41", "avc1", "iso2"];

export type PreparedVideo = {
  /** What to upload. Identical bytes to the original except for the ftyp box. */
  blob: Blob;
  /** Filename to store under, with the extension matching the real contents. */
  filename: string;
  /** Content type to send — the header that decides whether Chrome will play it. */
  contentType: string;
  /** True when the container was rewritten from QuickTime to MP4. */
  remuxed: boolean;
};

export class UnplayableVideoError extends Error {}

function looksLikeQuickTime(file: File): boolean {
  return (
    QUICKTIME_TYPES.includes(file.type.toLowerCase()) ||
    /\.(mov|qt)$/i.test(file.name)
  );
}

function withMp4Extension(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".mp4";
}

/**
 * Rewrites the ftyp box to declare MP4 compatibility, preserving byte length.
 * Returns null when the file does not begin with an ftyp box we can safely
 * rewrite — in that case the caller leaves the bytes alone rather than guessing.
 */
async function remuxQuickTimeHeader(file: File): Promise<Blob | null> {
  const headerBytes = await file.slice(0, 64).arrayBuffer();
  if (headerBytes.byteLength < 16) return null;

  const view = new DataView(headerBytes);
  const boxSize = view.getUint32(0);
  const boxType = new TextDecoder("latin1").decode(
    new Uint8Array(headerBytes, 4, 4)
  );
  if (boxType !== "ftyp") return null;

  // 8 header + 4 major brand + 4 minor version, then 4 bytes per compatible brand.
  if (boxSize < 20 || boxSize % 4 !== 0 || boxSize > 64) return null;
  const compatibleSlots = (boxSize - 16) / 4;

  const ftyp = new Uint8Array(boxSize);
  const out = new DataView(ftyp.buffer);
  const ascii = (text: string, at: number) => {
    for (let i = 0; i < 4; i++) ftyp[at + i] = text.charCodeAt(i);
  };

  out.setUint32(0, boxSize);
  ascii("ftyp", 4);
  ascii("mp42", 8); // major brand
  out.setUint32(12, 0); // minor version
  for (let i = 0; i < compatibleSlots; i++) {
    ascii(MP4_COMPATIBLE_BRANDS[i % MP4_COMPATIBLE_BRANDS.length], 16 + i * 4);
  }

  // Everything after ftyp is passed through untouched, by reference.
  return new Blob([ftyp, file.slice(boxSize)], { type: "video/mp4" });
}

/**
 * Looks for an HEVC/H.265 sample entry in the metadata.
 *
 * The browser check below cannot carry this on its own, because it answers for
 * the browser doing the uploading: Safari plays HEVC happily, so an owner on a
 * Mac or iPhone would sail through it and publish a video that is black for
 * every Chrome visitor. This check is browser-independent, so the two together
 * mean "playable here" AND "playable generally".
 *
 * `moov` sits near the front in phone recordings, so a 2MB window over each end
 * of the file finds the sample table without reading the whole thing.
 */
async function detectHevc(blob: Blob): Promise<boolean> {
  const WINDOW = 2 * 1024 * 1024;
  const chunks = [blob.slice(0, Math.min(WINDOW, blob.size))];
  if (blob.size > WINDOW) chunks.push(blob.slice(Math.max(0, blob.size - WINDOW)));

  const decoder = new TextDecoder("latin1");
  for (const chunk of chunks) {
    const text = decoder.decode(await chunk.arrayBuffer());
    if (text.includes("hvc1") || text.includes("hev1")) return true;
    // An H.264 sample entry settles it; no need to read the tail.
    if (text.includes("avc1")) return false;
  }
  return false;
}

/**
 * Asks the browser's own decoder whether a blob is playable, which is a far
 * better test than parsing codec boxes by hand: it catches corrupt files and
 * anything else this build of the browser cannot render, without us having to
 * enumerate them.
 */
function canBrowserPlay(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const probe = document.createElement("video");
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      probe.removeAttribute("src");
      probe.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };

    probe.preload = "metadata";
    probe.muted = true;
    // A readable file reports real dimensions; a decodable-but-empty one does not.
    probe.onloadedmetadata = () => finish(probe.videoWidth > 0);
    probe.onerror = () => finish(false);
    // Never hang the upload on a decoder that stalls.
    window.setTimeout(() => finish(false), 15000);
    probe.src = url;
  });
}

/**
 * Prepares any chosen video for upload: converts QuickTime to MP4 when it can,
 * then refuses anything this browser cannot play rather than storing a file that
 * will show visitors a black rectangle.
 */
export async function prepareVideoForUpload(
  file: File
): Promise<PreparedVideo> {
  let prepared: PreparedVideo = {
    blob: file,
    filename: file.name,
    contentType: file.type || "video/mp4",
    remuxed: false,
  };

  if (looksLikeQuickTime(file)) {
    const remuxed = await remuxQuickTimeHeader(file);
    if (remuxed) {
      prepared = {
        blob: remuxed,
        filename: withMp4Extension(file.name),
        contentType: "video/mp4",
        remuxed: true,
      };
    }
  }

  // Checked before the browser probe so the message can name the real cause
  // instead of a generic failure — and so a browser that CAN play HEVC still
  // refuses to publish one.
  if (await detectHevc(prepared.blob)) {
    throw new UnplayableVideoError(
      "This video is recorded in HEVC, which Chrome can't play — visitors would " +
        'see a black rectangle. On iPhone: Settings > Camera > Formats > "Most ' +
        'Compatible" and re-record, or export this clip as MP4 (H.264).'
    );
  }

  if (!(await canBrowserPlay(prepared.blob))) {
    throw new UnplayableVideoError(
      "This video can't be played by web browsers. Please upload an MP4 (H.264)."
    );
  }

  return prepared;
}
