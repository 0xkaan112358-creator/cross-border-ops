import { INTENT_LABEL, type TicketIntent } from "./constants";
import type { CsSettings } from "./settings-defaults";

export type RouteInput = {
  intent: TicketIntent;
  confidence: number;
  sentiment: string;
  orderStatus: string | null;
  kbHit: boolean;
  settings: CsSettings;
};

export type RouteDecision = { route: "auto" | "human"; reason: string };

export function decideRoute(input: RouteInput): RouteDecision {
  const { intent, confidence, sentiment, orderStatus, kbHit, settings } = input;
  if (!(settings.aiEligibleIntents as string[]).includes(intent)) {
    return { route: "human", reason: `「${INTENT_LABEL[intent]}」需要人工判断处理方案` };
  }
  if (confidence < settings.confidenceThreshold) {
    return {
      route: "human",
      reason: `AI 分类置信度 ${Math.round(confidence * 100)}% 低于阈值 ${Math.round(settings.confidenceThreshold * 100)}%`,
    };
  }
  if (sentiment === "angry") return { route: "human", reason: "客户情绪激烈，需要人工安抚" };
  if (intent === "logistics") {
    if (orderStatus === "已签收") {
      return { route: "human", reason: "物流显示已签收但客户仍在询问，可能丢件，需要人工核实" };
    }
    if (orderStatus === "待发货" || orderStatus === "部分发货") {
      return { route: "human", reason: `订单状态为「${orderStatus}」，需要人工确认发货安排` };
    }
    if (orderStatus === "已取消") {
      return { route: "human", reason: "订单已取消，需要人工核实后回复" };
    }
    if (orderStatus === "延误" || orderStatus === "异常") {
      return { route: "human", reason: "物流异常，需要人工联系承运商确认" };
    }
    return { route: "auto", reason: "物流查询，已根据订单物流信息生成回复" };
  }
  if (intent === "usage") {
    if (!kbHit) return { route: "human", reason: "知识库中没有找到可靠答案" };
    return { route: "auto", reason: "产品使用咨询，已根据知识库标准答案生成回复" };
  }
  return { route: "human", reason: "需要人工处理" };
}
