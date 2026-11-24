"use client";

import { ArrowUp, BookOpen, Bot, RotateCcw, SquarePen, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Markdown } from "./markdown";
import { EXAMPLE_QUESTIONS } from "./quick-ask";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Textarea } from "./ui/textarea";

type Citation = { n: number; title: string; heading: string | null; documentId: number; excerpt: string };
type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; citations: Citation[]; toolsUsed: string[]; mode: "llm" | "mock" };

const MORE_EXAMPLES = [
  ...EXAMPLE_QUESTIONS,
  "冗余库存有哪些？",
  "FBA 入库有哪些包装和标签要求？",
  "美国站卖儿童产品需要什么认证？",
];

export function AssistantChat({ initialQuestion }: { initialQuestion: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = useCallback(async (history: Message[]) => {
    setMessages(history);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-12).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "回答失败");
      setMessages([...history, { role: "assistant", ...data }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "回答失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setInput("");
    void send([...messages, { role: "user", content: q }]);
  };

  useEffect(() => {
    if (initialQuestion && !started.current) {
      started.current = true;
      void send([{ role: "user", content: initialQuestion }]);
    }
  }, [initialQuestion, send]);

  useEffect(() => {
    if (messages.length > 0 || loading) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, error]);

  const retry = () => {
    if (messages.at(-1)?.role === "user") void send(messages);
  };

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-3xl flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">智能问答</h1>
          <p className="mt-1 text-sm text-muted-foreground">查库存、查在途、查跨境合规标准。回答会标注数据和资料来源。</p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMessages([]);
              setError(null);
            }}
            disabled={loading}
          >
            <SquarePen /> 新对话
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-5 pb-4">
        {messages.length === 0 && !loading && (
          <div className="rounded-xl border bg-card p-6">
            <div className="mb-4 flex items-center gap-2 font-medium">
              <Bot className="size-5 text-primary" /> 可以这样问我
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {MORE_EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="rounded-lg border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {q}
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              合规类回答来自知识库资料，仅供参考；具体要求以平台和官方最新规定为准。
            </p>
          </div>
        )}

        {messages.map((m, idx) =>
          m.role === "user" ? (
            <div key={idx} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={idx} className="flex gap-3">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {(m.toolsUsed.length > 0 || m.mode === "mock") && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.toolsUsed.map((t) => (
                      <Badge key={t} variant="secondary" className="font-normal">
                        <Wrench /> {t}
                      </Badge>
                    ))}
                    {m.mode === "mock" && (
                      <Badge variant="outline" className="font-normal text-amber-700">
                        模拟模式
                      </Badge>
                    )}
                  </div>
                )}
                <div className="rounded-2xl rounded-tl-sm border bg-card px-4 py-3">
                  <Markdown>{m.content}</Markdown>
                </div>
                {m.citations.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <BookOpen className="size-3.5" /> 参考资料
                    </div>
                    {m.citations.map((c) => (
                      <details key={c.n} className="group rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                        <summary className="cursor-pointer list-none">
                          <span className="mr-1.5 font-semibold text-primary">[{c.n}]</span>
                          {c.title}
                          {c.heading && <span className="text-muted-foreground"> · {c.heading}</span>}
                        </summary>
                        <p className="mt-2 leading-relaxed whitespace-pre-wrap text-muted-foreground">{c.excerpt}</p>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Bot className="size-4 text-primary" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Spinner /> 正在查询数据和资料…
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={retry}>
              <RotateCcw /> 重试
            </Button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-0 -mx-1 bg-background/95 px-1 pt-2 pb-4 backdrop-blur"
      >
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm focus-within:border-primary/50">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            rows={1}
            className="max-h-40 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button type="submit" size="icon" aria-label="发送" disabled={!input.trim() || loading}>
            <ArrowUp />
          </Button>
        </div>
      </form>
    </div>
  );
}
