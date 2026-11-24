"use client";

import { FileText, Search, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KB_CATEGORIES } from "@/lib/constants";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { ScrollArea } from "./ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";
import { Spinner } from "./ui/spinner";

export type KbDoc = {
  id: number;
  title: string;
  category: string;
  filename: string | null;
  char_count: number;
  chunk_count: number;
  uploaded_by: string | null;
  is_sample: boolean;
  created_at: string;
};

type Chunk = { id: number; idx: number; heading: string | null; content: string };
type Hit = { chunkId: number; documentId: number; title: string; heading: string | null; content: string; score: number };

const categoryItems = KB_CATEGORIES.map((c) => ({ value: c, label: c }));

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("平台规则");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("请选择文件");
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title);
      form.append("category", category);
      const res = await fetch("/api/knowledge", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "上传失败");
      toast.success(`已入库，切分为 ${data.chunks} 个片段`);
      setFile(null);
      setTitle("");
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>上传资料</DialogTitle>
          <DialogDescription>支持 PDF、Word（.docx）、Markdown、TXT，单个文件不超过 10MB。扫描版 PDF 无法识别文字。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kb-file">文件</Label>
            <Input
              id="kb-file"
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-title">标题</Label>
            <Input id="kb-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：德国站 EPR 注册指南" />
          </div>
          <div className="space-y-1.5">
            <Label>分类</Label>
            <Select value={category} onValueChange={(v) => setCategory(v ?? "其他")} items={categoryItems}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={saving || !file}>
              {saving ? <Spinner /> : <Upload />} 上传并入库
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SearchTester() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ hits: Hit[]; threshold: number } | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "检索失败");
      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "检索失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>检索测试</CardTitle>
        <CardDescription>输入问题，看看问答助手和客服 AI 会引用哪些资料片段</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={search} className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例如：GPSR 欧盟负责人" />
          <Button type="submit" variant="outline" size="icon" aria-label="检索" disabled={loading}>
            {loading ? <Spinner /> : <Search />}
          </Button>
        </form>
        {result &&
          (result.hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">没有找到相关片段。</p>
          ) : (
            <ul className="space-y-2">
              {result.hits.map((h) => (
                <li key={h.chunkId} className="rounded-lg border p-2.5 text-xs">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {h.title}
                      {h.heading && <span className="text-muted-foreground"> · {h.heading}</span>}
                    </span>
                    <span className={cn("shrink-0 tabular-nums", h.score >= result.threshold ? "text-emerald-700" : "text-muted-foreground")}>
                      {h.score.toFixed(1)}
                      {h.score >= result.threshold ? " 相关" : " 弱相关"}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-muted-foreground">{h.content}</p>
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}

export function KnowledgeBoard({ docs, isAdmin, initialDocId }: { docs: KbDoc[]; isAdmin: boolean; initialDocId: number | null }) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("all");
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(initialDocId);
  const [loaded, setDetail] = useState<{ id: number; title: string; category: string; chunks: Chunk[] } | null>(null);
  const detail = loaded && loaded.id === openId ? loaded : null;
  const [toDelete, setToDelete] = useState<KbDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (openId == null) return;
    let cancelled = false;
    fetch(`/api/knowledge/${openId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "加载失败");
        if (!cancelled) setDetail(data);
      })
      .catch((e) => {
        toast.error(e.message);
        setOpenId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/knowledge/${toDelete.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "删除失败");
      toast.success("已删除");
      setToDelete(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  };

  const counts = Object.fromEntries(KB_CATEGORIES.map((c) => [c, docs.filter((d) => d.category === c).length]));
  const filtered = category === "all" ? docs : docs.filter((d) => d.category === category);
  const hasSample = docs.some((d) => d.is_sample);

  return (
    <>
      <PageHeader
        title="知识库"
        description="平台规则、物流关务、认证标准、产品资料和公司 SOP。问答助手和客服 AI 只依据这里的资料回答。"
        actions={
          isAdmin && (
            <Button onClick={() => setUploading(true)}>
              <Upload /> 上传资料
            </Button>
          )
        }
      />
      {hasSample && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          标有“示例”的资料是系统内置的参考内容，可能不是最新政策，请上传公司内部核实过的版本后删除示例。
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...KB_CATEGORIES] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  category === c ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                )}
              >
                {c === "all" ? "全部" : c}
                <span className="ml-1.5 tabular-nums opacity-70">{c === "all" ? docs.length : counts[c]}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>{docs.length === 0 ? "知识库还是空的" : "这个分类下还没有资料"}</EmptyTitle>
                <EmptyDescription>
                  {isAdmin ? "点击右上角“上传资料”添加 PDF、Word 或 Markdown 文档。" : "请联系管理员上传资料。"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-2">
              {filtered.map((d) => (
                <Card key={d.id} size="sm" className="px-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <FileText className="size-4 text-primary" />
                    </div>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenId(d.id)}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium hover:underline">{d.title}</span>
                        <Badge variant="secondary" className="font-normal">
                          {d.category}
                        </Badge>
                        {d.is_sample && (
                          <Badge variant="outline" className="font-normal text-amber-700">
                            示例
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {d.chunk_count} 个片段 · {d.char_count.toLocaleString()} 字
                        {d.uploaded_by && ` · ${d.uploaded_by}`} · {formatDateTime(d.created_at)}
                      </div>
                    </button>
                    {isAdmin && (
                      <Button variant="ghost" size="icon-sm" aria-label="删除" onClick={() => setToDelete(d)}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <div>
          <SearchTester />
        </div>
      </div>

      <Sheet open={openId != null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{detail?.title ?? "加载中…"}</SheetTitle>
            <SheetDescription>
              {detail ? `${detail.category} · 共 ${detail.chunks.length} 个片段，检索时以片段为单位引用` : " "}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
            {detail ? (
              <div className="space-y-3">
                {detail.chunks.map((c) => (
                  <div key={c.id} className="rounded-lg border p-3">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">
                      片段 {c.idx + 1}
                      {c.heading && ` · ${c.heading}`}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={toDelete != null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>删除资料</DialogTitle>
            <DialogDescription>确定删除“{toDelete?.title}”吗？删除后问答助手和客服 AI 将不再引用它。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting ? <Spinner /> : <Trash2 />} 删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UploadDialog open={uploading} onOpenChange={setUploading} />
    </>
  );
}
