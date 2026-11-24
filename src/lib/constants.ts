export const MARKETPLACES = ["US", "UK", "DE", "FR", "IT", "ES"] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const MARKETPLACE_LABEL: Record<string, string> = {
  US: "美国站",
  UK: "英国站",
  DE: "德国站",
  FR: "法国站",
  IT: "意大利站",
  ES: "西班牙站",
};

const MARKETPLACE_ALIASES: Record<string, Marketplace> = {
  us: "US",
  usa: "US",
  美国: "US",
  美国站: "US",
  "amazon.com": "US",
  uk: "UK",
  gb: "UK",
  英国: "UK",
  英国站: "UK",
  "amazon.co.uk": "UK",
  de: "DE",
  德国: "DE",
  德国站: "DE",
  "amazon.de": "DE",
  fr: "FR",
  法国: "FR",
  法国站: "FR",
  "amazon.fr": "FR",
  it: "IT",
  意大利: "IT",
  意大利站: "IT",
  "amazon.it": "IT",
  es: "ES",
  西班牙: "ES",
  西班牙站: "ES",
  "amazon.es": "ES",
};

export function normalizeMarketplace(value: unknown): Marketplace | null {
  if (value == null) return null;
  const key = String(value).trim().toLowerCase();
  return MARKETPLACE_ALIASES[key] ?? null;
}

export const STOCK_STATUS = ["stockout_risk", "reorder", "healthy", "excess"] as const;
export type StockStatus = (typeof STOCK_STATUS)[number];

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  stockout_risk: "断货风险",
  reorder: "需补货",
  healthy: "健康",
  excess: "冗余",
};

export const TICKET_INTENTS = ["logistics", "usage", "return", "quality", "claim", "other"] as const;
export type TicketIntent = (typeof TICKET_INTENTS)[number];

export const INTENT_LABEL: Record<TicketIntent, string> = {
  logistics: "物流查询",
  usage: "产品使用咨询",
  return: "退换货申请",
  quality: "质量投诉",
  claim: "索赔 / 差评威胁",
  other: "其他",
};

export const SIMPLE_ELIGIBLE_INTENTS: TicketIntent[] = ["logistics", "usage"];

export const TICKET_STATUS_LABEL: Record<string, string> = {
  new: "待处理",
  pending_human: "待人工处理",
  draft_ready: "AI 草稿待确认",
  sent: "已回复",
  closed: "已关闭",
};

export const URGENCY_LABEL: Record<string, string> = { high: "紧急", medium: "一般", low: "不急" };
export const SENTIMENT_LABEL: Record<string, string> = { calm: "平和", negative: "不满", angry: "愤怒" };

export const LANGUAGE_LABEL: Record<string, string> = {
  en: "英语",
  de: "德语",
  fr: "法语",
  it: "意大利语",
  es: "西班牙语",
  zh: "中文",
  other: "其他",
};

export const SHIP_METHOD_LABEL: Record<string, string> = {
  sea: "海运",
  air: "空运",
  rail: "铁路",
  express: "快递",
};

export const ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  cs: "客服",
  staff: "员工",
};

export const KB_CATEGORIES = ["平台规则", "物流关务", "认证标准", "产品资料", "公司SOP", "其他"] as const;
