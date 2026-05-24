import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const supabase = createServerClient();

  const { data: video } = await supabase
    .from("videos")
    .select("video_url")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("videos").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (video?.video_url) {
    const match = video.video_url.match(/\/videos\/(.+)$/);
    if (match) {
      await supabase.storage.from("videos").remove([match[1]]);
    }
  }

  return NextResponse.json({ ok: true });
}
