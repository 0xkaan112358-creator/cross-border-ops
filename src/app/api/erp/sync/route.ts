import { ErpError } from "@/lib/erp/client";
import { getSyncOverview, runErpSync } from "@/lib/erp/sync";
import { requireViewer } from "@/lib/viewer";

export const maxDuration = 300;

export async function GET(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  return Response.json(await getSyncOverview());
}

export async function POST(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  try {
    const run = await runErpSync(viewer.name || viewer.email);
    return Response.json({ run });
  } catch (error) {
    const status = error instanceof ErpError && error.status === 409 ? 409 : 502;
    return Response.json({ error: error instanceof Error ? error.message : "同步失败" }, { status });
  }
}
