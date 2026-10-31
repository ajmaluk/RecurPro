import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import {
  CreditCard,
  Layers,
  Calendar,
  ArrowRight,
  Receipt,
} from "lucide-react";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/Bits";
import { formatINR } from "@/shared/money";

export default function PortalDashboard() {
  const data = useQuery(api.portal.dashboard);

  if (!data) return <LoadingBlock label="Loading your portal…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Account Overview"
        description="Monitor your active subscriptions, next billing dates, and invoices."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Active Subscriptions"
          value={String(data.activeCount)}
          hint={`${data.totalSubscriptions} total subscriptions`}
          icon={<Layers className="size-4" />}
        />
        <StatCard
          title="Outstanding Balance"
          value={formatINR(data.outstanding)}
          hint={data.outstanding > 0 ? "Awaiting payment" : "All clear"}
          icon={<CreditCard className="size-4" />}
        />
        <StatCard
          title="Upcoming Invoice"
          value={data.upcomingInvoiceDate ?? "None scheduled"}
          hint={data.upcomingPlanName ? `For ${data.upcomingPlanName}` : "No active renewal"}
          icon={<Calendar className="size-4" />}
        />
      </div>

      <SectionCard
        title="Recent Invoices"
        description="Your most recent billing statements"
        actions={
          <Link
            to="/portal/invoices"
            className="flex items-center text-xs font-medium text-brand hover:underline"
          >
            View all invoices <ArrowRight className="ml-1 size-3" />
          </Link>
        }
      >
        {data.recentInvoices.length === 0 ? (
          <EmptyState
            title="No invoices yet"
            description="When a subscription renews or an invoice is generated, it will appear here."
            icon={<Receipt className="size-8 text-muted-foreground" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs font-medium text-muted-foreground">
                  <th className="pb-3">Invoice</th>
                  <th className="pb-3">Issued</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.recentInvoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-muted/30">
                    <td className="py-3 font-medium">
                      <Link
                        to={`/portal/invoices/${inv._id}`}
                        className="text-brand hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="py-3 text-muted-foreground">{inv.issueDate}</td>
                    <td className="py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="py-3 text-right font-medium">
                      {formatINR(inv.total)}
                    </td>
                    <td className="py-3 text-right font-semibold">
                      {inv.amountDue > 0 ? (
                        <span className="text-destructive">{formatINR(inv.amountDue)}</span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">Paid</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
