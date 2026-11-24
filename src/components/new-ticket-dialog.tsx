"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MARKETPLACE_LABEL, MARKETPLACES } from "@/lib/constants";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";

const EMPTY = { marketplace: "US", orderId: "", customerName: "", subject: "", body: "" };
const marketItems = MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACE_LABEL[m] }));

export function NewTicketDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.body.trim().length < 2) {
      toast.error("请粘贴客户消息内容");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, channel: "手动录入" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失败");
      setForm(EMPTY);
      onCreated(data.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>录入客户消息</DialogTitle>
          <DialogDescription>粘贴买家邮件或站内信，AI 会识别语言、判断问题类型并决定是否转人工。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>站点</Label>
              <Select
                value={form.marketplace}
                onValueChange={(v) => setForm((f) => ({ ...f, marketplace: v ?? "US" }))}
                items={marketItems}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketItems.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-order">订单号（选填）</Label>
              <Input id="t-order" value={form.orderId} onChange={set("orderId")} placeholder="113-1234567-1234567" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-name">买家称呼（选填）</Label>
              <Input id="t-name" value={form.customerName} onChange={set("customerName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-subject">主题（选填）</Label>
              <Input id="t-subject" value={form.subject} onChange={set("subject")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-body">消息内容</Label>
            <Textarea
              id="t-body"
              value={form.body}
              onChange={set("body")}
              rows={7}
              placeholder="Hi, I ordered ... but it hasn't arrived yet."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "保存中…" : "保存并交给 AI 分拣"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
