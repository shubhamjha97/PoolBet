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
  // A Siri-style orb: dark sphere, a hot drifting core, and blurred colour
  // "blades" swirling at different speeds/directions. No conic gradient (so no
  // seam line); GPU-only transforms. Reveal once, then loop forever.
  return (
    <div className="relative mx-auto grid size-44 place-items-center [animation:pb-reveal_0.65s_cubic-bezier(.2,.9,.25,1.2)_both]" aria-hidden>
      {/* soft outer glow — big + heavily blurred so it fades gradually (no ring banding) */}
      <div className="absolute size-52 rounded-full [background:radial-gradient(circle,hsl(var(--yes)/0.18),hsl(var(--no)/0.12)_46%,transparent_68%)] blur-2xl [animation:pb-breathe_6s_ease-in-out_infinite]" />

      {/* the sphere (no box-shadow halo — it banded; the glow div handles the halo) */}
      <div className="relative size-40 overflow-hidden rounded-full ring-1 ring-white/15">
        {/* dark base */}
        <div className="absolute inset-0 bg-[#050405]" />

        {/* colour corona — bright blobs orbit near the rim so the CENTRE stays dark */}
        <div className="absolute inset-0 [animation:spin_7s_linear_infinite]">
          <div className="absolute left-1/2 top-[3%] size-[42%] -translate-x-1/2 rounded-full blur-lg [background:radial-gradient(circle,hsl(var(--yes)),transparent_66%)]" />
          <div className="absolute bottom-[3%] left-1/2 size-[42%] -translate-x-1/2 rounded-full blur-lg [background:radial-gradient(circle,hsl(var(--no)),transparent_66%)]" />
        </div>
        <div className="absolute inset-0 [animation:spin_9s_linear_infinite_reverse]">
          <div className="absolute left-[2%] top-1/2 size-[38%] -translate-y-1/2 rounded-full blur-lg opacity-90 [background:radial-gradient(circle,#6ee7b7,transparent_66%)]" />
          <div className="absolute right-[4%] top-[26%] size-[34%] rounded-full blur-lg opacity-80 [background:radial-gradient(circle,hsl(var(--no)),transparent_66%)]" />
        </div>

        {/* keep the very centre dark (drifts subtly for life) */}
        <div className="absolute inset-0 [animation:pb-drift_7s_ease-in-out_infinite]">
          <div className="absolute left-1/2 top-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-lg [background:radial-gradient(circle,#050405_38%,transparent_72%)]" />
        </div>

        {/* thin bright blades sweeping across (Siri detail) */}
        <div className="absolute inset-0 [animation:spin_6s_linear_infinite]">
          <div className="absolute left-1/2 top-1/2 h-[11%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-md opacity-70 [background:radial-gradient(ellipse,rgba(190,255,225,0.95),hsl(var(--yes)/0.5)_40%,transparent_72%)]" />
        </div>
        <div className="absolute inset-0 [animation:spin_8s_linear_infinite_reverse]">
          <div className="absolute left-1/2 top-1/2 h-[9%] w-[124%] -translate-x-1/2 -translate-y-1/2 rotate-[68deg] rounded-full blur-md opacity-60 [background:radial-gradient(ellipse,rgba(255,190,230,0.95),hsl(var(--no)/0.5)_40%,transparent_72%)]" />
        </div>

        {/* glassy top-left sheen + rim vignette for sphere depth */}
        <div className="absolute inset-0 [background:radial-gradient(circle_at_34%_28%,rgba(255,255,255,0.18),transparent_44%)]" />
        <div className="absolute inset-0 rounded-full shadow-[inset_0_-14px_30px_-14px_rgba(0,0,0,0.7),inset_0_2px_6px_rgba(255,255,255,0.2)]" />
      </div>
    </div>
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
    <div className="noise relative z-10 flex min-h-dvh items-center justify-center overflow-hidden px-6 pt-safe pb-safe">
      {/* ambient glow — radial fades to transparent (gradual falloff → no ring banding) */}
      <div className="pointer-events-none absolute -left-[14vmax] -top-[22vmax] size-[80vmax] [background:radial-gradient(circle,hsl(var(--yes)/0.13),transparent_58%)]" />
      <div className="pointer-events-none absolute -bottom-[24vmax] -right-[16vmax] size-[80vmax] [background:radial-gradient(circle,hsl(var(--no)/0.11),transparent_58%)]" />

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
