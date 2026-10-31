/** Customer portal shell: light top bar, scoped navigation, same brand. */
import { useState, type ReactNode } from "react";
import { NavLink, Navigate, useNavigate } from "react-router";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@/shared/enums";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/portal", label: "Overview", end: true },
  { to: "/portal/subscriptions", label: "Subscriptions" },
  { to: "/portal/invoices", label: "Invoices" },
  { to: "/portal/account", label: "Account" },
];

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (user && user.role !== ROLES.CUSTOMER) {
    // Staff reviewing the portal can go back to the back office any time.
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4 sm:px-6">
          <NavLink to="/portal" className="flex items-center gap-2">
            <Logo className="size-6 text-brand" />
            <span className="text-sm font-semibold">Brightloop</span>
            <span className="hidden rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-strong sm:inline">
              Portal
            </span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">
              {user?.name ?? user?.email}
            </span>
            <button
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              onClick={async () => {
                await signOut();
                navigate("/");
              }}
            >
              Sign out
            </button>
            <button
              className="rounded-md border border-border p-2 md:hidden"
              onClick={() => setOpen((value) => !value)}
              aria-label="Toggle navigation"
            >
              {open ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {open ? (
          <nav className="border-t border-border/70 px-4 py-2 md:hidden">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "block rounded-md px-3 py-2 text-sm",
                    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted-foreground">
        <LogOut className="mr-1 inline size-3" />
        Your data is limited to your own subscriptions and invoices.
      </footer>
    </div>
  );
}
