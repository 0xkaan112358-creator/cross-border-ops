import { describe, expect, it } from "vitest";
import { checkReply } from "@/lib/compliance";
import { DEFAULT_CS } from "@/lib/settings-defaults";
import { decideRoute, type RouteInput } from "@/lib/ticket-routing";

const base: RouteInput = { intent: "logistics", confidence: 0.9, sentiment: "calm", orderStatus: "已发货", kbHit: false, settings: DEFAULT_CS };

describe("decideRoute", () => {
  it("drafts a reply for a calm, confident logistics question on a shipped order", () => {
    expect(decideRoute(base).route).toBe("auto");
  });

  it.each(["待发货", "部分发货", "待审核", "已取消", "已签收", "延误"])("sends order status %s to a person", (orderStatus) => {
    expect(decideRoute({ ...base, orderStatus }).route).toBe("human");
  });

  it("sends low confidence, angry customers and non-eligible intents to a person", () => {
    expect(decideRoute({ ...base, confidence: 0.5 }).reason).toContain("低于阈值");
    expect(decideRoute({ ...base, sentiment: "angry" }).route).toBe("human");
    expect(decideRoute({ ...base, intent: "return" }).route).toBe("human");
    expect(decideRoute({ ...base, settings: { ...DEFAULT_CS, aiEligibleIntents: ["usage"] } }).route).toBe("human");
  });

  it("answers usage questions only from the knowledge base", () => {
    expect(decideRoute({ ...base, intent: "usage", kbHit: true }).route).toBe("auto");
    expect(decideRoute({ ...base, intent: "usage", kbHit: false }).route).toBe("human");
  });
});

describe("checkReply", () => {
  it("blocks asking for reviews in exchange for a benefit", () => {
    const flags = checkReply("We will send you a refund if you leave a 5-star review.");
    expect(flags.some((f) => f.level === "block")).toBe(true);
  });

  it("flags off-platform contact details", () => {
    expect(checkReply("Please email us at help@example.com").map((f) => f.rule)).toContain("包含邮箱等站外联系方式");
  });

  it("passes a plain logistics reply", () => {
    expect(checkReply("Your order has shipped and is expected to arrive on Friday.")).toEqual([]);
  });
});
