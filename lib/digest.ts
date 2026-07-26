import { SOURCE_LABELS } from "./feeds";
import type { FeedItem } from "./types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline-styled, single-column, light-palette email — boring on purpose. */
export function buildDigestHtml(items: FeedItem[], dateLabel: string): string {
  const rows = items
    .map((item, i) => {
      const href = item.externalUrl ?? item.url;
      const metaParts: string[] = [SOURCE_LABELS[item.source] ?? item.source];
      if (item.sourceMeta && item.sourceMeta !== metaParts[0]) metaParts.push(item.sourceMeta);
      if (typeof item.score === "number") metaParts.push(`▲ ${item.score}`);
      if (typeof item.comments === "number" && item.comments !== item.score) {
        metaParts.push(`${item.comments} comments`);
      }
      return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #eaeaea;">
          <div style="font-size:13px;color:#999;padding-bottom:3px;">${i + 1}</div>
          <a href="${esc(href)}" style="font-size:16px;font-weight:600;color:#18181b;text-decoration:none;line-height:1.4;">${esc(item.title)}</a>
          <div style="font-size:12px;color:#71717a;padding-top:4px;">
            ${esc(metaParts.join(" · "))}
            ${item.url !== href ? ` · <a href="${esc(item.url)}" style="color:#06b6d4;text-decoration:none;">discussion</a>` : ""}
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;padding:28px 32px;">
          <tr>
            <td style="padding-bottom:4px;font-size:18px;font-weight:700;color:#18181b;">
              gcd<span style="color:#06b6d4;">signal</span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:12px;font-size:13px;color:#71717a;border-bottom:2px solid #18181b;">
              The day's AI signal — ${esc(dateLabel)}
            </td>
          </tr>
          ${rows}
          <tr>
            <td style="padding-top:18px;font-size:11px;color:#a1a1aa;line-height:1.6;">
              You're receiving this because you subscribed at gcd signal.<br/>
              <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#a1a1aa;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
