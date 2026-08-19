import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    const { data: video } = await supabase
      .from("videos")
      .select("video_url")
      .eq("id", id)
      .single();

    // Row first: an orphaned file costs quota, whereas a surviving row pointing
    // at a deleted file would show a broken player on the public homepage.
    const { error } = await supabase.from("videos").delete().eq("id", id);

    if (error) {
      console.error("Video delete error:", error);
      return NextResponse.json(
        { error: "Could not delete the video" },
        { status: 500 }
      );
    }

    if (video?.video_url) {
      const match = video.video_url.match(/\/videos\/(.+)$/);
      if (match) {
        // Videos are the largest objects this project stores, so a silently
        // orphaned one is the most expensive kind of leak against a quota that
        // is already a live concern.
        const { error: storageErr } = await supabase.storage
          .from("videos")
          .remove([match[1]]);
        if (storageErr) {
          console.error(
            `Orphaned video file (row ${id} deleted, storage object ${match[1]} remains):`,
            storageErr
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Video delete error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
