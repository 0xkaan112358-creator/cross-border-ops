export type TextChunk = { heading: string | null; content: string };

const MAX_CHUNK = 600;

export function chunkText(text: string): TextChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) return [];

  const sections: { heading: string | null; body: string[] }[] = [{ heading: null, body: [] }];
  for (const line of normalized.split("\n")) {
    const m = /^#{1,4}\s+(.+)$/.exec(line.trim());
    if (m) sections.push({ heading: m[1].trim(), body: [] });
    else sections[sections.length - 1].body.push(line);
  }

  const chunks: TextChunk[] = [];
  for (const section of sections) {
    const paragraphs = section.body
      .join("\n")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    let current = "";
    const flush = () => {
      if (current.trim()) chunks.push({ heading: section.heading, content: current.trim() });
      current = "";
    };
    for (const para of paragraphs) {
      if (para.length > MAX_CHUNK) {
        flush();
        for (let i = 0; i < para.length; i += MAX_CHUNK) {
          chunks.push({ heading: section.heading, content: para.slice(i, i + MAX_CHUNK) });
        }
        continue;
      }
      if (current.length + para.length + 2 > MAX_CHUNK) flush();
      current += (current ? "\n\n" : "") + para;
    }
    flush();
  }
  return chunks;
}

const CJK = /[\u3400-\u9fff]/;

export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  for (const word of lower.match(/[a-z0-9][a-z0-9\-.]*[a-z0-9]|[a-z0-9]/g) ?? []) {
    if (word.length >= 2) tokens.push(word);
  }
  const cjkRuns = lower.match(/[\u3400-\u9fff]+/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }
  return tokens;
}

export function hasCjk(text: string) {
  return CJK.test(text);
}

export type ScoredChunk<T> = T & { score: number };

export function bm25<T extends { content: string; heading: string | null; title?: string }>(
  query: string,
  docs: T[],
  limit = 5,
): ScoredChunk<T>[] {
  const qTokens = Array.from(new Set(tokenize(query)));
  if (qTokens.length === 0 || docs.length === 0) return [];
  const k1 = 1.4;
  const b = 0.75;
  const tokenized = docs.map((d) => tokenize(`${d.title ?? ""} ${d.heading ?? ""} ${d.content}`));
  const avgLen = tokenized.reduce((s, t) => s + t.length, 0) / tokenized.length || 1;
  const df = new Map<string, number>();
  for (const toks of tokenized) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = docs.length;
  const scored = docs.map((doc, i) => {
    const toks = tokenized[i];
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    let matched = 0;
    for (const q of qTokens) {
      const f = tf.get(q);
      if (!f) continue;
      matched++;
      const idf = Math.log(1 + (n - (df.get(q) ?? 0) + 0.5) / ((df.get(q) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / avgLen)));
    }
    const coverage = matched / qTokens.length;
    return { ...doc, score: score * (0.5 + coverage) };
  });
  return scored
    .filter((d) => d.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit);
}
