"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";

export function ExplainButton({ skuId }: { skuId: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ mode: string; text: string } | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/replenishment/${skuId}/explain`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI 解读失败");
      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 解读失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={run} disabled={loading}>
        {loading ? <Spinner /> : <Sparkles />} AI 解读
      </Button>
      {result && (
        <div className="rounded-lg border border-primary/20 p-3 text-sm leading-relaxed">
          {result.mode === "mock" && (
            <div className="mb-1 text-xs text-amber-600">模拟模式：未配置大模型，以下为规则生成的说明。</div>
          )}
          <p className="whitespace-pre-wrap">{result.text}</p>
        </div>
      )}
    </div>
  );
}
