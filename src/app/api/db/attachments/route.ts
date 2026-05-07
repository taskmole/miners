import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getTokenFromRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const placeId = request.nextUrl.searchParams.get("place_id");
  if (!placeId) {
    return NextResponse.json({ error: "place_id query param required" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabase(token);

    const { data, error } = await supabase
      .from("poi_attachments")
      .select("id, place_id, name, type, storage_path, size, added_at, uploaded_by, uploaded_by_name")
      .eq("place_id", placeId);

    if (error) {
      console.error("[api/db/attachments] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (err) {
    console.error("[api/db/attachments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, ...data } = body;
    const supabase = createServerSupabase(token);

    if (action === "upsert_metadata") {
      if (!data.row) {
        return NextResponse.json({ error: "row object is required" }, { status: 400 });
      }

      const { error } = await supabase
        .from("poi_attachments")
        .upsert(data.row, { onConflict: "id" });

      if (error) {
        console.error("[api/db/attachments] upsert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "signed_upload_url") {
      if (!data.path) {
        return NextResponse.json({ error: "path is required" }, { status: 400 });
      }

      const { data: urlData, error } = await supabase.storage
        .from("attachments")
        .createSignedUploadUrl(data.path);

      if (error) {
        console.error("[api/db/attachments] signed upload URL error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(urlData);
    }

    if (action === "signed_read_url") {
      if (!data.path) {
        return NextResponse.json({ error: "path is required" }, { status: 400 });
      }

      const { data: urlData, error } = await supabase.storage
        .from("attachments")
        .createSignedUrl(data.path, 3600);

      if (error) {
        console.error("[api/db/attachments] signed read URL error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(urlData);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/db/attachments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, storage_path } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createServerSupabase(token);

    const { error: metaError } = await supabase
      .from("poi_attachments")
      .delete()
      .eq("id", id);

    if (metaError) {
      console.error("[api/db/attachments] delete metadata error:", metaError);
      return NextResponse.json({ error: metaError.message }, { status: 500 });
    }

    // Best-effort storage cleanup (metadata already deleted, so don't fail on storage error)
    if (storage_path) {
      const { error: storageError } = await supabase.storage
        .from("attachments")
        .remove([storage_path]);

      if (storageError) {
        console.error("[api/db/attachments] delete storage error:", storageError);
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("[api/db/attachments] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
