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

function crossOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

export async function requireViewer(request: Request, roles?: Role[]): Promise<Viewer | Response> {
  if (crossOrigin(request)) return Response.json({ error: "请求来源不受信任" }, { status: 403 });
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
