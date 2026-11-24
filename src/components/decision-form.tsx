"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

export function needsReason(suggested: number, final: number) {
  return suggested > 0 ? Math.abs(final - suggested) / suggested > 0.2 : final > 0;
}

export function DecisionForm({
  skuId,
  suggestedQty,
  compact = false,
  onSaved,
}: {
  skuId: number;
  suggestedQty: number;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(String(suggestedQty));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const finalQty = Number(qty);
  const valid = qty.trim() !== "" && Number.isInteger(finalQty) && finalQty >= 0;
  const reasonRequired = valid && needsReason(suggestedQty, finalQty);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    if (reasonRequired && !reason.trim()) {
      toast.error("与系统建议相差超过 20%，请填写调整原因");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/replenishment/decisions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skuId, suggestedQty, finalQty, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      toast.success(`已确认补货 ${finalQty.toLocaleString()} 件`);
      setReason("");
      onSaved?.();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        {!compact && <Label htmlFor={`qty-${skuId}`}>确认数量（件）</Label>}
        <Input
          id={`qty-${skuId}`}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
          aria-invalid={!valid}
        />
        {!compact && <p className="text-xs text-muted-foreground">系统建议 {suggestedQty.toLocaleString()} 件</p>}
      </div>
      {(reasonRequired || !compact) && (
        <div className="space-y-1.5">
          {!compact && <Label htmlFor={`reason-${skuId}`}>调整原因{reasonRequired ? "（必填）" : "（选填）"}</Label>}
          <Textarea
            id={`reason-${skuId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={reasonRequired ? "相差超过 20%，请说明原因，例如：工厂产能限制、计划清货" : "例如：配合大促提前备货"}
            rows={2}
          />
        </div>
      )}
      <Button type="submit" disabled={!valid || saving} className="w-full">
        {saving ? "保存中…" : "确认补货"}
      </Button>
    </form>
  );
}
