import "server-only";
import { db } from "@/lib/db";

/**
 * Audit trail helper (owner: architect-security).
 * Record every admin mutation: audit(user.id, "page.publish", { type: "Page", id }, { path }).
 * `summary` must be minimal and contain NO PII or secrets: keys that look
 * sensitive are stripped, strings are truncated, nesting is limited.
 * Action naming: "<entity>.<verb>" lower-case, e.g. auth.login, auth.login_failed,
 * auth.logout, user.create, page.update, page.publish, page.delete, page.restore,
 * media.upload, lead.status, lead.export, lead.delete, settings.update, redirect.create.
 */
const SENSITIVE_KEY = /pass|token|secret|hash|cookie|session|email|e-mail|mail|phone|tel|ip|address|name|message|note/i;

export type AuditSummary = Record<string, string | number | boolean | null>;

export function sanitizeSummary(summary: Record<string, unknown> | undefined): AuditSummary | undefined {
  if (!summary) return undefined;
  const out: AuditSummary = {};
  let n = 0;
  for (const [k, v] of Object.entries(summary)) {
    if (n >= 20) break;
    if (SENSITIVE_KEY.test(k) && !/^(path|slug|status|role|count|statuscode|topath|frompath)$/i.test(k)) continue;
    if (v === null || typeof v === "boolean" || typeof v === "number") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 200);
    else continue;
    n++;
  }
  return out;
}

export async function audit(
  actorId: string | null,
  action: string,
  entity?: { type: string; id?: string | null } | null,
  summary?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId,
        action: action.slice(0, 80),
        entityType: entity?.type?.slice(0, 40) ?? null,
        entityId: entity?.id?.slice(0, 64) ?? null,
        summary: sanitizeSummary(summary) ?? undefined,
      },
    });
  } catch (err) {
    // Auditing must not break the user action; log without payload.
    console.error("[audit] failed to record", action, err instanceof Error ? err.name : "error");
  }
}
