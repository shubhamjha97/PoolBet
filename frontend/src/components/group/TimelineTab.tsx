// Contract: <TimelineTab groupId={id} /> — an agent fills this in.
export function TimelineTab({ groupId }: { groupId: string }) {
  return <div className="text-sm text-muted-foreground">Timeline for {groupId} — building…</div>;
}
