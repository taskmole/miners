import { NextRequest, NextResponse } from "next/server";
import {
  accessFor,
  authenticateRequest,
  getUserTeamIds,
  untypedDb as db,
} from "@/lib/supabase-server";
import { cities } from "@/lib/cities";
import {
  canAccessDashboard,
  canReadListsOf,
  toGrants,
  type Access,
  type CityGrantRow,
} from "@/lib/permissions";

export const dynamic = "force-dynamic";

const ALL_CITY_IDS = cities.map((c) => c.id);

type ListWriteCheck =
  | { allowed: false; exists?: never }
  | { allowed: true; exists: boolean };

/**
 * May this caller write to this list, and does the list already exist?
 *
 * RLS will not answer the first question correctly on its own. Every write
 * policy on `lists` and `list_items` ends in `OR is_admin()`, and is_admin()
 * means "super admin, or holds an approve grant in ANY city". That is the same
 * population the GET below now hands other people's list ids to, complete with
 * owner names. So without this check a reviewer could rename or delete a list
 * the screen only ever showed them read-only, in a city they do not even
 * approve in.
 *
 * The read-only chip and the guards in useLists are the same rule expressed in
 * the browser. They stop the accident. This stops the hand-made request.
 *
 * The second question exists because created_by must only be stamped on a
 * create. See upsert_list.
 *
 * An id that is not in the table yet is writable: the INSERT policy already
 * pins created_by to the caller.
 */
async function checkListWrite(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  listId: string,
): Promise<ListWriteCheck> {
  const { data, error } = await db(supabase)
    .from("lists")
    .select("created_by, team_id")
    .eq("id", listId)
    .maybeSingle();

  // A failed lookup is a refusal, never a pass.
  if (error) return { allowed: false };
  if (!data) return { allowed: true, exists: false };
  if (data.created_by === userId) return { allowed: true, exists: true };
  if (!data.team_id) return { allowed: false };

  const teamIds = await getUserTeamIds(supabase, userId);
  return teamIds.includes(data.team_id)
    ? { allowed: true, exists: true }
    : { allowed: false };
}

/** The common case: may this caller write to this list at all? */
async function canWriteList(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  listId: string,
): Promise<boolean> {
  return (await checkListWrite(supabase, userId, listId)).allowed;
}

const refuseWrite = () =>
  NextResponse.json({ error: "That list is not yours to change" }, { status: 403 });

/**
 * Everyone whose saved lists this viewer may read.
 *
 * Lists have no city column, so the scope is by person, not by city. See
 * canReadListsOf.
 *
 * Two reads for the whole set rather than a pair per person: the directory is
 * fifteen people and this runs on every lists poll.
 */
async function readablePeople(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  viewer: Access,
): Promise<string[]> {
  const [{ data: profiles, error: profilesError }, { data: grants, error: grantsError }] =
    await Promise.all([
      db(supabase)
        .from("user_profiles")
        .select("id, is_super_admin, is_active, can_see_financials"),
      db(supabase)
        .from("user_city_grants")
        .select("user_id, city_id, level, receives_alerts"),
    ]);

  // A failed read means "nobody extra", never "everybody".
  if (profilesError || grantsError || !profiles) return [];

  const grantsByUser = new Map<string, CityGrantRow[]>();
  for (const row of grants || []) {
    const existing = grantsByUser.get(row.user_id) ?? [];
    existing.push(row as CityGrantRow);
    grantsByUser.set(row.user_id, existing);
  }

  const readable: string[] = [];
  for (const profile of profiles) {
    const subject: Access = {
      isSuperAdmin: profile.is_super_admin === true,
      isActive: profile.is_active !== false,
      canSeeFinancials: profile.can_see_financials === true,
      grants: toGrants(grantsByUser.get(profile.id) ?? []),
    };
    if (canReadListsOf(viewer, subject, ALL_CITY_IDS)) readable.push(profile.id);
  }

  return readable;
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const teamIds = await getUserTeamIds(supabase, userId);

    // Fetch user's own lists + team lists
    let listsQuery = supabase
      .from("lists")
      .select("id, name, created_by, created_at, team_id");

    if (teamIds.length > 0) {
      listsQuery = listsQuery.or(`created_by.eq.${userId},team_id.in.(${teamIds.join(",")})`);
    } else {
      listsQuery = listsQuery.eq("created_by", userId);
    }

    const { data: lists, error: listsError } = await listsQuery;

    if (listsError) {
      console.error("[api/db/lists] lists query error:", listsError);
      return NextResponse.json({ error: listsError.message }, { status: 500 });
    }

    // Own and team lists, tagged. A list the caller created is theirs even
    // when it is also shared with their team.
    const tagged: any[] = (lists || []).map((l: any) => ({
      ...l,
      access: l.created_by === userId ? "own" : "team",
    }));
    // Ids already in the response, so a shared list never gets added twice.
    const seenIds = new Set<string>(tagged.map((l: any) => l.id));

    // Reviewers also see the lists of people they are allowed to look at,
    // read-only. Everyone else's response is byte-for-byte what it was.
    const access = await accessFor(supabase, userId);
    if (access && canAccessDashboard(access)) {
      const people = (await readablePeople(supabase, access)).filter((id) => id !== userId);

      if (people.length > 0) {
        const { data: foreign, error: foreignError } = await db(supabase)
          .from("lists")
          .select("id, name, created_by, created_at, team_id")
          .in("created_by", people);

        if (foreignError) {
          // Not fatal: the caller still gets their own lists.
          console.error("[api/db/lists] readable lists query error:", foreignError);
        } else {
          for (const row of foreign || []) {
            if (seenIds.has(row.id)) continue;
            tagged.push({ ...row, access: "readonly" });
          }
        }
      }
    }

    const listIds = tagged.map((l: any) => l.id);
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

    return NextResponse.json({ lists: tagged, listItems });
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
      if (!payload.id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      const check = await checkListWrite(supabase, userId, payload.id);
      if (!check.allowed) return refuseWrite();

      const row: Record<string, unknown> = {
        id: payload.id,
        name: payload.name,
        created_at: payload.created_at,
      };

      // Stamp an owner only when the row is new. renameList sends created_by
      // set to whoever is renaming, and shareWithTeam sends none at all, so
      // writing it on every upsert quietly moved a shared team list to the last
      // person who touched it. The GET above derives `access` from created_by,
      // so that also stripped the real owner's "own" tag.
      if (!check.exists) {
        row.created_by = payload.created_by ?? userId;
      }
      if (payload.team_id !== undefined) {
        row.team_id = payload.team_id || null;
      }

      const { data, error } = await supabase
        .from("lists")
        .upsert(row, { onConflict: "id" })
        .select()
        .single();

      if (error) {
        console.error("[api/db/lists] upsert_list error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    if (action === "upsert_item") {
      if (!payload.list_id) {
        return NextResponse.json({ error: "list_id is required" }, { status: 400 });
      }
      if (!(await canWriteList(supabase, userId, payload.list_id))) return refuseWrite();

      // Authorising the destination is not enough. The item id is client
      // supplied and this upsert conflicts on it, so sending somebody else's
      // item id with your own list_id is an UPDATE that MOVES their saved place
      // into your list. The list_items UPDATE policy passes it, because its
      // USING clause is checked against the old row and ends in OR is_admin().
      // The ids became reachable the moment the GET above started returning
      // other people's list items, so the source needs the same check.
      if (payload.id) {
        const { data: existing, error: existingError } = await db(supabase)
          .from("list_items")
          .select("list_id")
          .eq("id", payload.id)
          .maybeSingle();

        if (existingError) {
          console.error("[api/db/lists] upsert_item lookup error:", existingError);
          return NextResponse.json({ error: existingError.message }, { status: 500 });
        }
        if (
          existing &&
          existing.list_id !== payload.list_id &&
          !(await canWriteList(supabase, userId, existing.list_id))
        ) {
          return refuseWrite();
        }
      }

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
  const { supabase, userId } = auth;

  try {
    const type = request.nextUrl.searchParams.get("type");
    const id = request.nextUrl.searchParams.get("id");

    if (!type || !id) {
      return NextResponse.json({ error: "type and id are required" }, { status: 400 });
    }

    if (type === "list") {
      if (!(await canWriteList(supabase, userId, id))) return refuseWrite();

      const { error, count } = await supabase.from("lists").delete({ count: "exact" }).eq("id", id);
      if (error) {
        console.error("[api/db/lists] delete list error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // 0 rows affected means RLS blocked the delete (user doesn't own the list)
      if ((count ?? 0) === 0) {
        return NextResponse.json({ error: "Delete affected 0 rows" }, { status: 403 });
      }
      return new NextResponse(null, { status: 204 });
    }

    if (type === "item") {
      // Resolve the owning list before deleting. An item that is not in the
      // table has nothing to authorise and nothing to delete: that is the
      // localStorage-only case handled below, so it stays a quiet 204.
      const { data: item, error: lookupError } = await db(supabase)
        .from("list_items")
        .select("list_id")
        .eq("id", id)
        .maybeSingle();

      if (lookupError) {
        console.error("[api/db/lists] delete item lookup error:", lookupError);
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
      }
      if (item && !(await canWriteList(supabase, userId, item.list_id))) return refuseWrite();

      const { error } = await supabase.from("list_items").delete().eq("id", id);
      if (error) {
        console.error("[api/db/lists] delete item error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // Items may exist only in localStorage and never have been synced,
      // so 0 rows affected is expected and not an error.
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
      if (!(await canWriteList(supabase, userId, listId))) return refuseWrite();

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
