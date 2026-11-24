"use client";

import { CircleCheck, Database, Download, RotateCcw, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Spinner } from "./ui/spinner";

export type ImportDefView = {
  type: string;
  title: string;
  description: string;
  fields: { label: string; required: boolean; note: string | null }[];
  count: number;
};

type Result = { total: number; inserted: number; updated: number; errors: { row: number; message: string }[] };

function ImportCard({ def, step }: { def: ImportDefView; step: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<(Result & { file: string }) | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/import/${def.type}`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "导入失败");
      setResult({ ...data, file: file.name });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary">{step}</span>
          {def.title}
        </CardTitle>
        <CardDescription>{def.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {def.fields.map((f) => (
            <span
              key={f.label}
              title={f.note ?? undefined}
              className={
                f.required
                  ? "rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary"
                  : "rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              }
            >
              {f.label}
              {f.required && " *"}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner /> : <Upload />} 上传文件
          </Button>
          <a href={`/api/import/${def.type}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download /> 下载模板
          </a>
          <span className="ml-auto text-xs text-muted-foreground">当前 {def.count.toLocaleString()} 条</span>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </div>
        {result && (
          <div className="rounded-lg border p-3 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              {result.errors.length === 0 ? (
                <CircleCheck className="size-3.5 text-emerald-600" />
              ) : (
                <TriangleAlert className="size-3.5 text-amber-600" />
              )}
              {result.file}：共 {result.total} 行，新增 {result.inserted}，更新 {result.updated}
              {result.errors.length > 0 && `，${result.errors.length} 行失败`}
            </div>
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-36 space-y-0.5 overflow-auto text-red-700">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    第 {e.row} 行：{e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ImportBoard({ defs }: { defs: ImportDefView[] }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"sample" | "empty" | null>(null);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    if (!confirm) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: confirm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "操作失败");
      toast.success(confirm === "sample" ? "已恢复示例数据" : "已清空业务数据，可以开始导入公司数据");
      setConfirm(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {defs.map((d, i) => (
          <ImportCard key={d.type} def={d} step={i + 1} />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" /> 示例数据
          </CardTitle>
          <CardDescription>
            系统预置了 14 款产品、6 个站点的示例数据用于体验。正式使用前请清空示例，再按顺序导入公司数据。知识库中你上传的资料不受影响。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConfirm("sample")}>
            <RotateCcw /> 恢复示例数据
          </Button>
          <Button variant="destructive" onClick={() => setConfirm("empty")}>
            <Trash2 /> 清空业务数据
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirm != null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirm === "sample" ? "恢复示例数据" : "清空业务数据"}</DialogTitle>
            <DialogDescription>
              这会删除所有 SKU、库存、销量、货件、订单、工单和补货记录
              {confirm === "sample" ? "，然后重新生成示例数据。" : "，以及内置的示例资料。"}此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={reset} disabled={resetting}>
              {resetting && <Spinner />} 确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
