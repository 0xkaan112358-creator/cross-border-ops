import { ImportBoard, type ImportDefView } from "@/components/import-board";
import { NoPermission } from "@/components/no-permission";
import { PageHeader } from "@/components/page-header";
import { sql } from "@/lib/db";
import { IMPORT_DEFS, IMPORT_TYPES } from "@/lib/importer";
import { getViewer } from "@/lib/viewer";

export default async function ImportPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <NoPermission need="管理员" />;
  const [counts] = await sql<Record<string, number>>(
    `select (select count(*) from skus)::int as skus, (select count(*) from inventory)::int as inventory,
       (select count(*) from daily_sales)::int as sales, (select count(*) from shipments)::int as shipments,
       (select count(*) from orders)::int as orders, (select count(*) from tickets)::int as tickets`,
  );
  const defs: ImportDefView[] = IMPORT_TYPES.map((type) => ({
    type,
    title: IMPORT_DEFS[type].title,
    description: IMPORT_DEFS[type].description,
    fields: IMPORT_DEFS[type].fields.map((f) => ({ label: f.label, required: !!f.required, note: f.note ?? null })),
    count: Number(counts?.[type] ?? 0),
  }));
  return (
    <>
      <PageHeader
        title="数据导入"
        description="从领星、积加等 ERP 导出 Excel/CSV 后上传。表头支持中英文常见写法，不必与模板完全一致。请先导入 SKU 主数据。"
      />
      <ImportBoard defs={defs} />
    </>
  );
}
