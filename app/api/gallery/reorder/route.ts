import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

// One statement is issued per id, so the list is bounded. Far above any gallery
// this studio will realistically have.
const MAX_IDS = 500;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServerClient();

    let orderedIds: unknown;
    try {
      ({ orderedIds } = await req.json());
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json(
        { error: "orderedIds required" },
        { status: 400 }
      );
    }
    if (orderedIds.length > MAX_IDS) {
      return NextResponse.json({ error: "Too many items" }, { status: 400 });
    }
    if (!orderedIds.every((id) => typeof id === "string" && UUID_RE.test(id))) {
      return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
    }

    const results = await Promise.all(
      (orderedIds as string[]).map((id, index) =>
        supabase.from("gallery_images").update({ sort_order: index }).eq("id", id)
      )
    );

    // Supabase reports a failed update in the result rather than by throwing,
    // so discarding these made every reorder report success. The admin page
    // now trusts a 2xx to mean the order was actually written, and reverts its
    // optimistic move otherwise — that trust has to be earned here.
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      console.error("Gallery reorder errors:", failed.map((r) => r.error));
      return NextResponse.json(
        { error: "Could not save the new order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Gallery reorder error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
