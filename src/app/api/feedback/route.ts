import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getFromAddress } from "@/lib/email";

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const text = formData.get("text") as string | null;

    if (!text?.trim()) {
      return NextResponse.json(
        { error: "Feedback text is required" },
        { status: 400 },
      );
    }

    const city = (formData.get("city") as string) ?? "Unknown";
    const device = (formData.get("device") as string) ?? "Unknown";
    const timestamp = (formData.get("timestamp") as string) ?? new Date().toISOString();
    const userId = formData.get("userId") as string | null;
    const userEmail = formData.get("userEmail") as string | null;

    const files = formData.getAll("files") as File[];

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} files allowed` },
        { status: 400 },
      );
    }

    const oversized = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversized) {
      return NextResponse.json(
        { error: "Max file size is 5MB" },
        { status: 400 },
      );
    }

    const attachments = await Promise.all(
      files
        .filter((f) => f.size > 0 && f.type.startsWith("image/"))
        .map(async (file) => ({
          filename: file.name.replace(/[/\\]/g, "_").slice(-100),
          content: Buffer.from(await file.arrayBuffer()),
        })),
    );

    const resend = new Resend(process.env.RESEND_API_KEY!);

    const userLine = userEmail
      ? `${userEmail} (${userId ?? "no id"})`
      : userId ?? "Anonymous";

    const html = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <p style="font-size: 15px; line-height: 1.6; color: #27272a; white-space: pre-wrap;">${escapeHtml(text.trim())}</p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;" />
        <table style="font-size: 13px; color: #71717a;">
          <tr><td style="padding-right: 12px;">User</td><td>${escapeHtml(userLine)}</td></tr>
          <tr><td style="padding-right: 12px;">City</td><td>${escapeHtml(city)}</td></tr>
          <tr><td style="padding-right: 12px;">Device</td><td>${escapeHtml(device)}</td></tr>
          <tr><td style="padding-right: 12px;">Time</td><td>${escapeHtml(timestamp)}</td></tr>
        </table>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: "founders@taskmole.co",
      subject: "New feedback",
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
