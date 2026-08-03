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

  return (
    <>
      {/* light-mode ambient aurora wash (kept subtle; hidden in dark) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 dark:hidden">
        <div className="absolute -left-[18vmax] -top-[20vmax] size-[70vmax] [background:radial-gradient(circle,hsl(var(--yes)/0.16),transparent_60%)]" />
        <div className="absolute -bottom-[22vmax] -right-[16vmax] size-[70vmax] [background:radial-gradient(circle,hsl(var(--no)/0.14),transparent_60%)]" />
      </div>
      {loading ? (
        <div className="grid min-h-dvh place-items-center text-muted-foreground">Loading…</div>
      ) : !user ? (
        <Landing />
      ) : (
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/group/:id" element={<GroupPage />} />
            <Route path="/market/:id" element={<MarketRedirect />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<HomePage />} />
          </Route>
        </Routes>
      )}
    </>
  );
}
