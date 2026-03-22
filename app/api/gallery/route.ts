import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("gallery_images")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const category = (form.get("category") as string) || "gallery";
  const altText = (form.get("altText") as string) || "";

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const storagePath = `${category}/${id}.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from("gallery")
    .upload(storagePath, buf, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
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
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(row, { status: 201 });
}
