import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

const MAX_TITLE_CHARS = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The stored url is rendered directly as a <video src> on the PUBLIC homepage,
 * so it is pinned to this project's own storage bucket. Previously any string
 * was accepted and echoed onto the live site, which would let a caller point
 * the homepage's video at an arbitrary third-party host.
 */
function isOwnStorageUrl(url: string): boolean {
  const base = process.env.SUPABASE_URL;
  if (!base) return false;
  try {
    const target = new URL(url);
    const expected = new URL(base);
    return (
      target.origin === expected.origin &&
      target.pathname.startsWith("/storage/v1/object/public/")
    );
  } catch {
    return false;
  }
}

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    // Public endpoint (the homepage carousel reads it) — no schema details.
    console.error("Video list error:", error);
    return NextResponse.json(
      { error: "Could not load videos" },
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

    let body: { id?: string; video_url?: string; title?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!body?.id || !body?.video_url) {
      return NextResponse.json(
        { error: "id and video_url required" },
        { status: 400 }
      );
    }
    if (!UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "Invalid video id" }, { status: 400 });
    }
    if (!isOwnStorageUrl(body.video_url)) {
      return NextResponse.json(
        { error: "Video url must point at this site's own storage" },
        { status: 400 }
      );
    }
    const title =
      typeof body.title === "string"
        ? body.title.slice(0, MAX_TITLE_CHARS)
        : null;

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
        title,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (dbErr) {
      console.error("Video insert error:", dbErr);
      return NextResponse.json(
        { error: "Could not save the video" },
        { status: 500 }
      );
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("Video create error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
