/**
 * Repairs videos already stored as QuickTime so browsers will play them.
 *
 * The homepage videos are H.264 inside a `.mov` container, served with
 * `Content-Type: video/quicktime`. Chrome refuses that content type outright —
 * `canPlayType("video/quicktime")` returns "" — so visitors see black
 * rectangles. The bytes themselves are fine.
 *
 * This rewrites the 20-byte `ftyp` header to declare MP4 and re-uploads under a
 * `.mp4` path with `Content-Type: video/mp4`. No frame is re-encoded and no
 * quality is lost. The header is written at EXACTLY its original length because
 * `stco` chunk offsets are absolute positions into the file.
 *
 * SAFETY
 *  - Dry run by default. Pass --apply to make changes.
 *  - Additive: the original .mov object is left in place, so the old URL keeps
 *    working and this is reversible by pointing the row back at it.
 *  - Each row is only updated AFTER its new object uploads successfully.
 *
 * USAGE
 *   node scripts/fix-quicktime-videos.mjs            # census, changes nothing
 *   node scripts/fix-quicktime-videos.mjs --apply    # perform the repair
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from .env.local).
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { writeFileSync } from "fs";

loadEnvConfig(process.cwd(), true);

const APPLY = process.argv.includes("--apply");
const BUCKET = "videos";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Add them to .env.local (they are the same values as in Vercel)."
  );
  process.exit(1);
}
const supabase = createClient(url, key);

/** Same header rewrite as lib/video-remux.ts, kept byte-length identical. */
function remuxToMp4(buf) {
  const size = buf.readUInt32BE(0);
  if (buf.toString("latin1", 4, 8) !== "ftyp") return null;
  if (size < 20 || size % 4 !== 0 || size > 64) return null;

  const brands = ["isom", "mp41", "avc1", "iso2"];
  const ftyp = Buffer.alloc(size);
  ftyp.writeUInt32BE(size, 0);
  ftyp.write("ftyp", 4, "latin1");
  ftyp.write("mp42", 8, "latin1");
  ftyp.writeUInt32BE(0, 12);
  for (let i = 0; i < (size - 16) / 4; i++) {
    ftyp.write(brands[i % brands.length], 16 + i * 4, "latin1");
  }
  const out = Buffer.concat([ftyp, buf.subarray(size)]);
  return out.length === buf.length ? out : null;
}

function isHevc(buf) {
  const window = buf.subarray(0, Math.min(buf.length, 4 * 1024 * 1024));
  const text = window.toString("latin1");
  if (text.includes("avc1")) return false;
  return text.includes("hvc1") || text.includes("hev1");
}

const { data: rows, error } = await supabase
  .from("videos")
  .select("id, video_url, sort_order")
  .order("sort_order", { ascending: true });

if (error) {
  console.error("Could not read the videos table:", error.message);
  process.exit(1);
}

const needsWork = rows.filter((r) => /\.(mov|qt)(\?|$)/i.test(r.video_url || ""));

console.log(`videos in table: ${rows.length}`);
console.log(`QuickTime rows:  ${needsWork.length}`);
console.log(APPLY ? "\nMODE: APPLY (writing changes)\n" : "\nMODE: DRY RUN (nothing will change)\n");

const report = [];

for (const row of needsWork) {
  const oldPath = decodeURIComponent(
    row.video_url.split(`/${BUCKET}/`).pop().split("?")[0]
  );
  const newPath = oldPath.replace(/\.[^.]+$/, "") + ".mp4";

  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(oldPath);
  if (dlErr) {
    console.log(`SKIP  ${oldPath} - download failed: ${dlErr.message}`);
    report.push({ id: row.id, oldPath, action: "skip", reason: dlErr.message });
    continue;
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const mb = (buf.length / 1024 / 1024).toFixed(1);

  if (isHevc(buf)) {
    console.log(`SKIP  ${oldPath} (${mb} MB) - HEVC, needs a real re-encode, not a remux`);
    report.push({ id: row.id, oldPath, action: "skip", reason: "hevc" });
    continue;
  }

  const fixed = remuxToMp4(buf);
  if (!fixed) {
    console.log(`SKIP  ${oldPath} (${mb} MB) - unrecognised ftyp box`);
    report.push({ id: row.id, oldPath, action: "skip", reason: "no ftyp" });
    continue;
  }

  if (!APPLY) {
    console.log(`WOULD ${oldPath} (${mb} MB) -> ${newPath}  [video/mp4]`);
    report.push({ id: row.id, oldPath, newPath, action: "would-fix" });
    continue;
  }

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(newPath, fixed, { contentType: "video/mp4", upsert: true });
  if (upErr) {
    console.log(`FAIL  ${oldPath} - upload failed: ${upErr.message}`);
    report.push({ id: row.id, oldPath, action: "fail", reason: upErr.message });
    continue;
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(newPath);
  const { error: dbErr } = await supabase
    .from("videos")
    .update({ video_url: pub.publicUrl })
    .eq("id", row.id);
  if (dbErr) {
    console.log(`FAIL  ${oldPath} - row update failed: ${dbErr.message}`);
    report.push({ id: row.id, oldPath, action: "fail", reason: dbErr.message });
    continue;
  }

  console.log(`FIXED ${oldPath} (${mb} MB) -> ${newPath}`);
  report.push({ id: row.id, oldPath, newPath, action: "fixed" });
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = `quicktime-video-repair-${APPLY ? "apply" : "dryrun"}-${stamp}.json`;
writeFileSync(file, JSON.stringify(report, null, 2));
console.log(`\nreport written to ${file}`);
if (!APPLY && needsWork.length) {
  console.log("Re-run with --apply to perform the repair.");
}
