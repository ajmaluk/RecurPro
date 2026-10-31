import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldCheck, Lock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { ErrorNote } from "@/components/Bits";

export default function AdminLogin() {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/app";

  const [email, setEmail] = useState("admin@brightloop.io");
  const [password, setPassword] = useState("Password123!");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in as staff/admin, go straight to /app
  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return;
    if (user.role === "admin" || user.role === "staff") {
      navigate(returnTo.startsWith("/app") ? returnTo : "/app", { replace: true });
    }
  }, [authLoading, isAuthenticated, user, navigate, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await signIn("password", { email, password });
      // Role will be checked on next render by useEffect
    } catch (err: any) {
      setError(err?.message || "Invalid email or password");
      setBusy(false);
    }
  };

  const handleFillAdmin = () => {
    setEmail("admin@brightloop.io");
    setPassword("Password123!");
    setError(null);
  };

  const handleFillStaff = () => {
    setEmail("staff@brightloop.io");
    setPassword("Password123!");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1fr_1.1fr]">
      {/* Brand Dark Side */}
      <aside className="relative hidden overflow-hidden bg-[var(--ink)] px-10 py-12 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 hairline-grid opacity-20" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <Logo className="size-7 text-brand" />
          <span className="text-[15px] font-semibold text-white">Brightloop</span>
        </Link>

        <div className="relative mt-auto max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
            <ShieldCheck className="size-4" /> Back Office Staff & Admin
          </div>
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">
            Administrative Control for Recurring Billing & Finance
          </h2>
          <p className="mt-4 text-sm text-white/70 leading-relaxed">
            Manage billing runs, execute period invoices, track collections in real-time, and manage catalog configurations.
          </p>

          <ul className="mt-6 space-y-3 text-sm text-white/70">
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Automated idempotency keys per period
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Real-time Indian GST & discount rounding in paise
            </li>
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              Strict role-based segregation from customer portals
            </li>
          </ul>
        </div>

        <p className="relative mt-auto pt-10 text-xs text-white/40">
          Authorized personnel only. All access is logged to the system audit trail.
        </p>
      </aside>

      {/* Form Side */}
      <main className="flex items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <Logo className="size-6 text-brand" />
              <span className="text-sm font-semibold">Brightloop</span>
            </Link>
            <Link to="/" className="text-xs text-muted-foreground hover:text-foreground">
              ← Home
            </Link>
          </div>

          <Card className="card-layer border-0 shadow-lg">
            <CardHeader className="space-y-1">
              <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600">
                <Lock className="size-5" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">Staff & Admin Login</CardTitle>
              <CardDescription>
                Sign in with your administrative account to access the Brightloop back office dashboard.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <ErrorNote message={error} />

                <div>
                  <label className="text-sm font-medium" htmlFor="admin-email">
                    Staff Email
                  </label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@brightloop.io"
                    autoComplete="email"
                    required
                    disabled={busy}
                    className="mt-1"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium" htmlFor="admin-password">
                      Password
                    </label>
                  </div>
                  <div className="relative mt-1">
                    <Input
                      id="admin-password"
                      type={visible ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter admin password"
                      autoComplete="current-password"
                      required
                      disabled={busy}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setVisible(!visible)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-brand text-brand-foreground hover:bg-brand-strong"
                  disabled={busy}
                >
                  {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Sign In to Back Office
                  <ArrowRight className="ml-1 size-4" />
                </Button>

                {/* Quick Helper Button */}
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Demo Back Office Logins:</span>
                    <span className="text-[11px] text-muted-foreground">Click to fill</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleFillAdmin}
                      className="flex flex-col items-start rounded border border-border/80 bg-background/80 p-2 text-left hover:border-brand hover:bg-background transition-colors"
                    >
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <UserCheck className="size-3.5 text-brand" /> Admin
                      </span>
                      <span className="text-[11px] text-muted-foreground">admin@brightloop.io</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFillStaff}
                      className="flex flex-col items-start rounded border border-border/80 bg-background/80 p-2 text-left hover:border-teal-600 hover:bg-background transition-colors"
                    >
                      <span className="font-semibold text-foreground flex items-center gap-1">
                        <UserCheck className="size-3.5 text-teal-600" /> Staff
                      </span>
                      <span className="text-[11px] text-muted-foreground">staff@brightloop.io</span>
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-0.5 border-t border-border/40">
                    <span>Password: <strong className="text-foreground">Password123!</strong></span>
                    <span>Role-enforced security</span>
                  </div>
                </div>
              </CardContent>
            </form>
          </Card>

          {/* Customer portal redirect */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Are you a client looking for your invoices?{" "}
              <Link to="/portal/login" className="font-semibold text-brand hover:underline">
                Go to Customer Portal →
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              <Link to="/" className="hover:text-foreground">
                ← Back to landing page
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
