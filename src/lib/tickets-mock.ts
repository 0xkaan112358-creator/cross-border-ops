import type { TicketIntent } from "./constants";
import { tokenize } from "./kb-text";

export type Classification = {
  language: string;
  translation_zh: string | null;
  intent: TicketIntent;
  confidence: number;
  sentiment: "calm" | "negative" | "angry";
  urgency: "high" | "medium" | "low";
  summary_zh: string;
  order_id: string | null;
};

const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "my", "is", "you", "your", "it", "to", "can", "have", "with", "please", "thanks", "i", "what", "how", "when", "does"],
  de: ["und", "ich", "die", "der", "ist", "nicht", "mit", "meine", "sie", "bitte", "danke", "das", "auch", "wie", "hallo", "seit"],
  fr: ["le", "la", "les", "et", "je", "est", "pas", "mon", "ma", "vous", "merci", "une", "pour", "bonjour", "que"],
  it: ["il", "la", "non", "mio", "ho", "per", "grazie", "buongiorno", "sono", "un", "una", "che", "è", "dov'è"],
  es: ["el", "la", "no", "mi", "es", "por", "gracias", "hola", "se", "una", "cómo", "que", "puede", "y"],
};

export function detectLanguage(text: string): string {
  if (/[\u3400-\u9fff]/.test(text)) return "zh";
  const lower = text.toLowerCase();
  const words = lower.split(/[^a-zà-ÿ'’]+/).filter(Boolean);
  const scores: Record<string, number> = { en: 0, de: 0, fr: 0, it: 0, es: 0 };
  for (const [lang, list] of Object.entries(STOPWORDS)) {
    for (const w of words) if (list.includes(w)) scores[lang] += 1;
  }
  if (/[ßäöü]/.test(lower)) scores.de += 2;
  if (/[ñ¿¡]/.test(lower)) scores.es += 3;
  if (/[çêè]/.test(lower)) scores.fr += 2;
  if (/[òù]/.test(lower)) scores.it += 1;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : "other";
}

const INTENT_KEYWORDS: Record<Exclude<TicketIntent, "other">, RegExp[]> = {
  claim: [
    /a-?to-?z|a-?z claim|chargeback|1[- ]star|one[- ]star|negative review|bad review|report (you|this)|lawyer|scam|fraud/i,
    /anwalt|negative bewertung|betrug|a-bis-z/i,
    /avis négatif|arnaque|avocat|litige/i,
    /recensione negativa|truffa|avvocato/i,
    /reseña negativa|estafa|abogado/i,
    /差评|索赔|投诉/,
  ],
  quality: [
    /broken|defective|damaged|stopped working|doesn'?t work|not working|leak|poor quality|faulty|cracked|hotter than|overheat/i,
    /kaputt|defekt|beschädigt|funktioniert nicht|undicht/i,
    /cassé|défectueux|endommagé|ne fonctionne pas|fuit/i,
    /rotto|difettoso|danneggiato|non funziona|perde/i,
    /roto|defectuoso|dañado|no funciona|gotea/i,
    /坏了|损坏|质量问题|故障/,
  ],
  return: [
    /\breturn\b|refund|exchange|send (it )?back/i,
    /rücksendung|zurückschicken|erstattung|umtausch|rückerstattung/i,
    /retourner|rembours|échange|retour/i,
    /\breso\b|rimborso|restituire|cambio/i,
    /devolución|devolver|reembolso/i,
    /退货|退款|换货/,
  ],
  logistics: [
    /where is my (order|package|parcel)|when (will (it|my|the)|(it|my \w+|the \w+) will)|tracking|not (arrived|received)|hasn'?t arrived|never (got|received)|delivery|delivered|shipped|package|parcel|arriv|status of my (order|package)/i,
    /wo ist meine bestellung|sendung|lieferung|paket|nicht angekommen|ankommen/i,
    /où est ma commande|colis|livraison|suivi|pas reçu/i,
    /dov'è il mio ordine|pacco|consegna|spedizione|non è arrivato|tracciamento/i,
    /dónde está mi pedido|paquete|entrega|envío|no ha llegado|seguimiento/i,
    /物流|快递|到货|包裹|什么时候(能)?到/,
  ],
  usage: [
    /how (do|to|can|long)|instructions?|manual|compatible|work with|set ?up|charge|clean|wash|can i|is it|does it|can the|cut/i,
    /\bwie\b|anleitung|kompatibel|aufladen|reinigen|rutschfest/i,
    /comment|mode d'emploi|compatible|notice|nettoyer/i,
    /\bcome\b|istruzioni|compatibile|manuale|pulire/i,
    /cómo|instrucciones|compatible|manual|limpia|cortar/i,
    /怎么|如何|兼容|说明书/,
  ],
};

const ANGRY = /!!!|unacceptable|ridiculous|terrible|worst|furious|disgusting|inakzeptabel|unverschämt|schrecklich|inadmissible|inacceptable|honteux|inaccettabile|vergognoso|inaceptable|vergonzoso|太差|气死/i;
const NEGATIVE = /disappointed|unhappy|annoyed|frustrat|still|enttäuscht|leider|déçu|deluso|decepcionad|失望|不满/i;

const PRIORITY: Exclude<TicketIntent, "other">[] = ["claim", "quality", "return", "logistics", "usage"];

export const ORDER_ID_RE = /\b\d{3}-\d{7}-\d{7}\b/;

export function mockClassify(body: string, translation: string | null): Classification {
  const text = `${body}\n${translation ?? ""}`;
  let intent: TicketIntent = "other";
  let matches = 0;
  for (const candidate of PRIORITY) {
    const hit = INTENT_KEYWORDS[candidate].filter((re) => re.test(text)).length;
    if (hit > 0) {
      intent = candidate;
      matches = INTENT_KEYWORDS[candidate].reduce((n, re) => n + (text.match(new RegExp(re.source, "gi"))?.length ?? 0), 0);
      break;
    }
  }
  if (/wholesale|bulk|distributor|批发|großhandel|grossiste|ingrosso|mayorista/i.test(text)) {
    intent = "other";
    matches = 2;
  }
  const sentiment = ANGRY.test(text) ? "angry" : NEGATIVE.test(text) ? "negative" : "calm";
  const urgency =
    intent === "claim" || sentiment === "angry" ? "high" : intent === "quality" || sentiment === "negative" ? "medium" : "low";
  const confidence = intent === "other" ? (matches > 0 ? 0.8 : 0.5) : Math.min(0.92, 0.66 + 0.08 * matches);
  const source = (translation ?? body).replace(/\s+/g, " ").trim();
  return {
    language: detectLanguage(body),
    translation_zh: translation,
    intent,
    confidence: Math.round(confidence * 100) / 100,
    sentiment,
    urgency,
    summary_zh: source.length > 60 ? `${source.slice(0, 60)}…` : source,
    order_id: ORDER_ID_RE.exec(body)?.[0] ?? null,
  };
}

type Lang = "en" | "de" | "fr" | "it" | "es";
const LOCALE: Record<Lang, string> = { en: "en-US", de: "de-DE", fr: "fr-FR", it: "it-IT", es: "es-ES" };

function lang(l: string): Lang {
  return (["en", "de", "fr", "it", "es"] as const).includes(l as Lang) ? (l as Lang) : "en";
}

function formatDate(date: string, l: Lang) {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat(LOCALE[l], { day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

const STATUS_TEXT: Record<string, Record<Lang, string> & { zh: string }> = {
  运输中: { en: "in transit", de: "unterwegs", fr: "en cours d'acheminement", it: "in transito", es: "en tránsito", zh: "运输中" },
  派送中: { en: "out for delivery", de: "in Zustellung", fr: "en cours de livraison", it: "in consegna", es: "en reparto", zh: "正在派送" },
};

const SIGN: Record<Lang, string> = {
  en: "Best regards,\nCustomer Service",
  de: "Mit freundlichen Grüßen\nIhr Kundenservice",
  fr: "Cordialement,\nLe service client",
  it: "Cordiali saluti,\nServizio clienti",
  es: "Saludos cordiales,\nAtención al cliente",
};

const GREET: Record<Lang, (n: string) => string> = {
  en: (n) => `Hi ${n},`,
  de: (n) => `Hallo ${n},`,
  fr: (n) => `Bonjour ${n},`,
  it: (n) => `Buongiorno ${n},`,
  es: (n) => `Hola ${n}:`,
};

export type OrderInfo = {
  order_id: string;
  carrier: string | null;
  tracking_no: string | null;
  shipping_status: string | null;
  est_delivery: string | null;
};

export type ReplyDraft = { reply: string; reply_zh: string };

export function mockLogisticsReply(language: string, name: string, order: OrderInfo | null): ReplyDraft {
  const l = lang(language);
  const firstName = name.split(" ")[0] || name;
  if (!order) {
    const ask: Record<Lang, string> = {
      en: "Thank you for your message. To check the delivery status for you, could you please share your order number (format 123-1234567-1234567)? We will get back to you as soon as possible.",
      de: "vielen Dank für Ihre Nachricht. Damit wir den Lieferstatus prüfen können, teilen Sie uns bitte Ihre Bestellnummer mit (Format 123-1234567-1234567). Wir melden uns schnellstmöglich bei Ihnen.",
      fr: "merci pour votre message. Afin de vérifier le statut de livraison, pourriez-vous nous communiquer votre numéro de commande (format 123-1234567-1234567) ? Nous reviendrons vers vous au plus vite.",
      it: "grazie per il suo messaggio. Per verificare lo stato della consegna, potrebbe indicarci il numero dell'ordine (formato 123-1234567-1234567)? Le risponderemo il prima possibile.",
      es: "gracias por su mensaje. Para comprobar el estado de la entrega, ¿podría indicarnos su número de pedido (formato 123-1234567-1234567)? Le responderemos lo antes posible.",
    };
    return {
      reply: `${GREET[l](firstName)}\n\n${ask[l]}\n\n${SIGN[l]}`,
      reply_zh: `${firstName} 您好：感谢来信。为了帮您查询物流状态，请提供订单号（格式 123-1234567-1234567），我们会尽快回复。`,
    };
  }
  const st = STATUS_TEXT[order.shipping_status ?? ""] ?? STATUS_TEXT["运输中"];
  const eta = order.est_delivery ? formatDate(order.est_delivery, l) : "—";
  const body: Record<Lang, string> = {
    en: `Thank you for reaching out. Your order ${order.order_id} is currently ${st.en} with ${order.carrier} (tracking number: ${order.tracking_no}). The estimated delivery date is ${eta}.\n\nYou can follow the latest status in Your Orders at any time. If the package has not arrived by then, please let us know and we will be happy to help.`,
    de: `vielen Dank für Ihre Nachricht. Ihre Bestellung ${order.order_id} ist derzeit ${st.de} mit ${order.carrier} (Sendungsnummer: ${order.tracking_no}). Voraussichtliches Lieferdatum: ${eta}.\n\nDen aktuellen Status können Sie jederzeit unter „Meine Bestellungen" verfolgen. Sollte das Paket bis dahin nicht angekommen sein, melden Sie sich bitte gerne bei uns.`,
    fr: `merci pour votre message. Votre commande ${order.order_id} est actuellement ${st.fr} avec ${order.carrier} (numéro de suivi : ${order.tracking_no}). Date de livraison estimée : ${eta}.\n\nVous pouvez suivre son statut à tout moment dans « Vos commandes ». Si le colis n'est pas arrivé d'ici là, n'hésitez pas à nous contacter.`,
    it: `grazie per averci contattato. Il suo ordine ${order.order_id} è attualmente ${st.it} con ${order.carrier} (numero di tracciamento: ${order.tracking_no}). Data di consegna prevista: ${eta}.\n\nPuò seguire lo stato aggiornato in qualsiasi momento in «I miei ordini». Se il pacco non dovesse arrivare entro tale data, non esiti a contattarci.`,
    es: `gracias por escribirnos. Su pedido ${order.order_id} está actualmente ${st.es} con ${order.carrier} (número de seguimiento: ${order.tracking_no}). Fecha de entrega estimada: ${eta}.\n\nPuede consultar el estado actualizado en cualquier momento en «Mis pedidos». Si el paquete no ha llegado para esa fecha, no dude en contactarnos.`,
  };
  return {
    reply: `${GREET[l](firstName)}\n\n${body[l]}\n\n${SIGN[l]}`,
    reply_zh: `${firstName} 您好：感谢联系。您的订单 ${order.order_id} 目前${st.zh}，承运商 ${order.carrier}，追踪号 ${order.tracking_no}，预计 ${order.est_delivery ?? "—"} 送达。您可以随时在"我的订单"中查看最新状态，如到时仍未收到请联系我们。`,
  };
}

export function mockHumanDraft(language: string, name: string): ReplyDraft {
  const l = lang(language);
  const firstName = name.split(" ")[0] || name;
  const body: Record<Lang, string> = {
    en: "Thank you for contacting us, and we are sorry for the trouble.",
    de: "vielen Dank für Ihre Nachricht, und es tut uns leid für die Unannehmlichkeiten.",
    fr: "merci de nous avoir contactés, et nous sommes désolés pour ce désagrément.",
    it: "grazie per averci contattato e ci scusiamo per l'inconveniente.",
    es: "gracias por contactarnos y lamentamos las molestias.",
  };
  const placeholder = "【待确认：请补充处理方案，例如退款、补发，或请客户提供照片】";
  return {
    reply: `${GREET[l](firstName)}\n\n${body[l]} ${placeholder}\n\n${SIGN[l]}`,
    reply_zh: `${firstName} 您好：感谢联系，给您带来不便深表歉意。${placeholder}`,
  };
}

export function mockUsageReply(
  language: string,
  name: string,
  question: string,
  passage: { title: string; content: string },
): ReplyDraft | null {
  if (language !== "en") return null;
  const pairs = [...passage.content.matchAll(/Q:\s*(.+?)\nA:\s*([\s\S]+?)(?=\nQ:|$)/g)].map((m) => ({
    q: m[1],
    a: m[2].trim(),
  }));
  if (pairs.length === 0) return null;
  const qTokens = new Set(tokenize(question));
  const best = pairs
    .map((p) => ({ ...p, score: tokenize(`${p.q} ${p.a}`).filter((t) => qTokens.has(t)).length }))
    .sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 2) return null;
  const firstName = name.split(" ")[0] || name;
  return {
    reply: `${GREET.en(firstName)}\n\nThank you for your question. ${best.a}\n\nIf you have any other questions, feel free to let us know.\n\n${SIGN.en}`,
    reply_zh: `（模拟模式）引用知识库《${passage.title}》中的标准答案：问「${best.q}」。`,
  };
}
