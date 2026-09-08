/**
 * Central outgoing-email helper.
 *
 * Every email the app sends goes through `sendAppEmail` so there is one place
 * that decides the sender address and one place that handles the sandbox.
 *
 * The sandbox problem: Resend's shared `onboarding@resend.dev` sender only
 * delivers to the Resend account owner's own inbox. Mail addressed to anyone
 * else is silently dropped, which is why nobody has ever received a digest.
 *
 * So while no sending domain is configured, every email is redirected to the
 * account owner with the real recipient written into the subject line:
 *
 *   [to: matus.husar@theminers.eu] New property request from Jan
 *
 * The redirect is keyed off the sender address, not a separate on/off flag.
 * Set RESEND_FROM to a verified domain address and the redirect disappears by
 * itself. There is no switch anyone can forget to turn off.
 */

import { Resend } from "resend";

/** Resend's shared sandbox sender. Only delivers to the account owner. */
const SANDBOX_FROM = "Miners Scout <onboarding@resend.dev>";

/** Where redirected mail lands while the sandbox sender is in use. */
const DEFAULT_SANDBOX_INBOX = "founders@taskmole.co";

/**
 * The address emails are sent from. Set RESEND_FROM once a sending domain is
 * verified in Resend, e.g. `Miners Scout <scout@theminers.eu>`.
 *
 * The value is rebuilt from whatever is stored rather than used verbatim.
 * Local .env files are read by dotenv, which strips quotes, but the Vercel
 * dashboard stores the literal string, so a value pasted with quotes, smart
 * quotes, a stray line break, or no angle brackets reaches us as typed and
 * Resend rejects the entire send with a 422. That failure is invisible in
 * production: mail simply never arrives. Pulling the address out of the
 * string and reassembling it makes every one of those pastes work.
 */
export function getFromAddress(): string {
  const raw = process.env.RESEND_FROM;
  if (!raw) return SANDBOX_FROM;

  // Newlines and repeated spaces are rejected outright, so flatten first.
  const value = raw.replace(/\s+/g, " ").trim();

  const email = value.match(/[^\s<>@"'`]+@[^\s<>@"'`]+\.[^\s<>@"'`]+/)?.[0];
  if (!email) {
    console.warn("[email] RESEND_FROM has no usable address, using sandbox sender");
    return SANDBOX_FROM;
  }

  // Whatever precedes the address is the display name. Keep it only when it
  // is plainly a name; anything else (a leftover `RESEND_FROM=`, punctuation
  // from a broken paste) is dropped rather than mailed out as the sender.
  const name = value
    .slice(0, value.indexOf(email))
    .replace(/[<>"'`‘’“”]/g, "")
    .trim();

  return /^[A-Za-z0-9 .,'-]+$/.test(name) ? `${name} <${email}>` : email;
}

/**
 * True while mail still goes out through Resend's sandbox sender, which is
 * exactly when real recipients cannot receive anything.
 */
export function isSandboxSender(): boolean {
  return getFromAddress().toLowerCase().includes("@resend.dev");
}

/** Inbox that receives redirected mail during sandbox mode. */
function sandboxInbox(): string {
  return process.env.EMAIL_SANDBOX_INBOX?.trim() || DEFAULT_SANDBOX_INBOX;
}

export interface AppEmail {
  to: string;
  subject: string;
  html: string;
}

export interface SendResult {
  /** The address the message was actually delivered to. */
  deliveredTo: string;
  /** True when the message was rerouted away from its real recipient. */
  redirected: boolean;
  /** Resend's error message, or null on success. */
  error: string | null;
  /** HTTP status from Resend, used to tell transient failures from permanent ones. */
  statusCode?: number;
}

/**
 * Send one email. Never throws: returns the outcome so callers can log or
 * retry without wrapping every send in its own try/catch.
 */
export async function sendAppEmail(email: AppEmail): Promise<SendResult> {
  const redirected = isSandboxSender();
  const deliveredTo = redirected ? sandboxInbox() : email.to;

  // Tag the subject with the real recipient so a redirected inbox stays
  // readable. Strip control characters and cap length, since parts of the
  // subject come from user-supplied text.
  const subject = (redirected ? `[to: ${email.to}] ${email.subject}` : email.subject)
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 200);

  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY missing, not sending: ${subject}`);
    return { deliveredTo, redirected, error: "no-resend-key" };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: deliveredTo,
      subject,
      html: email.html,
    });

    if (error) {
      console.warn(`[email] send to ${deliveredTo} failed:`, error.message);
      return {
        deliveredTo,
        redirected,
        error: error.message,
        statusCode: (error as { statusCode?: number }).statusCode,
      };
    }

    return { deliveredTo, redirected, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown send error";
    console.warn("[email] send threw:", message);
    return { deliveredTo, redirected, error: message };
  }
}

/**
 * Send the same message to several recipients, one send per address.
 *
 * One at a time rather than a single `to: [...]` array: with the sandbox
 * sender, one disallowed address fails the whole batch, and per-recipient
 * sends keep the subject tag accurate for each.
 */
export async function sendAppEmails(
  recipients: string[],
  message: Omit<AppEmail, "to">,
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  for (const to of recipients) {
    results.push(await sendAppEmail({ ...message, to }));
  }
  return results;
}
