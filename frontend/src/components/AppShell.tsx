import { Outlet, Link } from "react-router-dom";
import { LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { InstallButton } from "./InstallButton";

export function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <div className="relative z-10 min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 pt-safe px-safe">
        <div className="mx-auto flex h-14 max-w-[820px] items-center justify-between px-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"
            onClick={() => haptic("select")}
          >
            <span className="h-5 w-5 rounded-md bg-gradient-to-br from-yes to-no shadow-glow-yes" />
            PoolBet
          </Link>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Button asChild variant="ghost" size="sm" className="tactile">
                <Link to="/admin" onClick={() => haptic("select")}>Admin</Link>
              </Button>
            )}
            <InstallButton />
            <Button variant="ghost" size="icon" className="tap-target tactile" aria-label="Toggle theme" onClick={() => { haptic("select"); toggle(); }}>
              {theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="tactile"
                onClick={() => { haptic("tap"); logout(); }}
              >
                <LogOut className="size-4" />
                <span className="hidden sm:inline">Log out</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[820px] px-4 pb-28 pt-5">
        <Outlet />
      </main>
    </div>
  );
}
