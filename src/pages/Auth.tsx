import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowRight, Eye, EyeOff, Loader2, ShieldQuestion, UserCheck } from "lucide-react";
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
  value,
  onChange,
}: {
  name: string;
  placeholder: string;
  autoComplete: string;
  disabled: boolean;
  required?: boolean;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
        value={value}
        onChange={onChange}
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

import { api as restApi } from "@/lib/api";

function BootstrapCard({ onDone }: { onDone: () => void }) {
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
          months of real invoices in MySQL.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const data = new FormData(event.currentTarget);
          try {
            await restApi.auth.seed({
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
                defaultValue="admin@brightloop.io"
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
                symbol.
              </p>
            </div>
          </div>
          <Button className="w-full" disabled={busy}>
            {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {done ? "Workspace ready" : "Create admin & seed demo data"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Setup runs once and initializes your MySQL tables and tenant.
          </p>
        </CardContent>
      </form>
    </Card>
  );
}

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, user, signIn } = useAuth();
  const [status, setStatus] = useState<{ needsBootstrap: boolean } | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const portalParam = searchParams.get("portal") || searchParams.get("role");

  const initialPortalType: "admin" | "customer" =
    redirectAfterAuth?.startsWith("/portal")
      ? "customer"
      : portalParam === "admin" || returnTo?.startsWith("/app")
        ? "admin"
        : "customer";

  const [portalType, setPortalType] = useState<"admin" | "customer">(initialPortalType);
  const redirect = resolveRedirect(
    returnTo,
    redirectAfterAuth || (portalType === "admin" ? "/app" : "/portal"),
  );

  const [emailInput, setEmailInput] = useState(
    initialPortalType === "admin" ? "admin@brightloop.io" : "arjun@apexlogistics.in"
  );
  const [passwordInput, setPasswordInput] = useState("Password123!");

  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleFill = (email: string, pass: string = "Password123!") => {
    setEmailInput(email);
    setPasswordInput(pass);
    setError(null);
  };

  useEffect(() => {
    restApi.auth
      .status()
      .then((s) => setStatus(s))
      .catch(() => setStatus({ needsBootstrap: false }));
  }, []);

  // Send an already-signed-in visitor straight to the right place.
  useEffect(() => {
    if (authLoading || !isAuthenticated || !user) return;
    const target = returnTo?.startsWith("/")
      ? returnTo
      : user.role === "customer"
        ? "/portal"
        : "/app";
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

          {/* Portal Type Switcher */}
          <div className="mb-4 flex rounded-lg border border-border/80 bg-muted/60 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setPortalType("admin");
                setMode("signIn");
                setEmailInput("admin@brightloop.io");
                setPasswordInput("Password123!");
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 transition-all ${
                portalType === "admin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Staff & Admin Login
            </button>
            <button
              type="button"
              onClick={() => {
                setPortalType("customer");
                setEmailInput("arjun@apexlogistics.in");
                setPasswordInput("Password123!");
                setError(null);
              }}
              className={`flex-1 rounded-md py-2 transition-all ${
                portalType === "customer"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Customer Portal
            </button>
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
                  {portalType === "admin"
                    ? "Staff & Admin Login"
                    : mode === "signIn"
                      ? "Customer Portal Sign In"
                      : "Create Customer Account"}
                </CardTitle>
                <CardDescription>
                  {portalType === "admin"
                    ? "Authorized access to back office billing, finance, and system tools."
                    : mode === "signIn"
                      ? "View your invoices, subscriptions, and download payment receipts."
                      : "Register your business to access your customer portal."}
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

                  <input
                    type="hidden"
                    name="flow"
                    value={portalType === "admin" ? "signIn" : mode}
                  />

                  {portalType === "customer" && mode === "signUp" ? (
                    <div>
                      <label className="text-sm font-medium" htmlFor="auth-name">
                        Company or Contact Name
                      </label>
                      <Input
                        id="auth-name"
                        name="name"
                        placeholder="Apex Logistics Ltd"
                        autoComplete="name"
                        required
                        disabled={busy}
                      />
                    </div>
                  ) : null}

                  <div>
                    <label className="text-sm font-medium" htmlFor="auth-email">
                      {portalType === "admin" ? "Staff Email" : "Account Email"}
                    </label>
                    <Input
                      id="auth-email"
                      name="email"
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder={portalType === "admin" ? "admin@brightloop.io" : "you@company.in"}
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
                      {portalType === "admin" && (
                        <Link to="/admin/login" className="text-xs text-brand hover:underline">
                          Dedicated admin portal →
                        </Link>
                      )}
                    </div>
                    <PasswordInput
                      name="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder={
                        portalType === "admin"
                          ? "Enter admin password"
                          : mode === "signIn"
                            ? "Your password"
                            : "9+ chars, Aa, symbol"
                      }
                      autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                      disabled={busy}
                    />
                  </div>

                  <Button className="w-full bg-brand text-brand-foreground hover:bg-brand-strong" disabled={busy}>
                    {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    {portalType === "admin"
                      ? "Sign In to Back Office"
                      : mode === "signIn"
                        ? "Sign In to Portal"
                        : "Create Account"}
                    <ArrowRight className="ml-1 size-4" />
                  </Button>

                  {/* Demo Credentials Box */}
                  <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between font-semibold text-foreground">
                      <span>{portalType === "admin" ? "Demo Back Office Accounts:" : "Demo Customer Accounts:"}</span>
                      <span className="text-[11px] text-muted-foreground">Click to fill</span>
                    </div>

                    {portalType === "admin" ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleFill("admin@brightloop.io")}
                          className="flex flex-col items-start rounded border border-border/80 bg-background/80 p-2 text-left hover:border-brand transition-colors"
                        >
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <UserCheck className="size-3 text-brand" /> Admin
                          </span>
                          <span className="text-[11px] text-muted-foreground">admin@brightloop.io</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFill("staff@brightloop.io")}
                          className="flex flex-col items-start rounded border border-border/80 bg-background/80 p-2 text-left hover:border-teal-600 transition-colors"
                        >
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <UserCheck className="size-3 text-teal-600" /> Staff
                          </span>
                          <span className="text-[11px] text-muted-foreground">staff@brightloop.io</span>
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleFill("arjun@apexlogistics.in")}
                          className="flex flex-col items-start rounded border border-border/80 bg-background/80 p-2 text-left hover:border-brand transition-colors"
                        >
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <UserCheck className="size-3 text-brand" /> Enterprise
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate w-full">arjun@apexlogistics.in</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFill("neha@zenithtech.in")}
                          className="flex flex-col items-start rounded border border-border/80 bg-background/80 p-2 text-left hover:border-brand transition-colors"
                        >
                          <span className="font-semibold text-foreground flex items-center gap-1">
                            <UserCheck className="size-3 text-brand" /> Growth Client
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate w-full">neha@zenithtech.in</span>
                        </button>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <span>Password: <strong className="text-foreground">Password123!</strong></span>
                      <span>Demo ready</span>
                    </div>
                  </div>

                  {portalType === "customer" && (
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
                            Create a customer account
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
                  )}
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
