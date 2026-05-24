import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { filename } = (await req.json()) as { filename?: string };

  const ext = (filename?.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = crypto.randomUUID();
  const path = `${id}.${ext || "mp4"}`;

  const supabase = createServerClient();
  const { data, error } = await supabase.storage
    .from("videos")
    .createSignedUploadUrl(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create signed url" },
      { status: 500 }
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("videos").getPublicUrl(path);

  return NextResponse.json({
    id,
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl,
  });
}
