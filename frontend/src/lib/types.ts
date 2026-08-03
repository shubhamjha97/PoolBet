// API types mirroring the FastAPI backend. Money/decimals arrive as strings.

export interface User {
  id: string;
  name: string;
  api_token: string;
}

export interface Member {
  membership_id: string;
  user_id: string;
  name: string;
  balance: string;
}

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  starting_credits: string;
  dispute_window_hours: number;
  rake: string;
  members: Member[];
}

export type Side = "YES" | "NO";
export type Outcome = "YES" | "NO" | "VOID" | "SCALAR";
export type MarketStatus = "OPEN" | "CLOSED" | "RESOLVING" | "DISPUTED" | "RESOLVED";

export interface Bet {
  id: string;
  side: Side | null;
  outcome: string | null;   // chosen label on multiple-choice markets
  amount: string;
  payout: string | null;
  member_name: string;
  is_anonymous: boolean;
  created_at: string;
}

export interface OutcomePool {
  label: string;
  pool: string;
  pct: string | null;
  count: number;
}

export interface Market {
  id: string;
  group_id: string;
  question: string;
  rules: string | null;
  status: MarketStatus;
  closes_at: string;
  proposer_name: string;
  proposer_user_id: string | null;
  yes_pool: string;
  no_pool: string;
  yes_prob: string | null;
  no_prob: string | null;
  outcomes: string[] | null;          // null -> binary YES/NO; list -> multiple choice
  outcome_pools: OutcomePool[];       // per-label pools for multiple-choice markets
  proposed_outcome: Outcome | string | null;
  proposed_fraction: string | null;
  outcome: Outcome | string | null;
  outcome_fraction: string | null;
  evidence_url: string | null;
  bets: Bet[];
}

export interface PnlPoint { t: string; balance: number; }
export interface PnlSeries { user_id: string; name: string; series: PnlPoint[]; }

export interface TimelineEvent {
  id: string;
  ts: string;
  type: string;
  actor_name: string | null;
  market_id: string | null;
  payload: Record<string, unknown>;
}

export interface GroupPreview { id: string; name: string; member_count: number; }
export interface MarketPreview {
  market_id: string; question: string; group_id: string; group_name: string; is_member: boolean;
}
export interface AccessRequest { id: string; user_id: string; name: string; created_at: string; }

export interface AdminEvent extends TimelineEvent { group_id: string | null; }
export interface Snapshot { id: string; created_at: string; label: string; after_event_id: string | null; }
