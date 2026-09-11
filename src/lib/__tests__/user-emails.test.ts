import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render } from "@react-email/render";
import React from "react";
import { describeGrants, sendInviteEmail, notifySuperAdminsOfUserChange } from "../user-emails";
import { accessSummary } from "../permissions";
import { cityNames } from "../cities";
import { UserInvited } from "@/emails/user-invited";
import {
  UserChangeNotification,
  userChangeSubject,
} from "@/emails/user-change-notification";

/**
 * The guarantee these tests exist for: a user change must never fail because
 * of email. Both senders are called in production after the database write
 * has already committed, so "throws" and "fails the request" are the same
 * bug, and the no-key case below is exactly how that shows up in a fresh
 * environment.
 */

const KEY = process.env.RESEND_API_KEY;

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  if (KEY === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = KEY;
});

describe("the access line", () => {
  it("reads as a level and a city", () => {
    expect(describeGrants([{ city_id: "madrid", level: "contribute" }])).toBe(
      "Contribute in Madrid",
    );
  });

  it("joins two cities with 'and', not a trailing comma", () => {
    const line = describeGrants([
      { city_id: "prague", level: "approve" },
      { city_id: "madrid", level: "approve" },
    ]);
    expect(line).toBe("Approve in Madrid and Prague");
    expect(line).not.toMatch(/,\s*$/);
  });

  it("says so plainly when there are no cities", () => {
    expect(describeGrants([])).toBe("No cities yet");
    expect(describeGrants(null)).toBe("No cities yet");
  });

  it("puts the super admin switch above any city", () => {
    expect(describeGrants([{ city_id: "madrid", level: "view" }], true)).toBe(
      "Super admin, every city",
    );
  });

  it("uses the strongest level somebody holds", () => {
    expect(
      accessSummary(
        {
          isSuperAdmin: false,
          grants: [
            { cityId: "madrid", level: "view", canSeeFinancials: false, receivesAlerts: false },
            { cityId: "prague", level: "approve", canSeeFinancials: false, receivesAlerts: false },
          ],
        },
        cityNames,
      ),
    ).toBe("Approve in Madrid and Prague");
  });
});

describe("the invite", () => {
  it("refuses a profile with no email, without throwing", async () => {
    await expect(
      sendInviteEmail({ email: null, isActive: true }),
    ).resolves.toMatchObject({ sent: false, skipped: "no-email" });
  });

  it("refuses a switched-off profile: they would hit Account Pending", async () => {
    await expect(
      sendInviteEmail({ email: "ana@theminers.eu", isActive: false }),
    ).resolves.toMatchObject({ sent: false, skipped: "inactive" });
  });

  it("reports a clean failure with no mail key, rather than crashing", async () => {
    const result = await sendInviteEmail({
      email: "ana@theminers.eu",
      isActive: true,
      inviterName: "Jaro",
    });
    expect(result.sent).toBe(false);
    expect(result.skipped).toBe("no-resend-key");
  });

  it("names the invited address, because the match is by address", async () => {
    const html = await render(
      React.createElement(UserInvited, {
        inviterName: "Jaro Zapletal",
        recipientEmail: "ana.gomez@theminers.eu",
      }),
    );
    expect(html).toContain("ana.gomez@theminers.eu");
    expect(html).toContain("Jaro Zapletal");
  });
});

describe("the change alert", () => {
  it("reports a clean failure with no service key, rather than crashing", async () => {
    const url = process.env.SUPABASE_PROD_URL;
    const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_PROD_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const result = await notifySuperAdminsOfUserChange({
      kind: "added",
      personEmail: "ana@theminers.eu",
      personAccess: "Contribute in Madrid",
    });

    if (url) process.env.SUPABASE_PROD_URL = url;
    if (publicUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = publicUrl;
    if (serviceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;

    expect(result).toEqual({ sent: 0, skipped: "no-service-key" });
  });

  it("gives each kind its own subject line", () => {
    expect(userChangeSubject("added", "Ana")).toBe("New user added: Ana");
    expect(userChangeSubject("deactivated", "Ana")).toBe("User switched off: Ana");
    expect(userChangeSubject("reactivated", "Ana")).toBe("User switched back on: Ana");
    expect(userChangeSubject("access", "Ana")).toBe("Access changed: Ana");
  });

  it("says which way the super admin switch went", () => {
    expect(userChangeSubject("super-admin", "Ana", true)).toBe("Ana is now a super admin");
    expect(userChangeSubject("super-admin", "Ana", false)).toBe(
      "Ana is no longer a super admin",
    );
  });

  it("names the person and the admin who changed them", async () => {
    const html = await render(
      React.createElement(UserChangeNotification, {
        kind: "access",
        personName: "Petr Novak",
        personEmail: "petr@theminers.eu",
        personAccess: "Approve in Prague",
        accessBefore: "Contribute in Prague",
        accessAfter: "Approve in Prague",
        changedByName: "Matus Husar",
        userId: "abc-123",
      }),
    );
    expect(html).toContain("Petr Novak");
    expect(html).toContain("Matus Husar");
    expect(html).toContain("Contribute in Prague");
    expect(html).toContain("/admin/users/abc-123");
  });
});
