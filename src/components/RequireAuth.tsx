import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

/**
 * Wraps a route that requires a signed-in user and verifies role permissions.
 *
 * Prevents unauthorized access by immediately routing unauthenticated users to the
 * appropriate login page and blocking customer accounts from viewing admin dashboards.
 */
export function RequireAuth({
  children,
  title = "Sign in to continue",
  description = "This page is only available to signed-in users.",
  redirectImmediately = true,
  allowedRoles,
  loginPath,
}: {
  children: ReactNode;
  /** Headline on the blocked screen. */
  title?: string;
  /** Says what the visitor gets by signing in. */
  description?: string;
  /** Skip the explanation and go straight to login. */
  redirectImmediately?: boolean;
  /** Permitted user roles. If empty, all authenticated users are permitted. */
  allowedRoles?: ("admin" | "staff" | "customer")[];
  /** Custom login path to direct to. */
  loginPath?: string;
}) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const defaultLoginPath =
    loginPath ||
    (allowedRoles?.includes("customer") && !allowedRoles?.includes("admin")
      ? "/portal/login"
      : "/admin/login");

  if (!isAuthenticated || !user) {
    const returnTo = `${location.pathname}${location.search}`;
    const signInHref = `${defaultLoginPath}?returnTo=${encodeURIComponent(returnTo)}`;

    if (redirectImmediately) {
      return <Navigate to={signInHref} replace />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                <Lock className="size-5 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Sign-in is required to view this area.
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              className="w-full bg-brand text-brand-foreground hover:bg-brand-strong"
              onClick={() => navigate(signInHref)}
            >
              Sign in
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Back to home
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  // Verify role authorization
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Customers attempting to enter back office (/app)
    if (user.role === "customer") {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background p-6">
          <Card className="w-full max-w-md border-border/80">
            <CardHeader className="text-center">
              <div className="flex justify-center">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600">
                  <ShieldAlert className="size-6" />
                </div>
              </div>
              <CardTitle className="text-xl">Staff & Admin Access Only</CardTitle>
              <CardDescription>
                Your account ({user.email}) is a Customer Portal account. The back office is reserved for internal staff.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-muted-foreground">
              Please use your Customer Portal to view and pay your invoices and manage subscriptions.
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                className="w-full bg-brand text-brand-foreground hover:bg-brand-strong"
                onClick={() => navigate("/portal")}
              >
                Go to Customer Portal
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/")}
              >
                Back to home
              </Button>
            </CardFooter>
          </Card>
        </main>
      );
    }

    // Staff attempting to access pure Admin section
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/80">
          <CardHeader className="text-center">
            <div className="flex justify-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
                <ShieldAlert className="size-6" />
              </div>
            </div>
            <CardTitle className="text-xl">Administrator Privileges Required</CardTitle>
            <CardDescription>
              This section requires Administrator privileges. You are signed in as Staff ({user.email}).
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/app")}>
              Back to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
