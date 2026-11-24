import "server-only";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { z } from "zod";

export function llmConfig() {
  return {
    apiKey: process.env.LLM_API_KEY?.trim() ?? "",
    baseURL: process.env.LLM_BASE_URL?.trim() || "https://api.deepseek.com",
    model: process.env.LLM_MODEL?.trim() || "deepseek-chat",
  };
}

export function llmEnabled() {
  return llmConfig().apiKey !== "";
}

export function llmStatus() {
  const cfg = llmConfig();
  let host = cfg.baseURL;
  try {
    host = new URL(cfg.baseURL).host;
  } catch {}
  return { enabled: cfg.apiKey !== "", model: cfg.model, host };
}

let client: OpenAI | undefined;
function getClient() {
  const cfg = llmConfig();
  client ??= new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, timeout: 60_000, maxRetries: 1 });
  return client;
}

export async function chatCompletion(
  messages: ChatCompletionMessageParam[],
  options: { tools?: ChatCompletionTool[]; json?: boolean; temperature?: number } = {},
) {
  const res = await getClient().chat.completions.create({
    model: llmConfig().model,
    messages,
    temperature: options.temperature ?? 0.3,
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
  });
  return res.choices[0]?.message;
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function chatJson<T>(system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await chatCompletion(
        [
          { role: "system", content: `${system}\n\n只输出一个 JSON 对象，不要输出其他内容。` },
          { role: "user", content: user },
        ],
        { json: true, temperature: 0.2 },
      );
      return schema.parse(extractJson(message?.content ?? ""));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("模型调用失败");
}
