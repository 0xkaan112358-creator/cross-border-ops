import "server-only";
import { sql, tx } from "./db";
import { bm25, chunkText } from "./kb-text";

export type KbHit = {
  chunkId: number;
  documentId: number;
  title: string;
  heading: string | null;
  content: string;
  score: number;
};

export const KB_HIT_THRESHOLD = 2.5;

export async function searchKnowledge(query: string, limit = 5): Promise<KbHit[]> {
  const rows = await sql<{ id: number; document_id: number; title: string; heading: string | null; content: string }>(
    `select c.id, c.document_id, d.title, c.heading, c.content
     from kb_chunks c join kb_documents d on d.id = c.document_id`,
  );
  return bm25(query, rows, limit).map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    title: r.title,
    heading: r.heading,
    content: r.content,
    score: Math.round(r.score * 100) / 100,
  }));
}

export async function addDocument(input: {
  title: string;
  category: string;
  filename: string;
  text: string;
  uploadedBy: string;
}) {
  const chunks = chunkText(input.text);
  if (chunks.length === 0) throw new Error("文档中没有可识别的文字内容");
  return tx(async (q) => {
    const inserted = await q<{ id: number }>(
      `insert into kb_documents (title, category, filename, char_count, chunk_count, uploaded_by)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [input.title, input.category, input.filename, input.text.length, chunks.length, input.uploadedBy],
    );
    const id = inserted[0].id;
    await q(
      `insert into kb_chunks (document_id, idx, heading, content)
       select $1, i, h, c from unnest($2::int[], $3::text[], $4::text[]) as t(i, h, c)`,
      [id, chunks.map((_, i) => i), chunks.map((c) => c.heading), chunks.map((c) => c.content)],
    );
    return { id, chunks: chunks.length };
  });
}

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    return (Array.isArray(text) ? text : [text]).join("\n\n");
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (name.endsWith(".md") || name.endsWith(".txt") || name.endsWith(".markdown")) {
    return buffer.toString("utf8");
  }
  throw new Error("仅支持 PDF、Word（.docx）、Markdown 和 TXT 文件");
}
