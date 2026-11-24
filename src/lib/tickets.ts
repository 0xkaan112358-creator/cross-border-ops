import "server-only";
import { z } from "zod";
import { checkReply, type ComplianceFlag } from "./compliance";
import { LANGUAGE_LABEL, TICKET_INTENTS, type TicketIntent } from "./constants";
import { sql } from "./db";
import { KB_HIT_THRESHOLD, searchKnowledge, type KbHit } from "./kb";
import { chatJson, llmEnabled } from "./llm";
import { getCsSettings } from "./settings";
import { decideRoute } from "./ticket-routing";
import {
  mockClassify,
  mockHumanDraft,
  mockLogisticsReply,
  mockUsageReply,
  ORDER_ID_RE,
  type Classification,
  type OrderInfo,
  type ReplyDraft,
} from "./tickets-mock";

export type TicketRow = {
  id: number;
  channel: string;
  marketplace: string | null;
  order_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  subject: string | null;
  body: string;
  language: string | null;
  translation_zh: string | null;
  intent: TicketIntent | null;
  difficulty: string | null;
  urgency: string | null;
  sentiment: string | null;
  confidence: number | null;
  summary: string | null;
  route: "auto" | "human" | null;
  route_reason: string | null;
  status: string;
  reply_draft: string | null;
  reply_draft_zh: string | null;
  compliance_flags: ComplianceFlag[];
  kb_refs: { chunkId: number; documentId: number; title: string; heading: string | null; score: number }[];
  final_reply: string | null;
  handled_by: string | null;
  ai_mode: string | null;
  received_at: string;
  processed_at: string | null;
  sent_at: string | null;
};

const TICKET_COLUMNS = `id, channel, marketplace, order_id, customer_name, customer_email, subject, body, language,
  translation_zh, intent, difficulty, urgency, sentiment, confidence::float8 as confidence, summary, route, route_reason,
  status, reply_draft, reply_draft_zh, compliance_flags, kb_refs, final_reply, handled_by, ai_mode,
  received_at::text as received_at, processed_at::text as processed_at, sent_at::text as sent_at`;

export async function getTicket(id: number) {
  const rows = await sql<TicketRow>(`select ${TICKET_COLUMNS} from tickets where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listTickets() {
  return sql<TicketRow>(
    `select ${TICKET_COLUMNS} from tickets
     order by case status when 'pending_human' then 0 when 'draft_ready' then 1 when 'new' then 2 when 'processing' then 2 else 3 end,
       case urgency when 'high' then 0 when 'medium' then 1 else 2 end,
       received_at desc`,
  );
}

export async function getOrder(orderId: string): Promise<(OrderInfo & { sku: string | null; marketplace: string | null; customer_name: string | null; purchase_date: string | null }) | null> {
  const rows = await sql<OrderInfo & { sku: string | null; marketplace: string | null; customer_name: string | null; purchase_date: string | null }>(
    `select order_id, sku, marketplace, customer_name, to_char(purchase_date, 'YYYY-MM-DD') as purchase_date,
       carrier, tracking_no, shipping_status, to_char(est_delivery, 'YYYY-MM-DD') as est_delivery
     from orders where order_id = $1`,
    [orderId],
  );
  return rows[0] ?? null;
}

const classificationSchema = z.object({
  language: z.string(),
  translation_zh: z.string(),
  intent: z.enum(TICKET_INTENTS),
  confidence: z.coerce.number().min(0).max(1),
  sentiment: z.enum(["calm", "negative", "angry"]),
  urgency: z.enum(["high", "medium", "low"]),
  summary_zh: z.string(),
  order_id: z.string().optional().default(""),
});

async function llmClassify(ticket: TicketRow): Promise<Classification> {
  const result = await chatJson(
    `你是跨境电商（亚马逊美国站和欧洲站）客服分诊助手。分析客户消息，输出 JSON：
{"language":"en|de|fr|it|es|zh|other","translation_zh":"消息的完整中文翻译","intent":"logistics|usage|return|quality|claim|other","confidence":0到1之间的小数,"sentiment":"calm|negative|angry","urgency":"high|medium|low","summary_zh":"30 字以内中文摘要","order_id":"消息中的亚马逊订单号，没有则为空字符串"}
意图定义：logistics=询问物流、到货时间、包裹状态；usage=产品使用、功能、兼容性、清洁保养等咨询；return=退货、换货、退款申请（无质量问题）；quality=产品质量问题、损坏、故障；claim=威胁差评、A-to-Z 索赔、拒付、法律威胁；other=批发、售前、合作等其他。
一条消息包含多个意图时取最严重的：claim > quality > return > logistics > usage > other。
urgency：claim 或情绪愤怒为 high；quality 或情绪不满为 medium；其余 low。`,
    `渠道：${ticket.channel}；站点：${ticket.marketplace ?? "未知"}\n主题：${ticket.subject ?? ""}\n内容：\n${ticket.body}`,
    classificationSchema,
  );
  return { ...result, order_id: result.order_id || null };
}

const replySchema = z.object({
  reply: z.string().min(1),
  reply_zh: z.string(),
  can_answer: z.boolean().optional().default(true),
});

async function llmReply(
  ticket: TicketRow,
  c: Classification,
  order: OrderInfo | null,
  kb: KbHit[],
  mode: "answer" | "draft_for_human",
  humanReason: string,
) {
  return chatJson(
    `你是亚马逊卖家的客服，代表店铺回复买家。必须遵守亚马逊买家消息规范：不得索要好评或以任何利益换取评价；不得包含外部链接、邮箱、电话等站外联系方式；不得引导站外沟通或交易；不得包含营销推广内容。语气礼貌、简洁、专业。只能使用提供的订单信息和知识库资料，不要编造参数、时效或承诺。
输出 JSON：{"reply":"用客户语言写的完整回复正文，署名 Customer Service（或对应语言的客服署名）","reply_zh":"回复的中文翻译","can_answer":资料是否足以回答客户问题(true/false)}
mode=answer：直接完整回答客户问题。
mode=draft_for_human：写一份供人工修改的建议回复，先致歉或回应关切；退款、补发、赔偿等需要人工决定的内容，用【待确认：……】标出，不要自行承诺。`,
    JSON.stringify(
      {
        mode,
        human_reason: mode === "draft_for_human" ? humanReason : undefined,
        customer_language: LANGUAGE_LABEL[c.language] ?? c.language,
        customer_name: ticket.customer_name,
        marketplace: ticket.marketplace,
        message: ticket.body,
        order,
        knowledge: kb.map((k, i) => ({ ref: i + 1, title: k.title, heading: k.heading, content: k.content })),
      },
      null,
      2,
    ),
    replySchema,
  );
}

async function processOne(ticket: TicketRow) {
  const settings = await getCsSettings();
  const useLlm = llmEnabled();

  let c: Classification;
  if (useLlm) {
    c = await llmClassify(ticket);
  } else {
    c = mockClassify(ticket.body, ticket.translation_zh);
    if (c.language === "zh") c.translation_zh = ticket.body;
  }
  if (!c.translation_zh && ticket.translation_zh) c.translation_zh = ticket.translation_zh;

  const orderId = ticket.order_id || c.order_id || ORDER_ID_RE.exec(ticket.body)?.[0] || null;
  const order = orderId ? await getOrder(orderId) : null;

  let kb: KbHit[] = [];
  if (c.intent === "usage" || c.intent === "quality" || c.intent === "other") {
    const query = `${ticket.subject ?? ""} ${ticket.body} ${c.translation_zh ?? ""}`;
    kb = (await searchKnowledge(query, 3)).filter((k) => k.score >= KB_HIT_THRESHOLD);
  }

  let decision = decideRoute({
    intent: c.intent,
    confidence: c.confidence,
    sentiment: c.sentiment,
    orderStatus: order?.shipping_status ?? null,
    kbHit: kb.length > 0,
    settings,
  });

  const name = ticket.customer_name || "there";
  let draft: ReplyDraft;
  if (useLlm) {
    const r = await llmReply(
      ticket,
      c,
      order,
      kb,
      decision.route === "auto" ? "answer" : "draft_for_human",
      decision.reason,
    );
    if (decision.route === "auto" && !r.can_answer) {
      decision = { route: "human", reason: "AI 判断现有资料不足以准确回答" };
    }
    draft = { reply: r.reply, reply_zh: r.reply_zh };
  } else if (decision.route === "auto" && c.intent === "logistics") {
    draft = mockLogisticsReply(c.language, name, order);
  } else if (decision.route === "auto" && c.intent === "usage") {
    const usage = kb[0] ? mockUsageReply(c.language, name, ticket.body, kb[0]) : null;
    if (usage) draft = usage;
    else {
      decision = { route: "human", reason: "模拟模式下只能用英文标准答案回复，需人工处理（接入大模型后可自动生成多语言回复）" };
      draft = mockHumanDraft(c.language, name);
    }
  } else {
    draft = mockHumanDraft(c.language, name);
  }

  const flags = checkReply(draft.reply).filter((f) => f.rule !== "仍有待确认的占位内容");
  if (decision.route === "auto" && flags.some((f) => f.level === "block")) {
    decision = { route: "human", reason: "AI 回复未通过话术合规检查" };
  }

  await sql(
    `update tickets set language = $2, translation_zh = $3, intent = $4, difficulty = $5, urgency = $6,
       sentiment = $7, confidence = $8, summary = $9, route = $10, route_reason = $11, status = $12,
       reply_draft = $13, reply_draft_zh = $14, compliance_flags = $15::jsonb, kb_refs = $16::jsonb,
       order_id = coalesce(order_id, $17), ai_mode = $18, processed_at = now()
     where id = $1`,
    [
      ticket.id,
      c.language,
      c.translation_zh,
      c.intent,
      decision.route === "auto" ? "simple" : "hard",
      c.urgency,
      c.sentiment,
      c.confidence,
      c.summary_zh,
      decision.route,
      decision.reason,
      decision.route === "auto" ? "draft_ready" : "pending_human",
      draft.reply,
      draft.reply_zh,
      JSON.stringify(flags),
      JSON.stringify(kb.map(({ chunkId, documentId, title, heading, score }) => ({ chunkId, documentId, title, heading, score }))),
      orderId,
      useLlm ? "llm" : "mock",
    ],
  );
}

export async function processPending(limit = 4) {
  await sql(
    "update tickets set status = 'new' where status = 'processing' and processed_at < now() - interval '5 minutes'",
  );
  const claimed = await sql<{ id: number }>(
    `update tickets set status = 'processing', processed_at = now()
     where id in (select id from tickets where status = 'new' order by received_at limit $1)
     returning id`,
    [limit],
  );
  const errors: string[] = [];
  for (const { id } of claimed) {
    const ticket = await getTicket(id);
    if (!ticket) continue;
    try {
      await processOne(ticket);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`#${id}: ${message}`);
      await sql(
        `update tickets set status = 'pending_human', route = 'human', difficulty = 'hard',
           route_reason = $2, processed_at = now() where id = $1`,
        [id, `AI 处理失败，已转人工：${message.slice(0, 200)}`],
      );
    }
  }
  const remaining = await sql<{ n: number }>("select count(*)::int as n from tickets where status = 'new'");
  return { processed: claimed.length, remaining: Number(remaining[0]?.n ?? 0), errors };
}

export async function reprocessTicket(id: number) {
  await sql("update tickets set status = 'new' where id = $1", [id]);
  const ticket = await getTicket(id);
  if (!ticket) throw new Error("工单不存在");
  await sql("update tickets set status = 'processing', processed_at = now() where id = $1", [id]);
  try {
    await processOne(ticket);
  } catch (error) {
    await sql("update tickets set status = 'pending_human' where id = $1", [id]);
    throw error;
  }
}

export async function ticketStats() {
  const rows = await sql<{
    total: number;
    pending_human: number;
    draft_ready: number;
    sent: number;
    new_count: number;
    auto_routed: number;
    processed: number;
    auto_sent: number;
    auto_sent_unchanged: number;
  }>(
    `select count(*)::int as total,
       count(*) filter (where status = 'pending_human')::int as pending_human,
       count(*) filter (where status = 'draft_ready')::int as draft_ready,
       count(*) filter (where status = 'sent')::int as sent,
       count(*) filter (where status in ('new', 'processing'))::int as new_count,
       count(*) filter (where route = 'auto')::int as auto_routed,
       count(*) filter (where route is not null)::int as processed,
       count(*) filter (where status = 'sent' and route = 'auto')::int as auto_sent,
       count(*) filter (where status = 'sent' and route = 'auto' and final_reply = reply_draft)::int as auto_sent_unchanged
     from tickets`,
  );
  const intents = await sql<{ intent: string; n: number }>(
    "select intent, count(*)::int as n from tickets where intent is not null group by intent order by n desc",
  );
  return { ...rows[0], intents };
}
