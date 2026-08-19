import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

// This route hands out a signed URL to write into a PUBLIC bucket, so the
// extension is chosen from a fixed list rather than taken from the caller's
// filename. Anything else would make the studio's own domain a host for
// arbitrary files.
//
// `mov` is deliberately ABSENT. The admin uploader now rewrites QuickTime to
// MP4 before uploading (lib/video-remux.ts), so a .mov arriving here means that
// step was bypassed — and storing it would put a video on the homepage that
// Chrome renders as a black rectangle. Refused by name rather than quietly
// renamed to .mp4, because an extension that misdescribes its own bytes is how
// this problem started.
const VIDEO_EXTENSIONS = ["mp4", "webm", "m4v"];
const QUICKTIME_EXTENSIONS = ["mov", "qt"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    let filename: string | undefined;
    try {
      ({ filename } = await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const requested = (filename?.split(".").pop() || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (QUICKTIME_EXTENSIONS.includes(requested)) {
      return NextResponse.json(
        {
          error:
            "QuickTime video can't be published as-is — most browsers refuse to play it. Please re-choose the file so it can be converted, or upload an MP4.",
        },
        { status: 400 }
      );
    }
    const ext = VIDEO_EXTENSIONS.includes(requested) ? requested : "mp4";
    const id = crypto.randomUUID();
    const path = `${id}.${ext}`;

    const supabase = createServerClient();
    const { data, error } = await supabase.storage
      .from("videos")
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("Signed upload url error:", error);
      return NextResponse.json(
        { error: "Could not start the upload" },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("videos").getPublicUrl(path);

    return NextResponse.json({
      id,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl,
    });
  } catch (err) {
    console.error("Signed upload url error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
