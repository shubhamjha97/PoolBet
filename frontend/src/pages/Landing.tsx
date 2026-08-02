import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";

type Mode = null | "signup" | "login";

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" className="size-4">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

function Hero() {
  return (
    <svg viewBox="0 0 240 132" fill="none" className="mx-auto block w-[230px] max-w-[64vw] drop-shadow-[0_8px_40px_hsl(var(--yes)/0.15)]" aria-hidden>
      <defs>
        <linearGradient id="gY" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="hsl(var(--yes))" stopOpacity="0.3" />
          <stop offset="1" stopColor="hsl(var(--yes))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="currentColor" strokeWidth="1" className="text-border">
        <line x1="0" y1="30" x2="240" y2="30" /><line x1="0" y1="66" x2="240" y2="66" /><line x1="0" y1="102" x2="240" y2="102" />
      </g>
      <path d="M2,96 C42,92 72,72 112,56 C152,40 186,30 230,20 L230,132 L2,132 Z" fill="url(#gY)" />
      <path d="M2,42 C64,56 128,74 230,98" className="stroke-no" strokeWidth="2" strokeOpacity="0.5" strokeLinecap="round" />
      <path d="M2,96 C42,92 72,72 112,56 C152,40 186,30 230,20" className="stroke-yes" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="230" cy="20" r="4.5" className="animate-pulse fill-yes" />
    </svg>
  );
}

export function Landing() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const isLogin = mode === "login";

  const submit = async () => {
    if (!name || !password) return toast.error("Enter a name and password");
    haptic("tap");
    try {
      if (isLogin) await login(name, password);
      else await signup(name, password);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const google = async () => {
    haptic("tap");
    try {
      const r = await fetch("/auth/google/login", { redirect: "manual" });
      if (r.status === 503) return toast.error("Google sign-in isn't configured yet — needs deployment");
    } catch { /* configured → redirect below */ }
    window.location.href = "/auth/google/login";
  };

  return (
    <div className="ambient-grid relative flex min-h-dvh items-center justify-center overflow-hidden px-6 pt-safe pb-safe">
      {/* dramatic ambient blobs */}
      <div className="pointer-events-none absolute -left-[8vmax] -top-[14vmax] size-[46vmax] rounded-full bg-yes/20 blur-[80px]" />
      <div className="pointer-events-none absolute -bottom-[16vmax] -right-[10vmax] size-[46vmax] rounded-full bg-no/20 blur-[80px]" />

      <div className="relative z-10 w-full max-w-[380px] text-center">
        <div className={cn("origin-top overflow-hidden transition-all [transition-duration:420ms] ease-out", mode ? "-translate-y-2 max-h-[80px] scale-[0.66] opacity-50" : "max-h-[240px]")}>
          <Hero />
        </div>
        <h1 className="mt-3 text-[38px] font-semibold tracking-[-0.05em]">PoolBet</h1>
        <p className={cn("mx-auto max-w-[330px] overflow-hidden text-muted-foreground transition-all [transition-duration:420ms] ease-out", mode ? "max-h-0 opacity-0" : "mb-6 mt-2 max-h-24")}>
          Parimutuel prediction markets for your friend group. Pool credits, call it, split the pot.
        </p>

        <div className="flex gap-2.5">
          <Button className="tactile h-11 flex-1" onClick={() => { haptic("select"); setMode(mode === "signup" ? null : "signup"); }}>
            Get started
          </Button>
          <Button variant="outline" className="tactile h-11 flex-1" onClick={() => { haptic("select"); setMode(mode === "login" ? null : "login"); }}>
            Log in
          </Button>
        </div>

        <div className={cn("grid transition-all [transition-duration:420ms] ease-out", mode ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="space-y-3 text-left">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" autoComplete="username" placeholder="e.g. Alex" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <Input id="pw" type="password" autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder={isLogin ? "your password" : "at least 4 characters"}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()} />
              </div>
              <Button className="tactile h-11 w-full" onClick={submit}>{isLogin ? "Log in" : "Create account"}</Button>

              <div className="flex items-center gap-2.5 py-1 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="tactile h-11 w-full gap-2" onClick={google}><GoogleIcon /> Continue with Google</Button>
              <Button variant="outline" className="tactile h-11 w-full gap-2" onClick={() => toast("Apple sign-in is coming soon")}>
                <svg viewBox="0 0 24 24" className="size-4 fill-current"><path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.98-.84.95-2.2 1.68-3.32 1.6-.14-1.1.42-2.28 1.1-3.02.78-.86 2.16-1.5 3.34-1.56zM20.5 17.2c-.6 1.38-.88 2-1.66 3.22-1.08 1.7-2.6 3.82-4.48 3.84-1.68.02-2.1-1.09-4.38-1.08-2.28.01-2.74 1.1-4.42 1.08-1.88-.02-3.32-1.94-4.4-3.64C-1.02 16.13-1.3 9.9 1.9 6.62 3.02 5.4 4.64 4.65 6.32 4.64c1.7-.02 2.77 1.09 4.18 1.09 1.36 0 2.18-1.12 4.14-1.1 1.5.02 3.1.82 4.24 2.24-3.72 2.04-3.12 7.36.72 8.33z" /></svg>
                Continue with Apple
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
