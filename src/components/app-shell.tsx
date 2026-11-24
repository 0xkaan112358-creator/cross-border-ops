import { LockKeyhole } from "lucide-react";
import { ROLE_LABEL } from "@/lib/constants";
import { sql } from "@/lib/db";
import { llmStatus } from "@/lib/llm";
import { getViewer } from "@/lib/viewer";
import { MobileNav, SideNav, type NavBadges } from "./nav";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
            <LockKeyhole className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">请先登录</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            跨境运营助手仅供公司内部使用，请使用公司分配的 Cursor 账号登录后访问。
          </p>
        </div>
      </main>
    );
  }

  const llm = llmStatus();
  const counts = await sql<{ pending: number }>(
    "select count(*) filter (where status in ('pending_human', 'draft_ready', 'new'))::int as pending from tickets",
  );
  const badges: NavBadges = { tickets: Number(counts[0]?.pending ?? 0) };
  const user = { name: viewer.name, role: viewer.role, roleLabel: ROLE_LABEL[viewer.role] };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-sidebar lg:block">
        <SideNav user={user} llm={llm} badges={badges} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} llm={llm} badges={badges} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
