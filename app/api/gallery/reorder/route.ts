import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServerClient();
  const { orderedIds } = (await req.json()) as { orderedIds: string[] };

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return NextResponse.json({ error: "orderedIds required" }, { status: 400 });
  }

  // Update sort_order for each image
  const updates = orderedIds.map((id, index) =>
    supabase
      .from("gallery_images")
      .update({ sort_order: index })
      .eq("id", id)
  );

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}
