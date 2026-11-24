import { z } from "zod";
import { answerQuestion } from "@/lib/assistant";
import { requireViewer } from "@/lib/viewer";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(30),
});

export async function POST(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "请求格式不正确" }, { status: 400 });
  try {
    const answer = await answerQuestion(parsed.data.messages);
    return Response.json(answer, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("assistant failed", error);
    return Response.json(
      { error: `回答失败：${error instanceof Error ? error.message : "未知错误"}` },
      { status: 502 },
    );
  }
}
