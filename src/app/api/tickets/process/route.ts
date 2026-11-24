import { processPending } from "@/lib/tickets";
import { requireViewer } from "@/lib/viewer";

export async function POST(request: Request) {
  const viewer = await requireViewer(request, ["admin", "cs"]);
  if (viewer instanceof Response) return viewer;
  const result = await processPending(4);
  return Response.json(result, { headers: { "cache-control": "private, no-store" } });
}
