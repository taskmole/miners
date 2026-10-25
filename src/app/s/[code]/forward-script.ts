/**
 * Forward signed-in people from the share page before its app code loads.
 *
 * ShareRedirect forwards everyone, but only once React has loaded and run on
 * this page: about 0.8 s after the link opens on a laptop, 1 s on a phone,
 * while the server itself answers in 0.4 s. This tiny script sits in the
 * page's HTML and forwards straight away instead, for anyone whose browser
 * holds a Miners session.
 *
 * Only them: chat apps build link previews from this page with no Miners
 * session, so their view of it stays exactly as before. Signed-out people
 * still go the ShareRedirect way.
 */
import { sessionStorageKey } from "@/lib/map-prefetch";

/** Set on window once the script has forwarded, so ShareRedirect does not forward again. */
const FORWARDED_FLAG = "__minersShareForwarded";

/** A value as a JavaScript string that is safe inside an HTML <script>. */
function scriptString(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** The inline script for a share page, or null when Supabase is not configured. */
export function buildShareForwardScript(target: string, supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  return `(function () {
  try {
    var session = JSON.parse(localStorage.getItem(${scriptString(sessionStorageKey(supabaseUrl))}) || "null");
    if (!session || !session.access_token) return;
    window.${FORWARDED_FLAG} = true;
    location.replace(${scriptString(target)});
  } catch (e) {}
})();`;
}

/**
 * True when the inline script already forwarded this page. A second
 * location.replace would restart the app's page load from scratch.
 */
export function alreadyForwarded(): boolean {
  return (window as Window & { [FORWARDED_FLAG]?: boolean })[FORWARDED_FLAG] === true;
}
