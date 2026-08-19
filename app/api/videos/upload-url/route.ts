import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

// This route hands out a signed URL to write into a PUBLIC bucket, so the
// extension is chosen from a fixed list rather than taken from the caller's
// filename. Anything else would make the studio's own domain a host for
// arbitrary files.
const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "m4v"];

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
