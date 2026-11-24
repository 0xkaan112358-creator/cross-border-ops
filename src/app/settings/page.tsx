import { NoPermission } from "@/components/no-permission";
import { PageHeader } from "@/components/page-header";
import { SettingsBoard } from "@/components/settings-board";
import { sql } from "@/lib/db";
import { getPromotions } from "@/lib/inventory";
import { llmStatus } from "@/lib/llm";
import { getCsSettings, getReplenishmentSettings } from "@/lib/settings";
import { getViewer } from "@/lib/viewer";

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <NoPermission need="管理员" />;
  const [replenishment, cs, promotions, roles] = await Promise.all([
    getReplenishmentSettings(),
    getCsSettings(),
    getPromotions(),
    sql<{ email: string; role: "admin" | "cs"; updated_by: string | null }>(
      "select email, role, updated_by from user_roles order by role, email",
    ),
  ]);
  return (
    <>
      <PageHeader title="设置" description="补货参数、大促日历、客服分流规则和成员角色。修改后立即生效。" />
      <SettingsBoard
        replenishment={replenishment}
        cs={cs}
        promotions={promotions}
        roles={roles}
        llm={llmStatus()}
      />
    </>
  );
}
