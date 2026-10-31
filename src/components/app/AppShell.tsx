/**
 * Staff application shell: ink sidebar, light content area.
 * Mobile collapses the sidebar into a sheet.
 */
import { useState, type ReactNode } from "react";
import { Navigate, NavLink, useNavigate } from "react-router";
import {
  BadgeIndianRupee,
  Boxes,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS, ROLES } from "@/shared/enums";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
};

const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Overview",
    items: [
      { to: "/app", label: "Dashboard", icon: <LayoutDashboard className="size-4" />, end: true },
    ],
  },
  {
    heading: "Money",
    items: [
      { to: "/app/billing", label: "Billing runs", icon: <BadgeIndianRupee className="size-4" /> },
      { to: "/app/invoices", label: "Invoices", icon: <FileText className="size-4" /> },
      { to: "/app/reports", label: "Reports", icon: <ScrollText className="size-4" /> },
    ],
  },
  {
    heading: "Sales",
    items: [
      { to: "/app/subscriptions", label: "Subscriptions", icon: <CreditCard className="size-4" /> },
      { to: "/app/customers", label: "Customers", icon: <Users className="size-4" /> },
    ],
  },
  {
    heading: "Setup",
    items: [
      { to: "/app/catalog", label: "Catalog", icon: <Boxes className="size-4" /> },
      { to: "/app/plans", label: "Plans & pricing", icon: <Tags className="size-4" /> },
      { to: "/app/admin", label: "Admin", icon: <ShieldCheck className="size-4" /> },
    ],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const isAdmin = (user?.role as string) === "admin";

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const filteredItems = group.items.filter((item) => {
          if (item.to === "/app/admin" && !isAdmin) return false;
          return true;
        });

        if (filteredItems.length === 0) return null;

        return (
          <div key={group.heading}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {filteredItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-brand/20 text-white shadow-[inset_2px_0_0_0_var(--brand)]"
                          : "text-white/65 hover:bg-white/5 hover:text-white",
                      )
                    }
                  >
                    <span className="text-brand-strong opacity-90">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const role = user?.role ?? ROLES.CUSTOMER;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 outline-none ring-ring focus-visible:ring-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand/25 text-xs font-semibold uppercase text-white">
            {(user?.name ?? user?.email ?? "?").slice(0, 1)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-medium">{user?.name ?? "Account"}</p>
          <p className="truncate text-xs font-normal text-muted-foreground">
            {user?.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/app/account")}>
          <Settings2 className="size-4" /> Account & password
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate("/");
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
          Role: {ROLE_LABELS[role]}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  // Customers belong in the portal; keep them out of the back office.
  if (user && user.role === ROLES.CUSTOMER) {
    return <Navigate to="/portal" replace />;
  }

  const handleLogout = async () => {
    await signOut();
    navigate("/admin/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo className="size-7 text-brand" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Brightloop</p>
            <p className="text-[11px] text-white/50">Back office</p>
          </div>
        </div>
        <NavList />
        <div className="border-t border-sidebar-border px-5 py-4 text-[11px] text-white/40">
          Asia/Kolkata · IST billing days
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
        <button
          className="rounded-md border border-border p-2"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <Menu className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <Logo className="size-5 text-brand" />
          <span className="text-sm font-semibold">Brightloop</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
            title="Log out"
          >
            <LogOut className="size-4" />
          </Button>
          <UserMenu />
        </div>
      </header>

      <div className="lg:pl-60">
        <div className="hidden items-center justify-end gap-3 border-b border-border/70 bg-background/80 px-6 py-3 backdrop-blur lg:flex">
          <span className="text-xs text-muted-foreground">
            Recurring billing, quotes and invoicing
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40"
          >
            <LogOut className="size-3.5" /> Log out
          </Button>
          <UserMenu />
        </div>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <SheetHeader className="flex-row items-center gap-2 border-b border-sidebar-border px-5 py-4">
            <Logo className="size-6 text-brand" />
            <SheetTitle className="text-white">Brightloop</SheetTitle>
            <button
              className="ml-auto text-white/60 hover:text-white"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="size-4" />
            </button>
          </SheetHeader>
          <NavList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Thin wrapper so pages read as cards on the app canvas. */
export function Panel({ children }: { children: ReactNode }) {
  return <Card className="card-layer border-0 p-0">{children}</Card>;
}
