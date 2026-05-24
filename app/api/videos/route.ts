import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServerClient();
  const body = (await req.json()) as {
    id?: string;
    video_url?: string;
    title?: string;
  };

  if (!body.id || !body.video_url) {
    return NextResponse.json(
      { error: "id and video_url required" },
      { status: 400 }
    );
  }

  const { data: maxRow } = await supabase
    .from("videos")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data: row, error: dbErr } = await supabase
    .from("videos")
    .insert({
      id: body.id,
      video_url: body.video_url,
      title: body.title ?? null,
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json(row, { status: 201 });
}
