import { z } from "zod";
import { checkReply } from "@/lib/compliance";
import { sql } from "@/lib/db";
import { getTicket, reprocessTicket } from "@/lib/tickets";
import { requireViewer } from "@/lib/viewer";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send"), reply: z.string().trim().min(1, "回复内容不能为空").max(8000) }),
  z.object({ action: z.literal("check"), reply: z.string().max(8000) }),
  z.object({ action: z.literal("regenerate") }),
  z.object({ action: z.literal("to_human") }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen") }),
]);

export async function POST(request: Request, ctx: RouteContext<"/api/tickets/[id]">) {
  const viewer = await requireViewer(request, ["admin", "cs"]);
  if (viewer instanceof Response) return viewer;
  const id = Number((await ctx.params).id);
  const ticket = await getTicket(id);
  if (!ticket) return Response.json({ error: "工单不存在" }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "请求格式不正确" }, { status: 400 });
  }
  const body = parsed.data;

  switch (body.action) {
    case "check":
      return Response.json({ flags: checkReply(body.reply) });
    case "send": {
      const flags = checkReply(body.reply);
      const blocking = flags.filter((f) => f.level === "block");
      if (blocking.length > 0) {
        return Response.json(
          { error: `回复未通过话术检查：${blocking.map((f) => f.rule).join("、")}`, flags },
          { status: 422 },
        );
      }
      await sql(
        `update tickets set status = 'sent', final_reply = $2, handled_by = $3, sent_at = now(), compliance_flags = $4::jsonb
         where id = $1`,
        [id, body.reply, viewer.name, JSON.stringify(flags)],
      );
      return Response.json({ ok: true });
    }
    case "regenerate":
      try {
        await reprocessTicket(id);
        return Response.json({ ok: true });
      } catch (error) {
        return Response.json(
          { error: `重新生成失败：${error instanceof Error ? error.message : "未知错误"}` },
          { status: 502 },
        );
      }
    case "to_human":
      await sql(
        "update tickets set route = 'human', difficulty = 'hard', status = 'pending_human', route_reason = $2 where id = $1",
        [id, `由 ${viewer.name} 手动转人工`],
      );
      return Response.json({ ok: true });
    case "close":
      await sql("update tickets set status = 'closed', handled_by = $2 where id = $1", [id, viewer.name]);
      return Response.json({ ok: true });
    case "reopen":
      await sql(
        "update tickets set status = case when route = 'auto' then 'draft_ready' else 'pending_human' end where id = $1",
        [id],
      );
      return Response.json({ ok: true });
  }
}
