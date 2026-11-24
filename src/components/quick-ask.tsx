"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export const EXAMPLE_QUESTIONS = [
  "美国站哪些 SKU 有断货风险？",
  "65W 充电器各站点还能卖几天？",
  "德国站卖带电产品需要哪些 EPR 注册？",
  "欧盟 GPSR 对产品标签有什么要求？",
];

export function QuickAsk() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const go = (q: string) => {
    if (!q.trim()) return;
    router.push(`/assistant?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
        className="flex gap-2"
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="例如：数据线在途的货什么时候到？" />
        <Button type="submit" size="icon" aria-label="提问" disabled={!value.trim()}>
          <ArrowUp />
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.slice(0, 3).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => go(q)}
            className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
