import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldQuestion } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { ErrorNote } from "@/components/Bits";
import { cn } from "@/lib/utils";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirect(returnTo: string | null, fallback = "/app") {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  return fallback;
}

function PasswordInput({
  name,
  placeholder,
  autoComplete,
  disabled,
  required = true,
}: {
  name: string;
  placeholder: string;
  autoComplete: string;
  disabled: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        name={name}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((value) => !value)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function BootstrapCard({ onDone }: { onDone: () => void }) {
  const seed = useAction(api.seed.seedDemo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <Card className="card-layer border-0">
      <CardHeader>
        <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
          <ShieldQuestion className="size-5" />
        </div>
        <CardTitle>First run — set up this workspace</CardTitle>
        <CardDescription>
          No accounts exist yet. Create the first admin login and load a realistic
          demo tenant: catalog, plans, taxes, customers, live subscriptions and
          months of real invoices.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const data = new FormData(event.currentTarget);
          try {
            await seed({
              adminName: String(data.get("name") ?? ""),
              adminEmail: String(data.get("email") ?? ""),
              adminPassword: String(data.get("password") ?? ""),
            });
            setDone(true);
            onDone();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Setup failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <CardContent className="space-y-4">
          <ErrorNote message={error} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="seed-name">
                Your name
              </label>
              <Input id="seed-name" name="name" defaultValue="Brightloop Admin" required disabled={busy} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="seed-email">
                Admin email
              </label>
              <Input
                id="seed-email"
                name="email"
                type="email"
                defaultValue="admin@brightloop.in"
                required
                disabled={busy}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium" htmlFor="seed-password">
                Admin password
              </label>
              <PasswordInput
                name="password"
                placeholder="At least 9 characters"
                autoComplete="new-password"
                disabled={busy}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Min 9 characters with an uppercase letter, a lowercase letter and a
                symbol. Demo customers get the password{" "}
                <code className="rounded bg-muted px-1">Portal@2026</code>.
              </p>
            </div>
          </div>
          <Button className="w-full" disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {done ? "Workspace ready" : "Create admin & seed demo data"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Setup runs once and is disabled as soon as data exists.
          </p>
        </CardContent>
      </form>
    </Card>
  );
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const status = useQuery(api.seed.publicStatus);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const redirect = resolveRedirect(returnTo, redirectAfterAuth);

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Send an already-signed-in visitor straight to the right place.
  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return;
    const target = returnTo?.startsWith("/")
      ? returnTo
      : user.role === "customer"
        ? "/portal"
        : redirect;
    navigate(target, { replace: true });
  }, [authLoading, isAuthenticated, user, navigate, redirect, returnTo]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    const data = new FormData(event.currentTarget);
    try {
      await signIn("password", data);
      if (mode === "signUp") {
        setFeedback("Account created. Opening your portal…");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That didn't work. Please try again.",
      );
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_1.05fr]">
      {/* brand side */}
      <aside className="relative hidden overflow-hidden bg-[var(--ink)] px-10 py-12 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 hairline-grid opacity-20" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <Logo className="size-7 text-brand" />
          <span className="text-[15px] font-semibold text-white">Brightloop</span>
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
            One workspace for quotes, subscriptions and invoices.
          </h2>
          <ul className="mt-6 space-y-3 text-sm text-white/70">
            {[
              "Nightly billing runs with a unique key per period",
              "Draft → Confirmed → Paid invoices with recorded payments",
              "A customer portal that only ever shows its own data",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-auto pt-10 text-xs text-white/40">
          Staff sign in for the back office · customers land in their portal
        </p>
      </aside>

      {/* form side */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <Logo className="size-6 text-brand" />
              <span className="text-sm font-semibold">Brightloop</span>
            </Link>
            <Link to="/" className="text-sm text-muted-foreground">
              Back
            </Link>
          </div>

          {status?.needsBootstrap ? (
            <BootstrapCard
              onDone={() => {
                setBusy(false);
                setFeedback("Workspace ready — sign in with your admin credentials.");
              }}
            />
          ) : (
            <Card className="card-layer border-0">
              <CardHeader>
                <CardTitle className="text-xl">
                  {mode === "signIn" ? "Sign in" : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {mode === "signIn"
                    ? "Staff open the back office; customers open their portal."
                    : "New accounts start as customer portal accounts."}
                </CardDescription>
              </CardHeader>
              <form onSubmit={submit}>
                <CardContent className="space-y-4">
                  <ErrorNote message={error} />
                  {feedback ? (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {feedback}
                    </p>
                  ) : null}

                  <input type="hidden" name="flow" value={mode === "signIn" ? "signIn" : "signUp"} />

                  {mode === "signUp" ? (
                    <div>
                      <label className="text-sm font-medium" htmlFor="auth-name">
                        Name
                      </label>
                      <Input id="auth-name" name="name" placeholder="Ananya Sharma" autoComplete="name" required disabled={busy} />
                    </div>
                  ) : null}

                  <div>
                    <label className="text-sm font-medium" htmlFor="auth-email">
                      Email
                    </label>
                    <Input
                      id="auth-email"
                      name="email"
                      type="email"
                      placeholder="you@company.in"
                      autoComplete="email"
                      required
                      disabled={busy}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium" htmlFor="auth-password">
                        Password
                      </label>
                      {mode === "signIn" ? (
                        <span className="text-xs text-muted-foreground">
                          Forgot it? Ask an admin to reset it.
                        </span>
                      ) : null}
                    </div>
                    <PasswordInput
                      name="password"
                      placeholder={mode === "signIn" ? "Your password" : "9+ chars, Aa, symbol"}
                      autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                      disabled={busy}
                    />
                    {mode === "signUp" ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        At least 9 characters with an uppercase letter, a lowercase
                        letter and a symbol.
                      </p>
                    ) : null}
                  </div>

                  <Button className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    {mode === "signIn" ? "Sign in" : "Create account"}
                    <ArrowRight className="ml-1 size-4" />
                  </Button>

                  <p className="text-center text-sm text-muted-foreground">
                    {mode === "signIn" ? (
                      <>
                        New here?{" "}
                        <button
                          type="button"
                          className="font-medium text-brand hover:underline"
                          onClick={() => {
                            setMode("signUp");
                            setError(null);
                          }}
                        >
                          Create an account
                        </button>
                      </>
                    ) : (
                      <>
                        Already registered?{" "}
                        <button
                          type="button"
                          className="font-medium text-brand hover:underline"
                          onClick={() => {
                            setMode("signIn");
                            setError(null);
                          }}
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </p>
                </CardContent>
              </form>
            </Card>
          )}

          <p className={cn("mt-6 text-center text-xs text-muted-foreground")}>
            <Link to="/" className="hover:text-foreground">
              ← Back to the landing page
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      }
    >
      <Auth {...props} />
    </Suspense>
  );
}
