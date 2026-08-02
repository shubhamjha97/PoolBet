import { useParams } from "react-router-dom";

export function GroupPage() {
  const { id } = useParams();
  return (
    <div className="animate-fade-up space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Group</h1>
      <p className="text-muted-foreground">Rebuilding group {id} (markets, stats, timeline)…</p>
    </div>
  );
}
