import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const { data: lists, error: listsError } = await supabase
      .from("lists")
      .select("id, name, created_by, created_at")
      .eq("created_by", userId);

    if (listsError) {
      console.error("[api/db/lists] lists query error:", listsError);
      return NextResponse.json({ error: listsError.message }, { status: 500 });
    }

    const listIds = (lists || []).map((l: any) => l.id);
    let listItems: any[] = [];

    if (listIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("list_items")
        .select(
          "id, list_id, place_id, place_type, place_name, place_address, lat, lon, visit_date, visit_time, weather, traffic_observation, comments, added_at"
        )
        .in("list_id", listIds);

      if (itemsError) {
        console.error("[api/db/lists] list_items query error:", itemsError);
        return NextResponse.json({ error: itemsError.message }, { status: 500 });
      }

      listItems = items || [];
    }

    return NextResponse.json({ lists: lists || [], listItems });
  } catch (err) {
    console.error("[api/db/lists] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { action, ...payload } = body;

    if (action === "upsert_list") {
      const { data, error } = await supabase
        .from("lists")
        .upsert(
          {
            id: payload.id,
            name: payload.name,
            created_by: payload.created_by ?? userId,
            created_at: payload.created_at,
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (error) {
        console.error("[api/db/lists] upsert_list error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    if (action === "upsert_item") {
      const { data, error } = await supabase
        .from("list_items")
        .upsert(
          {
            id: payload.id,
            list_id: payload.list_id,
            place_id: payload.place_id,
            place_type: payload.place_type,
            place_name: payload.place_name,
            place_address: payload.place_address,
            lat: payload.lat,
            lon: payload.lon,
            visit_date: payload.visit_date,
            visit_time: payload.visit_time,
            weather: payload.weather,
            traffic_observation: payload.traffic_observation,
            comments: payload.comments,
            added_at: payload.added_at,
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (error) {
        console.error("[api/db/lists] upsert_item error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/db/lists] unexpected POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase } = auth;

  try {
    const type = request.nextUrl.searchParams.get("type");
    const id = request.nextUrl.searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json({ error: "type and id are required" }, { status: 400 });
    }

    if (type === "list") {
      const { error } = await supabase.from("lists").delete().eq("id", id);
      if (error) {
        console.error("[api/db/lists] delete list error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return new NextResponse(null, { status: 204 });
    }

    if (type === "item") {
      const { error } = await supabase.from("list_items").delete().eq("id", id);
      if (error) {
        console.error("[api/db/lists] delete item error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return new NextResponse(null, { status: 204 });
    }

    if (type === "item_by_place") {
      const listId = request.nextUrl.searchParams.get("list_id");
      const placeId = request.nextUrl.searchParams.get("place_id");

      if (!listId || !placeId) {
        return NextResponse.json(
          { error: "list_id and place_id are required for item_by_place" },
          { status: 400 }
        );
      }

      const { error } = await supabase
        .from("list_items")
        .delete()
        .eq("list_id", listId)
        .eq("place_id", placeId);

      if (error) {
        console.error("[api/db/lists] delete item_by_place error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(
      { error: 'type must be "list", "item", or "item_by_place"' },
      { status: 400 }
    );
  } catch (err) {
    console.error("[api/db/lists] unexpected DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
