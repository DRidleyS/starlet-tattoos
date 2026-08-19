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
    return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Get image to find storage path
    const { data: image } = await supabase
      .from("gallery_images")
      .select("image_url")
      .eq("id", id)
      .single();

    // The row goes first ON PURPOSE. If storage removal fails afterwards the
    // worst case is an orphaned file: invisible to visitors, costing only quota.
    // Removing the file first would instead risk a surviving row pointing at a
    // missing image, i.e. a broken picture on the public gallery.
    const { error } = await supabase
      .from("gallery_images")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Gallery delete error:", error);
      return NextResponse.json(
        { error: "Could not delete the image" },
        { status: 500 }
      );
    }

    // Try to delete from storage (extract path from URL)
    if (image?.image_url) {
      const match = image.image_url.match(/\/gallery\/(.+)$/);
      if (match) {
        // Result was previously discarded, so an orphan left no trace at all.
        // Still a success for the caller — the image IS gone from the site —
        // but the leak is now recorded, which matters while storage quota is a
        // live concern for this project.
        const { error: storageErr } = await supabase.storage
          .from("gallery")
          .remove([match[1]]);
        if (storageErr) {
          console.error(
            `Orphaned gallery file (row ${id} deleted, storage object ${match[1]} remains):`,
            storageErr
          );
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Gallery delete error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
