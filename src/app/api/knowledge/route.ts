import { KB_CATEGORIES } from "@/lib/constants";
import { addDocument, extractTextFromFile } from "@/lib/kb";
import { requireViewer } from "@/lib/viewer";

const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const viewer = await requireViewer(request, ["admin"]);
  if (viewer instanceof Response) return viewer;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "请选择要上传的文件" }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: "文件不能超过 10MB" }, { status: 400 });
  const categoryInput = String(form?.get("category") ?? "其他");
  const category = (KB_CATEGORIES as readonly string[]).includes(categoryInput) ? categoryInput : "其他";
  const title = String(form?.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
  try {
    const text = await extractTextFromFile(file);
    const result = await addDocument({ title, category, filename: file.name, text, uploadedBy: viewer.name });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "文件解析失败" },
      { status: 400 },
    );
  }
}
