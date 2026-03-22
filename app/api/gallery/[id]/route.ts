import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  // Get image to find storage path
  const { data: image } = await supabase
    .from("gallery_images")
    .select("image_url")
    .eq("id", id)
    .single();

  // Delete from database
  const { error } = await supabase
    .from("gallery_images")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Try to delete from storage (extract path from URL)
  if (image?.image_url) {
    const match = image.image_url.match(/\/gallery\/(.+)$/);
    if (match) {
      await supabase.storage.from("gallery").remove([match[1]]);
    }
  }

  return NextResponse.json({ ok: true });
}
