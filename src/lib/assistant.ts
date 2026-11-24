import "server-only";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { MARKETPLACE_LABEL, SHIP_METHOD_LABEL, STOCK_STATUS_LABEL, type StockStatus } from "./constants";
import { todayStr } from "./dates";
import { getShipments, loadPlans, type PlanRow } from "./inventory";
import { KB_HIT_THRESHOLD, searchKnowledge, type KbHit } from "./kb";
import { tokenize } from "./kb-text";
import { chatCompletion, llmEnabled } from "./llm";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type Citation = { n: number; title: string; heading: string | null; documentId: number; excerpt: string };
export type AssistantAnswer = { answer: string; citations: Citation[]; toolsUsed: string[]; mode: "llm" | "mock" };

const TOOL_LABEL: Record<string, string> = {
  search_inventory: "查询库存",
  get_sku_detail: "查询 SKU 详情",
  list_inbound_shipments: "查询在途货件",
  search_knowledge: "检索知识库",
};

const MARKET_WORDS: [RegExp, string[]][] = [
  [/美国|美区|\bUS\b|\bUSA\b/, ["US"]],
  [/英国|\bUK\b/, ["UK"]],
  [/德国|\bDE\b/, ["DE"]],
  [/法国|\bFR\b/, ["FR"]],
  [/意大利|\bIT\b/, ["IT"]],
  [/西班牙|\bES\b/, ["ES"]],
  [/欧洲|欧盟|\bEU\b/, ["UK", "DE", "FR", "IT", "ES"]],
];

function detectMarkets(text: string): string[] | null {
  const found = new Set<string>();
  for (const [re, list] of MARKET_WORDS) if (re.test(text)) list.forEach((m) => found.add(m));
  return found.size ? [...found] : null;
}

function matchSkus(text: string, plans: PlanRow[]): string[] {
  const lower = text.toLowerCase();
  const direct = new Set(plans.filter((p) => lower.includes(p.sku.toLowerCase()) || (p.asin && lower.includes(p.asin.toLowerCase()))).map((p) => p.sku));
  if (direct.size) return [...direct];
  const qTokens = new Set(tokenize(text));
  let best = 0;
  const scores = new Map<string, number>();
  for (const p of plans) {
    if (scores.has(p.sku)) continue;
    const score = tokenize(p.name).filter((t) => qTokens.has(t)).length;
    scores.set(p.sku, score);
    best = Math.max(best, score);
  }
  if (best < 2) return [];
  return [...scores.entries()].filter(([, s]) => s === best).map(([sku]) => sku);
}

function daysText(d: number | null) {
  if (d == null) return "—";
  return d >= 365 ? "365+" : String(d);
}

function planSummary(p: PlanRow) {
  return {
    sku: p.sku,
    marketplace: p.marketplace,
    name: p.name,
    status: STOCK_STATUS_LABEL[p.plan.status],
    forecast_daily: p.plan.baseDaily,
    sellable_qty: p.plan.sellable,
    sellable_days: p.plan.sellableDays,
    total_qty: p.plan.pipeline,
    total_days: p.plan.pipelineDays,
    fba_available: p.fba_available,
    fba_inbound: p.fba_inbound,
    in_transit: p.in_transit,
    overseas_wh: p.overseas_wh,
    domestic_wh: p.domestic_wh,
    in_production: p.in_production,
    lead_time_days: p.plan.leadTime,
    suggested_order_qty: p.plan.orderQty,
    ship_from_domestic_qty: p.plan.shipFromDomesticQty,
    air_qty: p.plan.airQty,
    next_order_date: p.plan.orderDate,
    excess_qty: p.plan.excessQty,
    explanation: p.plan.explanation,
  };
}

function planTable(rows: PlanRow[]) {
  const header = "| SKU | 站点 | 状态 | 预测日均 | 可售天数 | 全部库存天数 | 建议 |\n|---|---|---|---|---|---|---|";
  const lines = rows.map((p) => {
    const advice: string[] = [];
    if (p.plan.orderQty > 0) advice.push(`下单 ${p.plan.orderQty} 件`);
    if (p.plan.shipFromDomesticQty > 0) advice.push(`国内仓发 ${p.plan.shipFromDomesticQty} 件`);
    if (p.plan.airQty > 0) advice.push(`空运约 ${p.plan.airQty} 件`);
    if (p.plan.status === "excess") advice.push(`冗余约 ${p.plan.excessQty} 件`);
    if (advice.length === 0 && p.plan.orderDate) advice.push(`预计 ${p.plan.orderDate} 下单`);
    return `| [${p.sku}](/inventory/${p.id}) ${p.name} | ${MARKETPLACE_LABEL[p.marketplace] ?? p.marketplace} | ${STOCK_STATUS_LABEL[p.plan.status]} | ${p.plan.baseDaily} | ${daysText(p.plan.sellableDays)} | ${daysText(p.plan.pipelineDays)} | ${advice.join("；") || "—"} |`;
  });
  return [header, ...lines].join("\n");
}

async function runSearchInventory(args: { keyword?: string; marketplace?: string; status?: StockStatus; limit?: number }) {
  let rows = await loadPlans();
  if (args.marketplace) rows = rows.filter((r) => r.marketplace === args.marketplace?.toUpperCase());
  if (args.status) rows = rows.filter((r) => r.plan.status === args.status);
  if (args.keyword) {
    const kw = args.keyword.toLowerCase();
    const direct = rows.filter((r) => `${r.sku} ${r.name} ${r.asin ?? ""} ${r.category ?? ""}`.toLowerCase().includes(kw));
    rows = direct.length ? direct : rows.filter((r) => matchSkus(args.keyword!, [r]).length > 0);
  }
  const counts: Record<string, number> = {};
  for (const r of rows) counts[STOCK_STATUS_LABEL[r.plan.status]] = (counts[STOCK_STATUS_LABEL[r.plan.status]] ?? 0) + 1;
  return { total: rows.length, status_counts: counts, items: rows.slice(0, Math.min(args.limit ?? 15, 40)).map(planSummary) };
}

async function runGetSkuDetail(args: { sku: string; marketplace?: string }) {
  const plans = await loadPlans();
  const skus = matchSkus(args.sku, plans);
  let rows = plans.filter((p) => skus.includes(p.sku));
  if (args.marketplace) rows = rows.filter((r) => r.marketplace === args.marketplace?.toUpperCase());
  const shipments = (await getShipments()).filter((s) => rows.some((r) => r.id === s.sku_id));
  return {
    found: rows.length,
    items: rows.map(planSummary),
    shipments: shipments.map((s) => ({ shipment_no: s.shipment_no, sku: s.sku, marketplace: s.marketplace, qty: s.qty, method: SHIP_METHOD_LABEL[s.method] ?? s.method, status: s.status, eta: s.eta })),
  };
}

async function runListShipments(args: { keyword?: string; marketplace?: string; within_days?: number }) {
  let rows = await getShipments({ withinDays: args.within_days ?? 30 });
  if (args.marketplace) rows = rows.filter((r) => r.marketplace === args.marketplace?.toUpperCase());
  if (args.keyword) {
    const kw = args.keyword.toLowerCase();
    rows = rows.filter((r) => `${r.sku} ${r.name} ${r.shipment_no}`.toLowerCase().includes(kw));
  }
  return {
    total: rows.length,
    items: rows.slice(0, 30).map((s) => ({ shipment_no: s.shipment_no, sku: s.sku, name: s.name, marketplace: s.marketplace, qty: s.qty, method: SHIP_METHOD_LABEL[s.method] ?? s.method, status: s.status, ship_date: s.ship_date, eta: s.eta })),
  };
}

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_inventory",
      description: "按关键字、站点或库存状态筛选 SKU，返回库存、可售天数和补货建议。用于'哪些 SKU 要断货'、'德国站库存情况'等问题。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "SKU 编码、品名或类目关键字，可选" },
          marketplace: { type: "string", enum: ["US", "UK", "DE", "FR", "IT", "ES"] },
          status: { type: "string", enum: ["stockout_risk", "reorder", "healthy", "excess"], description: "stockout_risk=断货风险，reorder=需补货，healthy=健康，excess=冗余" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sku_detail",
      description: "查询某个 SKU（可用编码、ASIN 或品名）在各站点的库存明细、补货建议和在途货件。",
      parameters: {
        type: "object",
        properties: {
          sku: { type: "string", description: "SKU 编码、ASIN 或品名" },
          marketplace: { type: "string", enum: ["US", "UK", "DE", "FR", "IT", "ES"] },
        },
        required: ["sku"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_inbound_shipments",
      description: "查询未来若干天内预计到达的在途货件。",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          marketplace: { type: "string", enum: ["US", "UK", "DE", "FR", "IT", "ES"] },
          within_days: { type: "number", description: "默认 30 天" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "检索公司知识库：平台规则、物流关务、认证标准（CE/FCC/GPSR/EPR 等）、产品资料、内部 SOP。",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "检索用的关键词或问题" } },
        required: ["query"],
      },
    },
  },
];

async function answerWithLlm(history: ChatTurn[]): Promise<AssistantAnswer> {
  const citations: Citation[] = [];
  const toolsUsed = new Set<string>();
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `你是公司内部的跨境电商运营助手，服务对象是公司员工。你可以调用工具查询实时库存、补货建议、在途货件，并检索公司知识库。
规则：
1. 库存、销量、补货相关的数字必须来自工具结果，不得编造。
2. 知识类问题必须先调用 search_knowledge，并在引用的句子后标注来源编号，如 [1]。知识库没有的内容要说明"知识库中没有找到"，如补充通用常识需注明"以下为通用常识，仅供参考"。
3. 合规、认证、法规类回答结尾提醒"以官方最新规定为准"。
4. 用简洁的中文回答，适当使用列表或 Markdown 表格。提到 SKU 时可以使用链接格式 [SKU](/inventory/<id>)，id 来自工具结果时才可使用。
今天是 ${todayStr()}（北京时间）。站点代码：US 美国、UK 英国、DE 德国、FR 法国、IT 意大利、ES 西班牙。`,
    },
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam),
  ];

  for (let round = 0; round < 5; round++) {
    const msg = await chatCompletion(messages, { tools: TOOLS, temperature: 0.2 });
    if (!msg) throw new Error("模型没有返回内容");
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return { answer: msg.content ?? "", citations, toolsUsed: [...toolsUsed], mode: "llm" };
    }
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
    for (const call of calls) {
      if (call.type !== "function") continue;
      const name = call.function.name;
      toolsUsed.add(TOOL_LABEL[name] ?? name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {}
      let result: unknown;
      try {
        if (name === "search_inventory") result = await runSearchInventory(args);
        else if (name === "get_sku_detail") result = await runGetSkuDetail(args as { sku: string });
        else if (name === "list_inbound_shipments") result = await runListShipments(args);
        else if (name === "search_knowledge") {
          const hits = await searchKnowledge(String(args.query ?? ""), 4);
          result = hits.map((h) => {
            const n = citations.length + 1;
            citations.push({ n, title: h.title, heading: h.heading, documentId: h.documentId, excerpt: h.content.slice(0, 160) });
            return { ref: n, title: h.title, heading: h.heading, content: h.content };
          });
        } else result = { error: "未知工具" };
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { answer: "问题比较复杂，没能在限定步骤内完成查询，请换个更具体的问法。", citations, toolsUsed: [...toolsUsed], mode: "llm" };
}

const INVENTORY_WORDS = /库存|可售|卖几天|能卖|断货|缺货|补货|冗余|积压|滞销|在途|到货|到仓|货件|发货|下单|多少件|sku|asin/i;

async function answerWithRules(question: string): Promise<AssistantAnswer> {
  const prefix = "> 当前为**模拟模式**（未配置大模型），以下结果由规则匹配和真实数据查询生成。\n\n";
  const plans = await loadPlans();
  const markets = detectMarkets(question);
  const skus = matchSkus(question, plans);
  const scoped = (rows: PlanRow[]) => (markets ? rows.filter((r) => markets.includes(r.marketplace)) : rows);
  const marketText = markets ? markets.map((m) => MARKETPLACE_LABEL[m]).join("、") : "全部站点";

  if (INVENTORY_WORDS.test(question) || skus.length > 0) {
    if (/在途|到货|到仓|货件|什么时候到/.test(question)) {
      let ships = await getShipments({ withinDays: 60 });
      if (markets) ships = ships.filter((s) => markets.includes(s.marketplace));
      if (skus.length) ships = ships.filter((s) => skus.includes(s.sku));
      if (ships.length === 0) return { answer: `${prefix}${marketText}没有查到符合条件的在途货件。`, citations: [], toolsUsed: ["查询在途货件"], mode: "mock" };
      const table = ["| 货件号 | SKU | 站点 | 数量 | 方式 | 状态 | 预计到达 |", "|---|---|---|---|---|---|---|"]
        .concat(ships.slice(0, 20).map((s) => `| ${s.shipment_no} | [${s.sku}](/inventory/${s.sku_id}) | ${MARKETPLACE_LABEL[s.marketplace] ?? s.marketplace} | ${s.qty} | ${SHIP_METHOD_LABEL[s.method] ?? s.method} | ${s.status} | ${s.eta ?? "—"} |`))
        .join("\n");
      return { answer: `${prefix}${marketText}未来 60 天内共有 ${ships.length} 票在途货件${ships.length > 20 ? "（显示前 20 票）" : ""}：\n\n${table}`, citations: [], toolsUsed: ["查询在途货件"], mode: "mock" };
    }

    if (skus.length > 0) {
      const rows = scoped(plans.filter((p) => skus.includes(p.sku)));
      if (rows.length === 0) return { answer: `${prefix}${marketText}没有找到 ${skus.join("、")}。`, citations: [], toolsUsed: ["查询 SKU 详情"], mode: "mock" };
      const detail = rows.map((r) => `**${r.sku} · ${MARKETPLACE_LABEL[r.marketplace]}**：${r.plan.explanation}`).join("\n\n");
      return { answer: `${prefix}${planTable(rows)}\n\n${detail}`, citations: [], toolsUsed: ["查询 SKU 详情"], mode: "mock" };
    }

    let status: StockStatus[] | null = null;
    let title = "库存概况";
    if (/冗余|积压|滞销|太多/.test(question)) {
      status = ["excess"];
      title = "冗余库存";
    } else if (/断货|缺货/.test(question)) {
      status = ["stockout_risk"];
      title = "有断货风险的 SKU";
    } else if (/补货|下单/.test(question)) {
      status = ["stockout_risk", "reorder"];
      title = "需要补货的 SKU";
    }
    const rows = scoped(plans).filter((r) => !status || status.includes(r.plan.status));
    if (!status) {
      const counts = (["stockout_risk", "reorder", "healthy", "excess"] as StockStatus[])
        .map((s) => `${STOCK_STATUS_LABEL[s]} ${rows.filter((r) => r.plan.status === s).length} 个`)
        .join("，");
      const urgent = rows.filter((r) => r.plan.status === "stockout_risk" || r.plan.status === "reorder");
      return {
        answer: `${prefix}${marketText}共 ${rows.length} 个 SKU：${counts}。${urgent.length ? `\n\n需要关注的 SKU：\n\n${planTable(urgent)}` : ""}`,
        citations: [],
        toolsUsed: ["查询库存"],
        mode: "mock",
      };
    }
    if (rows.length === 0) return { answer: `${prefix}${marketText}目前没有${title}。`, citations: [], toolsUsed: ["查询库存"], mode: "mock" };
    return { answer: `${prefix}${marketText}${title}共 ${rows.length} 个：\n\n${planTable(rows)}`, citations: [], toolsUsed: ["查询库存"], mode: "mock" };
  }

  const hits = (await searchKnowledge(question, 3)).filter((h) => h.score >= KB_HIT_THRESHOLD);
  if (hits.length === 0) {
    return {
      answer: `${prefix}知识库中没有找到与这个问题相关的内容。可以换个关键词试试，或者请管理员把相关资料上传到知识库。`,
      citations: [],
      toolsUsed: ["检索知识库"],
      mode: "mock",
    };
  }
  const citations: Citation[] = hits.map((h: KbHit, i) => ({ n: i + 1, title: h.title, heading: h.heading, documentId: h.documentId, excerpt: h.content.slice(0, 160) }));
  const body = hits
    .map((h, i) => `**${h.title}${h.heading ? ` · ${h.heading}` : ""}** [${i + 1}]\n\n${h.content.split("\n").map((l) => `> ${l}`).join("\n")}`)
    .join("\n\n");
  return {
    answer: `${prefix}知识库中最相关的内容如下（接入大模型后会自动总结成答案）：\n\n${body}`,
    citations,
    toolsUsed: ["检索知识库"],
    mode: "mock",
  };
}

export async function answerQuestion(history: ChatTurn[]): Promise<AssistantAnswer> {
  if (llmEnabled()) return answerWithLlm(history);
  const last = [...history].reverse().find((t) => t.role === "user");
  return answerWithRules(last?.content ?? "");
}