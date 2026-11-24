import { z } from "zod";
import {
  csSettingsSchema,
  replenishmentSettingsSchema,
  saveCsSettings,
  saveReplenishmentSettings,
} from "@/lib/settings";
import { requireViewer } from "@/lib/viewer";

const schema = z.object({
  replenishment: replenishmentSettingsSchema.optional(),
  cs: csSettingsSchema.optional(),
});

export async function PUT(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: `参数不合法：${parsed.error.issues[0]?.path.join(".")}` }, { status: 400 });
  }
  if (parsed.data.replenishment) {
    const w = parsed.data.replenishment.weights;
    if (w[0] + w[1] + w[2] <= 0) return Response.json({ error: "销量权重之和必须大于 0" }, { status: 400 });
    await saveReplenishmentSettings(parsed.data.replenishment);
  }
  if (parsed.data.cs) await saveCsSettings(parsed.data.cs);
  return Response.json({ ok: true });
}
