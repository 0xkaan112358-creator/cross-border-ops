"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { INTENT_LABEL, MARKETPLACE_LABEL, MARKETPLACES, ROLE_LABEL } from "@/lib/constants";
import type { CsSettings, ReplenishmentSettings } from "@/lib/settings-defaults";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Spinner } from "./ui/spinner";
import { Switch } from "./ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

type Promo = { id: number; name: string; marketplace: string | null; start_date: string; end_date: string; factor: number };
type RoleRow = { email: string; role: "admin" | "cs"; updated_by: string | null };
type Llm = { enabled: boolean; model: string; host: string };

async function request(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "操作失败");
  return data;
}

function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="w-28" />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ReplenishmentForm({ initial }: { initial: ReplenishmentSettings }) {
  const router = useRouter();
  const [v, setV] = useState({
    safetyDays: String(initial.safetyDays),
    coverDays: String(initial.coverDays),
    excessBufferDays: String(initial.excessBufferDays),
    agedShare: String(Math.round(initial.agedShareThreshold * 100)),
    w7: String(initial.weights[0]),
    w14: String(initial.weights[1]),
    w30: String(initial.weights[2]),
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof v) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: ReplenishmentSettings = {
      safetyDays: Number(v.safetyDays),
      coverDays: Number(v.coverDays),
      excessBufferDays: Number(v.excessBufferDays),
      agedShareThreshold: Number(v.agedShare) / 100,
      weights: [Number(v.w7), Number(v.w14), Number(v.w30)],
    };
    if (Object.values(payload).flat().some((n) => !Number.isFinite(n))) return toast.error("请填写有效数字");
    setSaving(true);
    try {
      await request("/api/settings", "PUT", { replenishment: payload });
      toast.success("补货参数已保存，补货建议已按新参数重新计算");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>补货参数</CardTitle>
        <CardDescription>全部 SKU 共用。补货量 = 预测日均 ×（全程提前期 + 安全天数 + 覆盖天数）− 现有全部库存，再按箱规和起订量取整。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <NumberField id="safety" label="安全库存天数" suffix="天" value={v.safetyDays} onChange={set("safetyDays")} hint="应对销量波动和物流延误" />
            <NumberField id="cover" label="到货后覆盖天数" suffix="天" value={v.coverDays} onChange={set("coverDays")} hint="每批货预计能卖多久" />
            <NumberField id="buffer" label="冗余判定缓冲" suffix="天" value={v.excessBufferDays} onChange={set("excessBufferDays")} hint="超出补货目标这么多天视为冗余" />
            <NumberField id="aged" label="超龄库存占比警戒" suffix="%" value={v.agedShare} onChange={set("agedShare")} hint="超龄库存占比达到即标记冗余" />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">日均销量权重</div>
            <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-4">
              <NumberField id="w7" label="近 7 天" value={v.w7} onChange={set("w7")} hint="反映最新趋势" />
              <NumberField id="w14" label="近 14 天" value={v.w14} onChange={set("w14")} hint="平滑短期波动" />
              <NumberField id="w30" label="近 30 天" value={v.w30} onChange={set("w30")} hint="反映长期水平" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">断货日和大促日的销量会先剔除或还原，避免低估或高估。</p>
          </div>
          <Button type="submit" disabled={saving}>
            {saving && <Spinner />} 保存
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const ALL = "all";
const promoMarketItems = [{ value: ALL, label: "全部站点" }, ...MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACE_LABEL[m] }))];

function PromotionsCard({ promotions }: { promotions: Promo[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", marketplace: ALL, startDate: "", endDate: "", factor: "1.5" });
  const [saving, setSaving] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await request("/api/settings/promotions", "POST", {
        name: form.name,
        marketplace: form.marketplace === ALL ? null : form.marketplace,
        startDate: form.startDate,
        endDate: form.endDate,
        factor: Number(form.factor),
      });
      toast.success("已添加大促");
      setForm((f) => ({ ...f, name: "", startDate: "", endDate: "" }));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await request(`/api/settings/promotions?id=${id}`, "DELETE");
      toast.success("已删除");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>大促日历</CardTitle>
        <CardDescription>大促期间的预测销量 = 日常日均 × 系数。例如黑五销量通常是平时的 1.5～2.5 倍，可参考往年数据填写。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <div className="space-y-1.5 lg:col-span-2">
            <Label htmlFor="p-name">名称</Label>
            <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：Prime Day" />
          </div>
          <div className="space-y-1.5">
            <Label>站点</Label>
            <Select
              value={form.marketplace}
              onValueChange={(v) => setForm({ ...form, marketplace: v ?? ALL })}
              items={promoMarketItems}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {promoMarketItems.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-start">开始</Label>
            <Input id="p-start" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-end">结束</Label>
            <Input id="p-end" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-factor">系数</Label>
              <Input id="p-factor" inputMode="decimal" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} className="w-20" />
            </div>
            <Button type="submit" disabled={saving} aria-label="添加大促">
              {saving ? <Spinner /> : <Plus />} 添加
            </Button>
          </div>
        </form>
        {promotions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">还没有配置大促。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">名称</TableHead>
                  <TableHead>站点</TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead className="text-right">系数</TableHead>
                  <TableHead className="w-12 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-4 font-medium">{p.name}</TableCell>
                    <TableCell>{p.marketplace ? MARKETPLACE_LABEL[p.marketplace] : "全部站点"}</TableCell>
                    <TableCell className="tabular-nums">
                      {p.start_date} ~ {p.end_date}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">×{p.factor}</TableCell>
                    <TableCell className="pr-4">
                      <Button variant="ghost" size="icon-sm" aria-label={`删除 ${p.name}`} onClick={() => remove(p.id)}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CsForm({ initial }: { initial: CsSettings }) {
  const router = useRouter();
  const [threshold, setThreshold] = useState(String(Math.round(initial.confidenceThreshold * 100)));
  const [intents, setIntents] = useState<CsSettings["aiEligibleIntents"]>(initial.aiEligibleIntents);
  const [saving, setSaving] = useState(false);

  const toggle = (intent: "logistics" | "usage", on: boolean) =>
    setIntents((list) => (on ? [...new Set([...list, intent])] : list.filter((i) => i !== intent)));

  const save = async () => {
    const t = Number(threshold) / 100;
    if (!Number.isFinite(t) || t < 0.3 || t > 0.99) return toast.error("置信度阈值应在 30%～99% 之间");
    setSaving(true);
    try {
      await request("/api/settings", "PUT", { cs: { confidenceThreshold: t, aiEligibleIntents: intents } });
      toast.success("客服分流规则已保存，对之后处理的消息生效");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>客服分流规则</CardTitle>
        <CardDescription>
          满足全部条件才由 AI 起草回复：问题类型在下方开启、AI 置信度达到阈值、客户情绪不是愤怒；物流查询还要求订单状态正常，产品咨询要求知识库中有相关资料。其余一律转人工。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {(["logistics", "usage"] as const).map((intent) => (
            <div key={intent} className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{INTENT_LABEL[intent]}由 AI 起草</div>
                <div className="text-xs text-muted-foreground">
                  {intent === "logistics" ? "根据订单物流信息回复“包裹到哪了”" : "根据知识库中的产品资料回答使用问题"}
                </div>
              </div>
              <Switch checked={intents.includes(intent)} onCheckedChange={(on) => toggle(intent, on)} />
            </div>
          ))}
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            退换货、质量投诉、索赔和差评威胁始终转人工处理。
          </div>
        </div>
        <NumberField
          id="threshold"
          label="AI 置信度阈值"
          suffix="%"
          value={threshold}
          onChange={setThreshold}
          hint="AI 对问题分类的把握低于该值时转人工。调高更保守，调低 AI 处理得更多。"
        />
        <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/30 p-3 opacity-80">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              简单问题自动发送 <Badge variant="outline" className="font-normal">二期</Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              需接入邮箱或亚马逊买家消息接口后可用。建议在“草稿采纳率”稳定在 90% 以上后再开启。
            </div>
          </div>
          <Switch checked={false} disabled aria-label="简单问题自动发送（二期）" />
        </div>
        <Button onClick={save} disabled={saving}>
          {saving && <Spinner />} 保存
        </Button>
      </CardContent>
    </Card>
  );
}

const roleItems = [
  { value: "cs", label: ROLE_LABEL.cs },
  { value: "admin", label: ROLE_LABEL.admin },
];

function RolesCard({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "cs">("cs");
  const [saving, setSaving] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await request("/api/settings/roles", "POST", { email, role });
      toast.success("已保存");
      setEmail("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (target: string) => {
    try {
      await request(`/api/settings/roles?email=${encodeURIComponent(target)}`, "DELETE");
      toast.success("已移除，该成员恢复为普通员工");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除失败");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>成员角色</CardTitle>
        <CardDescription>
          所有登录的同事默认是“普通员工”，可以查库存、看补货计划、用问答助手。客服可以处理工单；管理员还可以导入数据、管理知识库和修改设置。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="同事的登录邮箱"
            className="sm:max-w-xs"
          />
          <Select value={role} onValueChange={(v) => setRole((v as "admin" | "cs") ?? "cs")} items={roleItems}>
            <SelectTrigger className="w-full sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleItems.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={saving || !email.trim()}>
            {saving ? <Spinner /> : <Plus />} 添加
          </Button>
        </form>
        {roles.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">还没有设置客服或管理员。</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {roles.map((r) => (
              <li key={r.email} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">{r.email}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant={r.role === "admin" ? "default" : "secondary"}>{ROLE_LABEL[r.role]}</Badge>
                  <Button variant="ghost" size="icon-sm" aria-label={`移除 ${r.email}`} onClick={() => remove(r.email)}>
                    <Trash2 />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LlmCard({ llm }: { llm: Llm }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>大模型</CardTitle>
        <CardDescription>通过环境变量配置，支持 DeepSeek、通义千问、智谱等兼容 OpenAI 接口的国产模型。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">状态：</span>
          {llm.enabled ? (
            <Badge className="bg-emerald-600">已接入</Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700">模拟模式</Badge>
          )}
        </div>
        <div>
          <span className="text-muted-foreground">模型：</span>
          <span className="font-mono">{llm.model}</span>
        </div>
        <div>
          <span className="text-muted-foreground">接口地址：</span>
          <span className="font-mono">{llm.host}</span>
        </div>
        {!llm.enabled && (
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            尚未配置 LLM_API_KEY，问答、工单分类和回复目前由规则和模板生成：可以完整体验流程，但只能识别常见说法，回复也只覆盖标准场景。配置密钥后会自动切换为大模型。
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function SettingsBoard({
  replenishment,
  cs,
  promotions,
  roles,
  llm,
}: {
  replenishment: ReplenishmentSettings;
  cs: CsSettings;
  promotions: Promo[];
  roles: RoleRow[];
  llm: Llm;
}) {
  return (
    <Tabs defaultValue="replenishment">
      <TabsList className="mb-4 flex-wrap">
        <TabsTrigger value="replenishment">补货参数</TabsTrigger>
        <TabsTrigger value="promotions">大促日历</TabsTrigger>
        <TabsTrigger value="cs">客服分流</TabsTrigger>
        <TabsTrigger value="roles">成员角色</TabsTrigger>
        <TabsTrigger value="llm">大模型</TabsTrigger>
      </TabsList>
      <TabsContent value="replenishment">
        <ReplenishmentForm initial={replenishment} />
      </TabsContent>
      <TabsContent value="promotions">
        <PromotionsCard promotions={promotions} />
      </TabsContent>
      <TabsContent value="cs">
        <CsForm initial={cs} />
      </TabsContent>
      <TabsContent value="roles">
        <RolesCard roles={roles} />
      </TabsContent>
      <TabsContent value="llm">
        <LlmCard llm={llm} />
      </TabsContent>
    </Tabs>
  );
}
