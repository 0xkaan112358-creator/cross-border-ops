"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Empty className="mt-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>页面加载出错了</EmptyTitle>
        <EmptyDescription>
          可能是数据暂时无法读取，请稍后重试。如果反复出现，请把错误编号发给管理员。
          {error.digest && <span className="mt-1 block font-mono text-xs">错误编号：{error.digest}</span>}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={reset}>重试</Button>
      </EmptyContent>
    </Empty>
  );
}
