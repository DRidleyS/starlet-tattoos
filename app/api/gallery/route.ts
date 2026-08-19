import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

const MAX_DIM = 1600;
const JPEG_QUALITY = 80;

// Generous: the owner uploads straight off a camera or phone and sharp shrinks
// the result anyway. This only exists to stop an accidental enormous file from
// being buffered whole into memory.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_ALT_TEXT_CHARS = 500;

// `category` becomes a STORAGE PATH SEGMENT below, so it is matched against a
// fixed list rather than sanitised. An arbitrary string here would let a caller
// steer writes elsewhere in the bucket and would put junk categories in the
// table that neither public gallery would ever render.
const CATEGORIES = ["gallery", "flash"] as const;

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("gallery_images")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    // This endpoint is PUBLIC — both galleries fetch it — so the database's own
    // message (table and column names, constraint text) must not be echoed back.
    console.error("Gallery list error:", error);
    return NextResponse.json(
      { error: "Could not load the gallery" },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServerClient();
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const rawCategory = (form.get("category") as string) || "gallery";
    const altText = ((form.get("altText") as string) || "").slice(
      0,
      MAX_ALT_TEXT_CHARS
    );

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `That image is too large (max ${Math.round(
            MAX_UPLOAD_BYTES / (1024 * 1024)
          )}MB).`,
        },
        { status: 400 }
      );
    }
    if (!(CATEGORIES as readonly string[]).includes(rawCategory)) {
      return NextResponse.json({ error: "Unknown category" }, { status: 400 });
    }
    const category = rawCategory;

    const id = crypto.randomUUID();
    const storagePath = `${category}/${id}.jpg`;

    // Decoding doubles as the type check: anything that is not really an image
    // fails here and is answered as a 400 rather than an opaque 500.
    let buf: Buffer;
    try {
      buf = await sharp(Buffer.from(await file.arrayBuffer()))
        .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
    } catch {
      return NextResponse.json(
        { error: "That file isn't a readable image" },
        { status: 400 }
      );
    }

    const { error: uploadErr } = await supabase.storage
      .from("gallery")
      .upload(storagePath, buf, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadErr) {
      console.error("Gallery upload error:", uploadErr);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("gallery").getPublicUrl(storagePath);

    // Get the max sort_order for this category
    const { data: maxRow } = await supabase
      .from("gallery_images")
      .select("sort_order")
      .eq("category", category)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxRow?.sort_order ?? -1) + 1;

    const { data: row, error: dbErr } = await supabase
      .from("gallery_images")
      .insert({
        id,
        category,
        image_url: publicUrl,
        alt_text: altText,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (dbErr) {
      // The file is already in the bucket but no row points at it; drop it
      // rather than leaving an orphan the owner can never see or delete.
      console.error("Gallery insert error:", dbErr);
      await supabase.storage.from("gallery").remove([storagePath]);
      return NextResponse.json(
        { error: "Could not save the image" },
        { status: 500 }
      );
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("Gallery upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
