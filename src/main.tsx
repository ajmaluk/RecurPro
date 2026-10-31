/* eslint-disable react-refresh/only-export-components */
import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import "./index.css";

// Lazy load route components for better code splitting
const Landing = lazy(() => import("./pages/Landing"));
const AuthPage = lazy(() => import("./pages/Auth"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Staff back office (/app)
const AppShell = lazy(() => import("./components/app/AppShell").then((m) => ({ default: m.AppShell })));
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Billing = lazy(() => import("./pages/app/Billing"));
const Invoices = lazy(() => import("./pages/app/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/app/Invoices").then((m) => ({ default: m.InvoiceDetailPage })));
const Subscriptions = lazy(() => import("./pages/app/Subscriptions"));
const SubscriptionDetail = lazy(() => import("./pages/app/Subscriptions").then((m) => ({ default: m.SubscriptionDetailPage })));
const SubscriptionNew = lazy(() => import("./pages/app/Subscriptions").then((m) => ({ default: m.NewSubscriptionPage })));
const Customers = lazy(() => import("./pages/app/Customers"));
const CustomerDetail = lazy(() => import("./pages/app/Customers").then((m) => ({ default: m.CustomerDetailPage })));
const Catalog = lazy(() => import("./pages/app/Catalog"));
const Plans = lazy(() => import("./pages/app/Plans"));
const Reports = lazy(() => import("./pages/app/Reports"));
const Admin = lazy(() => import("./pages/app/Admin"));
const Account = lazy(() => import("./pages/Account"));

// Customer portal (/portal)
const PortalShell = lazy(() => import("./components/portal/PortalShell").then((m) => ({ default: m.PortalShell })));
const PortalDashboard = lazy(() => import("./pages/portal/Dashboard"));
const PortalSubscriptions = lazy(() => import("./pages/portal/Subscriptions"));
const PortalInvoices = lazy(() => import("./pages/portal/Invoices"));
const PortalInvoiceDetail = lazy(() => import("./pages/portal/Invoices").then((m) => ({ default: m.PortalInvoiceDetailPage })));
const PublicInvoiceView = lazy(() => import("./pages/PublicInvoiceView"));

import { useAuth } from "@/hooks/use-auth";

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

function SmartDashboardRedirect() {
  const { isLoading, isAuthenticated, user } = useAuth();
  if (isLoading) return <RouteLoading />;
  if (!isAuthenticated || !user) return <Navigate to="/admin/login" replace />;
  if (user.role === "customer") return <Navigate to="/portal" replace />;
  return <Navigate to="/app" replace />;
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in the browser runtime). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(error: Error) {
    console.error("[Preview] Root crash:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-1 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}


import { AuthProvider } from "@/hooks/use-auth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <AuthProvider>
          <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage />}
              />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin-login" element={<Navigate to="/admin/login" replace />} />
              <Route path="/portal/login" element={<AuthPage redirectAfterAuth="/portal" />} />
              <Route path="/customer-login" element={<Navigate to="/portal/login" replace />} />

              {/* Secure dashboard redirect */}
              <Route path="/dashboard" element={<SmartDashboardRedirect />} />

              {/* Public/Shareable invoice route */}
              <Route path="/invoice/view/:id" element={<PublicInvoiceView />} />

              <Route
                path="/app"
                element={
                  <RequireAuth
                    title="Sign in to the back office"
                    description="The RecurPro back office is for staff and admin accounts."
                    allowedRoles={["admin", "staff"]}
                    loginPath="/admin/login"
                    redirectImmediately={true}
                  >
                    <AppShell>
                      <Outlet />
                    </AppShell>
                  </RequireAuth>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="billing" element={<Billing />} />
                <Route path="invoices" element={<Invoices />} />
                <Route path="invoices/:id" element={<InvoiceDetail />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="subscriptions/new" element={<SubscriptionNew />} />
                <Route path="subscriptions/:id" element={<SubscriptionDetail />} />
                <Route path="customers" element={<Customers />} />
                <Route path="customers/:id" element={<CustomerDetail />} />
                <Route path="catalog" element={<Catalog />} />
                <Route path="plans" element={<Plans />} />
                <Route path="reports" element={<Reports />} />
                <Route
                  path="admin"
                  element={
                    <RequireAuth
                      allowedRoles={["admin"]}
                      title="Admin access required"
                      description="Only users with the Administrator role can access this section."
                      redirectImmediately={false}
                    >
                      <Admin />
                    </RequireAuth>
                  }
                />
                <Route path="account" element={<Account />} />
              </Route>

              <Route
                path="/portal"
                element={
                  <RequireAuth
                    title="Sign in to your portal"
                    description="Your subscriptions and invoices live behind your own login."
                    allowedRoles={["customer", "admin", "staff"]}
                    loginPath="/portal/login"
                    redirectImmediately={true}
                  >
                    <PortalShell>
                      <Outlet />
                    </PortalShell>
                  </RequireAuth>
                }
              >
                <Route index element={<PortalDashboard />} />
                <Route path="subscriptions" element={<PortalSubscriptions />} />
                <Route path="invoices" element={<PortalInvoices />} />
                <Route path="invoices/:id" element={<PortalInvoiceDetail />} />
                <Route path="account" element={<Account />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </AuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);
