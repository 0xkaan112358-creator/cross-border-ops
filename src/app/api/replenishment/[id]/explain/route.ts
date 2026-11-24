import { getSkuDetail } from "@/lib/inventory";
import { chatCompletion, llmEnabled } from "@/lib/llm";
import { requireViewer } from "@/lib/viewer";

export async function POST(request: Request, ctx: RouteContext<"/api/replenishment/[id]/explain">) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const { id } = await ctx.params;
  const detail = await getSkuDetail(Number(id));
  if (!detail) return Response.json({ error: "SKU 不存在" }, { status: 404 });
  const { row } = detail;
  if (!llmEnabled()) {
    return Response.json({ mode: "mock", text: row.plan.explanation });
  }
  try {
    const msg = await chatCompletion(
      [
        {
          role: "system",
          content:
            "你是跨境电商的供应链计划顾问。根据给出的补货计算结果，用 3～5 句通俗的中文向计划员解释：现在的库存处境、为什么给出这个建议、需要注意的风险（如大促、断货、冗余）。只使用给出的数字，不要编造。",
        },
        {
          role: "user",
          content: JSON.stringify({
            sku: row.sku,
            marketplace: row.marketplace,
            name: row.name,
            inventory: {
              fba_available: row.fba_available,
              fba_inbound: row.fba_inbound,
              in_transit: row.in_transit,
              overseas_wh: row.overseas_wh,
              domestic_wh: row.domestic_wh,
              in_production: row.in_production,
              aged_qty: row.aged_qty,
            },
            lead_times: {
              production: row.production_days,
              sea: row.sea_days,
              air: row.air_days,
              receiving: row.receiving_days,
            },
            plan: { ...row.plan, explanation: undefined },
            recent_shipments: detail.shipments.slice(0, 5),
          }),
        },
      ],
      { temperature: 0.3 },
    );
    return Response.json({ mode: "llm", text: msg?.content ?? row.plan.explanation });
  } catch (error) {
    return Response.json(
      { error: `AI 解读失败：${error instanceof Error ? error.message : "未知错误"}` },
      { status: 502 },
    );
  }
}
