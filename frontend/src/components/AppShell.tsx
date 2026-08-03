import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { LogOut, Moon, Sun, Shield } from "lucide-react";
import {
  Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { haptic } from "@/lib/haptics";

const rowCls = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary active:scale-[0.99]";

export function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const initial = user?.name?.slice(0, 1).toUpperCase() ?? "?";

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

          {user && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Account"
                  onClick={() => haptic("select")}
                  className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-yes to-no text-sm font-bold text-black shadow-[0_2px_10px_-2px_hsl(var(--no)/0.5)] transition-transform active:scale-95"
                >
                  {initial}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-yes to-no text-base font-bold text-black">{initial}</span>
                    {user.name}
                  </SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-1">
                  {isAdmin && (
                    <Link to="/admin" onClick={() => { setOpen(false); haptic("select"); }} className={rowCls}>
                      <Shield className="size-4 text-muted-foreground" /> Admin
                    </Link>
                  )}
                  <button className={rowCls} onClick={() => { toggle(); haptic("select"); }}>
                    {theme === "dark" ? <Sun className="size-4 text-muted-foreground" /> : <Moon className="size-4 text-muted-foreground" />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                  <button className={rowCls} onClick={() => { haptic("tap"); logout(); }}>
                    <LogOut className="size-4 text-destructive" /> <span className="text-destructive">Log out</span>
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[820px] px-4 pb-28 pt-5">
        <Outlet />
      </main>
    </div>
  );
}
