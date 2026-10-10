import { notFound } from "next/navigation";
import { z } from "zod";
import { AgentEvalDashboardView } from "./_components/AgentEvalDashboardView";

/* The id goes into API paths and links, so only a plain id token is accepted at the boundary. */
const AgentIdParam = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

/* Route: /eval/:agentId (per-agent Eval Dashboard). Thin entry; the view is colocated. */
export default async function AgentEvalPage({ params }: { params: Promise<{ agentId: string }> }) {
  const parsed = AgentIdParam.safeParse((await params).agentId);
  if (!parsed.success) notFound();
  return <AgentEvalDashboardView agentId={parsed.data} />;
}
