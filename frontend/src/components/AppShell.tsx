import { Outlet, Link } from "react-router-dom";
import { Moon, Sun, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/haptics";
import { InstallButton } from "./InstallButton";

export function AppShell() {
  const { theme, toggle } = useTheme();
  const { user, isAdmin, logout } = useAuth();

  return (
    <div className="relative z-10 min-h-dvh">
      <header className="glass sticky top-0 z-30 border-b border-border/60 pt-safe px-safe">
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
            <Button
              variant="ghost"
              size="icon"
              className="tap-target tactile"
              onClick={() => { haptic("select"); toggle(); }}
              aria-label="Toggle theme"
            >
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

      <main className="relative z-10 mx-auto w-full max-w-[820px] pb-28 pt-5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <Outlet />
      </main>
    </div>
  );
}
