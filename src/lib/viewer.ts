import "server-only";
import { headers } from "next/headers";
import { getIdentity, requireTeamRole, type IdentityRequest } from "../../cursor/identity";
import { sql } from "./db";

export type Role = "admin" | "cs" | "staff";

export type Viewer = {
  sub: string;
  name: string;
  email: string;
  role: Role;
};

async function resolveViewer(request: IdentityRequest): Promise<Viewer | null> {
  const identity = await getIdentity(request);
  if (!identity.verified) return null;

  const base = { sub: identity.sub, name: identity.name || identity.email || "未命名用户", email: identity.email };
  if (identity.kind === "key") return { ...base, role: "staff" };
  if (identity.appVisibility === "private") return { ...base, role: "admin" };
  if (!(requireTeamRole(identity, ["admin"]) instanceof Response)) return { ...base, role: "admin" };

  if (identity.email) {
    const rows = await sql<{ role: Role }>("select role from user_roles where email = $1", [
      identity.email.toLowerCase(),
    ]);
    if (rows[0]?.role === "admin" || rows[0]?.role === "cs") return { ...base, role: rows[0].role };
  }
  return { ...base, role: "staff" };
}

export async function getViewer(): Promise<Viewer | null> {
  return resolveViewer(await headers());
}

function requestHosts(h: Headers) {
  const hosts = new Set<string>();
  for (const value of [h.get("x-forwarded-host"), h.get("host")]) {
    for (const part of value?.split(",") ?? []) if (part.trim()) hosts.add(part.trim().toLowerCase());
  }
  for (const m of h.get("forwarded")?.matchAll(/host="?([^;,"\s]+)/gi) ?? []) hosts.add(m[1].toLowerCase());
  return hosts;
}

// Returns a short diagnostic when the request must be rejected as cross-site, otherwise null.
// Sec-Fetch-Site is set by the browser and cannot be forged by another page, so it is trusted first;
// behind proxies that rewrite Host it is the only reliable same-origin signal.
function crossOriginReason(request: Request): string | null {
  if (request.method === "GET" || request.method === "HEAD") return null;
  const h = request.headers;
  const site = h.get("sec-fetch-site");
  if (site === "same-origin" || site === "none") return null;
  if (site === "cross-site" || site === "same-site") return `sec-fetch-site=${site}`;
  const origin = h.get("origin");
  if (!origin) return null;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return `origin=${origin}`;
  }
  const hosts = requestHosts(h);
  if (hosts.size === 0 || hosts.has(originHost)) return null;
  return `origin=${originHost} host=${[...hosts].join("|")}`;
}

export async function requireViewer(request: Request, roles?: Role[]): Promise<Viewer | Response> {
  const rejected = crossOriginReason(request);
  if (rejected) {
    const h = request.headers;
    console.warn(
      `[csrf] 拒绝 ${request.method} ${new URL(request.url).pathname} ${rejected} ` +
        `x-forwarded-host=${h.get("x-forwarded-host")} host=${h.get("host")} forwarded=${h.get("forwarded")} sec-fetch-site=${h.get("sec-fetch-site")}`,
    );
    return Response.json({ error: `请求来源不受信任（${rejected}）` }, { status: 403 });
  }
  const viewer = await resolveViewer(request);
  if (!viewer) return Response.json({ error: "请先登录" }, { status: 401 });
  if (roles && !roles.includes(viewer.role)) {
    return Response.json({ error: "没有权限执行此操作" }, { status: 403 });
  }
  return viewer;
}

export function canHandleTickets(role: Role) {
  return role === "admin" || role === "cs";
}
