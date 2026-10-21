import { describe, it, expect, afterEach } from "vitest";
import { render } from "@react-email/render";
import React from "react";
import { NextRequest } from "next/server";
import { summariseWaiting } from "../request-reminder";
import { RequestReminder } from "@/emails/request-reminder";
import { GET } from "@/app/api/send-request-reminder/route";

const NOW = new Date("2026-10-21T07:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

describe("which requests get a reminder", () => {
  it("is nothing when the queue is empty", () => {
    expect(summariseWaiting([], NOW)).toEqual({ count: 0, oldestDays: 0 });
  });

  it("stays quiet while everything is fresh: those just had their own email", () => {
    expect(summariseWaiting([hoursAgo(2), hoursAgo(19.9)], NOW)).toEqual({ count: 0, oldestDays: 0 });
  });

  it("catches a request made just after yesterday's run, even if today's fires early", () => {
    expect(summariseWaiting([hoursAgo(23.5)], NOW)).toEqual({ count: 1, oldestDays: 1 });
  });

  it("counts every pending request, like the Requests tab, and rounds the oldest wait", () => {
    expect(summariseWaiting([hoursAgo(2), hoursAgo(30), hoursAgo(24 * 6 + 5)], NOW)).toEqual({
      count: 3,
      oldestDays: 6,
    });
    expect(summariseWaiting([hoursAgo(47)], NOW).oldestDays).toBe(2);
  });
});

describe("the reminder email", () => {
  it("says how many and how long, in plural", async () => {
    const html = await render(React.createElement(RequestReminder, { count: 3, oldestDays: 6 }));
    expect(html).toContain("Request reminder");
    expect(html).toContain("There are 3 unanswered property requests in the queue.");
    expect(html).toContain("The oldest has been waiting 6 days.");
    expect(html).toContain("/admin?tab=requests");
  });

  it("reads right for a single request waiting a single day", async () => {
    const html = await render(React.createElement(RequestReminder, { count: 1, oldestDays: 1 }));
    expect(html).toContain("There is 1 unanswered property request in the queue.");
    expect(html).toContain("It has been waiting 1 day.");
  });
});

describe("the cron route", () => {
  const SECRET = process.env.CRON_SECRET;
  afterEach(() => {
    if (SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = SECRET;
  });

  const call = (auth?: string) =>
    GET(new NextRequest("http://localhost/api/send-request-reminder", {
      headers: auth ? { authorization: auth } : {},
    }));

  it("refuses everyone when CRON_SECRET is unset, even 'Bearer undefined'", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer undefined")).status).toBe(401);
  });

  it("refuses a wrong or missing secret", async () => {
    process.env.CRON_SECRET = "right";
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call()).status).toBe(401);
  });
});
