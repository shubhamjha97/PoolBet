import type { Group, Market } from "@/lib/types";

// Contract: <StatsTab group={group} markets={markets} /> — an agent fills this in.
export function StatsTab({ group, markets }: { group: Group; markets: Market[] }) {
  return (
    <div className="text-sm text-muted-foreground">
      Stats for {group.name} ({markets.length} markets) — building…
    </div>
  );
}
