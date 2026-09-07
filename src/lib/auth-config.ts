/**
 * Authentication Configuration
 *
 * Controls which email addresses/domains are allowed to access the app.
 * Edit this file to add or remove authorized users.
 */

// Email domains that are always allowed (anyone with this domain can log in)
const ALLOWED_DOMAINS = [
  '@theminers.eu',
  '@partner.theminers.eu',
];

// Specific email addresses that are allowed (for individual exceptions)
const ALLOWED_EMAILS = [
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
