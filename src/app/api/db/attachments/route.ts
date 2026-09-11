import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  createServerSupabase,
  getTokenFromRequest,
  untypedDb as db,
} from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Postgres raises this when a row-level security policy refuses a write. It is
// a permission answer, not a server fault, so it must not surface as a 500 with
// the raw database text in it. Same mapping the user-profiles route uses.
const INSUFFICIENT_PRIVILEGE = "42501";

const BUCKET = "attachments";

/**
 * Storage paths are built here, from the verified session, and never taken
 * from the browser. Anything that lands in one has to survive this first:
 * only letters, digits, dot, dash and underscore, so no slash and no ".."
 * can slip in and walk the path somewhere else.
 */
function safeSegment(value: unknown, fallback: string): string {
  const cleaned = String(value ?? "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function safeExtension(value: unknown): string {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 10);
  return cleaned || "bin";
}

/**
 * May this person be handed a link to this file?
 *
 * A signed link ignores every rule once it exists, so this is the only gate.
 * Four ways in, in the order they are cheapest to answer:
 *
 * 1. The file sits in their own folder. This case is not optional: a scouting
 *    trip photo is signed straight after upload, before the trip is saved, so
 *    at that moment the path is recorded nowhere at all.
 * 2. The path is recorded against an attachment record. Any signed-in person
 *    may see those, which is how team review works today.
 * 3. The path is recorded against a scouting pitch. Asked with the caller's
 *    own session, never an elevated key, so the pitch rule ("mine, or in a
 *    city I may view") applies the city restriction for free.
 * 4. They are an admin.
 *
 * Files referenced by none of the above become admin-only. Today that is six
 * of the thirteen: four in folders named after a random browser id from before
 * sign-in existed, and two abandoned uploads from trips that were never saved.
 * Nothing in the app displays any of them.
 */
async function mayReadPath(
  supabase: Parameters<typeof db>[0],
  userId: string,
  path: string,
): Promise<boolean> {
  if (path.startsWith(`${userId}/`)) return true;

  const { data: onAttachment } = await db(supabase)
    .from("poi_attachments")
    .select("id")
    .eq("storage_path", path)
    .limit(1);
  if (onAttachment && onAttachment.length > 0) return true;

  const { data: onPitch } = await db(supabase)
    .from("pitches")
    .select("id")
    .contains("attachment_paths", [path])
    .limit(1);
  if (onPitch && onPitch.length > 0) return true;

  const { data: isAdmin } = await db(supabase).rpc("is_admin");
  return isAdmin === true;
}

function writeFailure(error: { code?: string; message: string }): NextResponse {
  console.error("[api/db/attachments] write error:", error);
  if (error.code === INSUFFICIENT_PRIVILEGE) {
    return NextResponse.json(
      { error: "You are not allowed to change that file." },
      { status: 403 },
    );
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

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
  // getUser() rather than a bare token read: the uploader stamped on a new row
  // decides who may later change or delete it, so it has to come from a
  // verified identity rather than from whatever the browser sent.
  const auth = await authenticateRequest(request);
  if (auth.error) return auth.error;
  const { supabase, userId } = auth;

  try {
    const body = await request.json();
    const { action, ...data } = body;

    if (action === "upsert_metadata") {
      if (!data.row) {
        return NextResponse.json({ error: "row object is required" }, { status: 400 });
      }
      if (!data.row.id) {
        return NextResponse.json({ error: "row.id is required" }, { status: 400 });
      }

      // The browser used to choose both of these. uploaded_by came from
      // getCurrentUserId(), which falls back to a random local id when the
      // signed-in id has not reached local storage yet, and uploaded_by_name
      // was hardcoded to "Guest" - both production rows prove it. Neither is
      // the browser's to decide, so whatever it sent is dropped here.
      const {
        uploaded_by: _ignoredUploader,
        uploaded_by_name: _ignoredUploaderName,
        ...row
      } = data.row;

      // An edit must not re-stamp the uploader. Nobody can steal a file this
      // way, because the update policy tests the row that is already there,
      // but an admin editing a colleague's attachment would silently become
      // its owner and the real uploader would lose it.
      const { data: existing, error: lookupError } = await supabase
        .from("poi_attachments")
        .select("id")
        .eq("id", row.id)
        .maybeSingle();

      if (lookupError) {
        console.error("[api/db/attachments] lookup error:", lookupError);
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
      }

      if (existing) {
        // db() because the repo's hand-written Database type does not describe
        // every column on this table, so the typed builder collapses to never.
        // .select() for the same reason the delete side has it. When the
        // update policy refuses a write, Postgres does not raise: it simply
        // updates nothing and returns no error. Without asking for the
        // affected rows back, this replies "ok" to an edit that never
        // happened. No caller edits an existing row today, but the lie would
        // start the moment one did.
        const { data: updated, error } = await db(supabase)
          .from("poi_attachments")
          .update(row)
          .eq("id", row.id)
          .select("id");

        if (error) return writeFailure(error);

        if (!updated || updated.length === 0) {
          return NextResponse.json(
            { error: "Only the person who uploaded a file, or an admin, can change it." },
            { status: 403 },
          );
        }

        return NextResponse.json({ ok: true });
      }

      // New row, so the uploader gets stamped from the verified session. The
      // display name is denormalised onto the row and never looked up again,
      // so a failed lookup would freeze "Guest" onto the file permanently.
      // Better to refuse the write and let the browser say so.
      const { data: profile, error: profileError } = await db(supabase)
        .from("user_profiles")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle();

      if (profileError) {
        console.error("[api/db/attachments] profile lookup error:", profileError);
        return NextResponse.json(
          { error: "Could not confirm who you are. Please try again." },
          { status: 500 },
        );
      }

      const uploadedByName: string | null = profile?.display_name || null;

      const { error } = await supabase
        .from("poi_attachments")
        .insert({ ...row, uploaded_by: userId, uploaded_by_name: uploadedByName });

      if (error) return writeFailure(error);

      // Handed back so the browser can show the real name straight away
      // instead of the "Guest" placeholder it started with.
      return NextResponse.json({
        ok: true,
        uploaded_by: userId,
        uploaded_by_name: uploadedByName,
      });
    }

    if (action === "signed_upload_url") {
      // The browser used to send the whole path and the server signed whatever
      // it was given, so anyone could name a colleague's file and write over
      // it. The path is built here instead, from the verified session. That
      // removes the problem rather than trying to detect it.
      let uploadPath: string;

      if (data.context_id) {
        uploadPath = [
          userId,
          safeSegment(data.context_id, "misc"),
          `${safeSegment(data.attachment_id, "file")}.${safeExtension(data.ext)}`,
        ].join("/");
      } else if (typeof data.path === "string" && data.path.startsWith(`${userId}/`)) {
        // A tab left open across the deploy still sends the old shape. Honour
        // it only when it names the caller's own folder, which is exactly the
        // case that was never dangerous, so nobody mid-upload has to reload.
        uploadPath = data.path;
      } else {
        return NextResponse.json(
          { error: "context_id is required" },
          { status: 400 },
        );
      }

      const { data: urlData, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUploadUrl(uploadPath);

      if (error) {
        console.error("[api/db/attachments] signed upload URL error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      // path is echoed back deliberately. The caller saves it against the
      // record, so it has to be the path the server chose, not the one the
      // browser guessed, or the record points at a file that does not exist.
      return NextResponse.json({ ...urlData, path: uploadPath });
    }

    if (action === "signed_read_url") {
      if (!data.path || typeof data.path !== "string") {
        return NextResponse.json({ error: "path is required" }, { status: 400 });
      }

      if (!(await mayReadPath(supabase, userId, data.path))) {
        return NextResponse.json(
          { error: "You are not allowed to open that file." },
          { status: 403 },
        );
      }

      const { data: urlData, error } = await supabase.storage
        .from(BUCKET)
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
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = createServerSupabase(token);

    // Look the row up before deleting it. A delete that removes nothing means
    // one of two very different things: somebody already deleted it, or this
    // person is not the uploader. Without this check, deleting a file on your
    // phone and then again on a laptop with a stale list tells you that you
    // may not delete your own file.
    const { data: existing, error: lookupError } = await supabase
      .from("poi_attachments")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (lookupError) {
      console.error("[api/db/attachments] delete lookup error:", lookupError);
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    // Already gone. Nothing to do, and nothing to complain about.
    if (!existing) {
      return new NextResponse(null, { status: 204 });
    }

    // .select() so the storage path comes from the row that was actually
    // removed. The browser used to send the path, and nothing checked that it
    // belonged to the row being deleted, so any signed-in person could delete
    // one of their own attachments while naming somebody else's file - and
    // scouting trip evidence shares this bucket - and that file was gone.
    const { data: deleted, error: metaError } = await db(supabase)
      .from("poi_attachments")
      .delete()
      .eq("id", id)
      .select("id, storage_path");

    if (metaError) {
      console.error("[api/db/attachments] delete metadata error:", metaError);
      return NextResponse.json({ error: metaError.message }, { status: 500 });
    }

    // The row is still there, so the delete policy refused it. The file stays
    // where it is.
    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { error: "Only the person who uploaded a file, or an admin, can delete it." },
        { status: 403 },
      );
    }

    // Best-effort storage cleanup (metadata already deleted, so don't fail on storage error)
    const storagePath = deleted[0].storage_path;
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from("attachments")
        .remove([storagePath]);

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
