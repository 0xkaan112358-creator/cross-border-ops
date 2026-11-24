import { KnowledgeBoard, type KbDoc } from "@/components/knowledge-board";
import { sql } from "@/lib/db";
import { getViewer } from "@/lib/viewer";

export default async function KnowledgePage(props: PageProps<"/knowledge">) {
  const [viewer, params] = await Promise.all([getViewer(), props.searchParams]);
  const docs = await sql<KbDoc>(
    `select id, title, category, filename, char_count, chunk_count, uploaded_by, is_sample, created_at::text as created_at
     from kb_documents order by is_sample, created_at desc`,
  );
  const docParam = typeof params.doc === "string" ? Number(params.doc) : NaN;
  return (
    <KnowledgeBoard
      docs={docs}
      isAdmin={viewer?.role === "admin"}
      initialDocId={Number.isInteger(docParam) ? docParam : null}
    />
  );
}
