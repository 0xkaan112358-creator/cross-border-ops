import { buildTemplate, IMPORT_DEFS, IMPORT_TYPES, runImport, type ImportType } from "@/lib/importer";
import { requireViewer } from "@/lib/viewer";

const MAX_SIZE = 15 * 1024 * 1024;

function parseType(value: string): ImportType | null {
  return (IMPORT_TYPES as readonly string[]).includes(value) ? (value as ImportType) : null;
}

export async function GET(request: Request, ctx: RouteContext<"/api/import/[type]">) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const type = parseType((await ctx.params).type);
  if (!type) return Response.json({ error: "未知的导入类型" }, { status: 404 });
  const name = encodeURIComponent(`导入模板-${IMPORT_DEFS[type].title}.xlsx`);
  return new Response(new Uint8Array(buildTemplate(type)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
    },
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/import/[type]">) {
  const type = parseType((await ctx.params).type);
  if (!type) return Response.json({ error: "未知的导入类型" }, { status: 404 });
  const viewer = await requireViewer(request, type === "tickets" ? ["admin", "cs"] : ["admin"]);
  if (viewer instanceof Response) return viewer;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择要导入的文件" }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: "文件不能超过 15MB" }, { status: 400 });
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    return Response.json({ error: "仅支持 .xlsx、.xls 或 .csv 文件" }, { status: 400 });
  }
  try {
    const result = await runImport(type, await file.arrayBuffer());
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "导入失败" }, { status: 400 });
  }
}
