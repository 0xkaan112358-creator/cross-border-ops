export type ComplianceFlag = { rule: string; level: "block" | "warn"; match: string };

const RULES: { rule: string; level: "block" | "warn"; patterns: RegExp[] }[] = [
  {
    rule: "以利益换取评价",
    level: "block",
    patterns: [
      /(refund|discount|coupon|gift|free|reward|compensat\w*|rabatt|gutschein|réduction|remise|sconto|descuento|reembolso|退款|返现|折扣|礼品)[^.!?\n。！？]{0,60}(review|feedback|rating|bewertung|rezension|avis|recensione|reseña|valoración|评价|好评)/i,
      /(review|feedback|rating|bewertung|rezension|avis|recensione|reseña|评价|好评)[^.!?\n。！？]{0,60}(refund|discount|coupon|gift|free|reward|rabatt|gutschein|réduction|sconto|descuento|退款|返现|折扣|礼品)/i,
    ],
  },
  {
    rule: "索要好评",
    level: "block",
    patterns: [
      /(positive|5[- ]?star|five[- ]star|good|great)\s+(review|feedback|rating)/i,
      /leave\s+(us\s+)?(a\s+)?(review|feedback|rating)/i,
      /(positive bewertung|5[- ]sterne|avis positif|5 étoiles|recensione positiva|5 stelle|reseña positiva|5 estrellas|好评|五星)/i,
    ],
  },
  {
    rule: "包含外部链接",
    level: "block",
    patterns: [/(https?:\/\/|www\.)(?!([a-z0-9-]+\.)*amazon\.)[^\s]+/i],
  },
  {
    rule: "包含邮箱等站外联系方式",
    level: "block",
    patterns: [/[\w.+-]+@(?!marketplace\.amazon)[\w-]+\.[a-z.]{2,}/i],
  },
  {
    rule: "引导站外沟通或交易",
    level: "block",
    patterns: [/(whatsapp|wechat|telegram|paypal|微信|our (own )?website|contact us directly|outside (of )?amazon|call us at)/i],
  },
  {
    rule: "营销推广内容",
    level: "warn",
    patterns: [
      /(coupon code|discount code|promo code|check out our (other|new) products|new arrivals|gutscheincode|code promo|codice sconto|código de descuento|优惠码)/i,
    ],
  },
  {
    rule: "仍有待确认的占位内容",
    level: "block",
    patterns: [/【待确认[^】]*】/],
  },
];

export function checkReply(text: string): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  for (const r of RULES) {
    for (const p of r.patterns) {
      const m = p.exec(text);
      if (m) {
        flags.push({ rule: r.rule, level: r.level, match: m[0].slice(0, 80) });
        break;
      }
    }
  }
  return flags;
}
