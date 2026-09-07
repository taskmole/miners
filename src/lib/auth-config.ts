/**
 * Authentication Configuration
 *
 * Controls which email addresses/domains are allowed to access the app.
 *
 * IMPORTANT: this is the SECOND of two allowlists, and it is the weaker one.
 * The real gate is the `check_email_domain()` function in the database, run by
 * the `enforce_email_domain` trigger BEFORE INSERT on auth.users. That one
 * runs first and aborts the sign-up outright.
 *
 * The check here runs only AFTER a session has already been issued, and merely
 * calls signOut() - which does not invalidate the access token already handed
 * out. Treat it as a UX nicety, not a security boundary.
 *
 * The two lists disagreeing is what locked jzapletal1@gmail.com out for two
 * months (see supabase/migrations/20260907000003_fix_signup_email_allowlist.sql).
 * Change BOTH, together, or the app will claim to allow someone the database
 * silently refuses.
 */

// Email domains that are always allowed (anyone with this domain can log in).
// Mirrors `allowed_domains` in check_email_domain().
export const ALLOWED_DOMAINS = [
  '@theminers.eu',
  '@partner.theminers.eu',
];

// Specific email addresses that are allowed (for individual exceptions).
// Mirrors `allowed_emails` in check_email_domain().
export const ALLOWED_EMAILS = [
  'founders@taskmole.co',
  // Jaro's franchisee-role test account, used to check the franchisee view.
  'jzapletal1@gmail.com',
];

/**
 * Check if an email address is allowed to access the app
 */
export function isEmailAllowed(email: string | undefined): boolean {
  if (!email) return false;

  const lowerEmail = email.toLowerCase();

  // Check if email matches any allowed domain
  const domainAllowed = ALLOWED_DOMAINS.some(domain =>
    lowerEmail.endsWith(domain.toLowerCase())
  );

  if (domainAllowed) return true;

  // Check if email is in the specific allowed list
  const emailAllowed = ALLOWED_EMAILS.some(allowed =>
    lowerEmail === allowed.toLowerCase()
  );

  return emailAllowed;
}
