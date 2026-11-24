import { AssistantChat } from "@/components/assistant-chat";

export default async function AssistantPage(props: PageProps<"/assistant">) {
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 500) : "";
  return <AssistantChat key={q} initialQuestion={q} />;
}
