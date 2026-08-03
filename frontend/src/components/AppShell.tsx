import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { LogOut, Moon, Sun, Shield } from "lucide-react";
import {
  Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { haptic } from "@/lib/haptics";
import { avatarGradient } from "@/lib/avatar";

const rowCls = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary active:scale-[0.99]";

export function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);

  const initial = user?.name?.slice(0, 1).toUpperCase() ?? "?";

  return (
    <div className="relative z-10 min-h-dvh">
      {/* no top bar — just a floating account avatar in the top-right corner */}
      {user && (
        <div className="fixed right-4 top-0 z-40 pt-safe">
          <div className="pt-3">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Account"
                  onClick={() => haptic("select")}
                  style={{ backgroundImage: avatarGradient(user.name) }}
                  className="grid size-9 place-items-center rounded-full text-sm font-bold text-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.6)] ring-4 ring-background/70 transition-transform active:scale-95"
                >
                  {initial}
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader className="text-left">
                  <SheetTitle className="flex items-center gap-3">
                    <span style={{ backgroundImage: avatarGradient(user.name) }} className="grid size-10 place-items-center rounded-full text-base font-bold text-white">{initial}</span>
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
          </div>
        </div>
      )}

      <main className="relative z-10 mx-auto w-full max-w-[820px] px-4 pb-28 pt-safe">
        <div className="pt-3">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
