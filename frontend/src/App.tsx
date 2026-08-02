import { Routes, Route } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Landing } from "@/pages/Landing";
import { HomePage } from "@/pages/HomePage";
import { GroupPage } from "@/pages/GroupPage";
import { AdminPage } from "@/pages/AdminPage";
import { MarketRedirect } from "@/pages/MarketRedirect";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-dvh place-items-center text-muted-foreground">Loading…</div>;
  }
  if (!user) return <Landing />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/group/:id" element={<GroupPage />} />
        <Route path="/market/:id" element={<MarketRedirect />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<HomePage />} />
      </Route>
    </Routes>
  );
}
