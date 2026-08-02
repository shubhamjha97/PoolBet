import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import type { MarketPreview } from "@/lib/types";

// A shared /market/:id link resolves to its group (or an access screen, later).
export function MarketRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const p = await api<MarketPreview>("GET", `/markets/${id}/preview`);
        navigate(p.is_member ? `/group/${p.group_id}?market=${id}` : `/group/${p.group_id}`, { replace: true });
      } catch {
        navigate("/", { replace: true });
      }
    })();
  }, [id, navigate]);

  return <div className="grid min-h-[40vh] place-items-center text-muted-foreground">Opening…</div>;
}
