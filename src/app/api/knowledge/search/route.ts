import { KB_HIT_THRESHOLD, searchKnowledge } from "@/lib/kb";
import { requireViewer } from "@/lib/viewer";

export async function GET(request: Request) {
  const viewer = await requireViewer(request);
  if (viewer instanceof Response) return viewer;
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ hits: [] });
  const hits = await searchKnowledge(q, 5);
  return Response.json({ hits, threshold: KB_HIT_THRESHOLD });
}
