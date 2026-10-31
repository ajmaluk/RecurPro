import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "react-router";
import {
  TrendingUp,
  CreditCard,
  AlertTriangle,
  FileText,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatCard,
} from "@/components/Bits";
import { formatINR } from "@/shared/money";

export default function Reports() {
  const data = useQuery(api.reports.overview);

  if (!data) return <LoadingBlock label="Calculating finance analytics…" />;

  const chartData = data.series.map((s) => ({
    name: s.month,
    Billed: s.billed / 100,
    Collected: s.collected / 100,
    from: s.from,
    to: s.to,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description="MRR trends, billing vs. collections, dunning queue, and receivables aging in Asia/Kolkata timezone."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="MRR (Active)"
          value={formatINR(data.mrr)}
          hint={`${data.activeSubscriptions} active subscriptions`}
          icon={<TrendingUp className="size-4" />}
        />
        <StatCard
          title="Billed This Month"
          value={formatINR(data.billedThisMonth)}
          hint={`${data.invoiceCountThisMonth} invoices issued`}
          icon={<FileText className="size-4" />}
        />
        <StatCard
          title="Collected This Month"
          value={formatINR(data.collectedThisMonth)}
          hint="Payments settled"
          icon={<CreditCard className="size-4" />}
        />
        <StatCard
          title="Overdue Receivables"
          value={formatINR(data.overdueAmount)}
          hint={`${data.overdueCount} overdue invoices`}
          icon={<AlertTriangle className="size-4 text-destructive" />}
        />
      </div>

      <SectionCard
        title="12-Month Revenue & Collection Trend"
        description="Monthly invoice billings vs settled collections (values in ₹)"
      >
        <div className="h-80 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                tickFormatter={(value) => `₹${value.toLocaleString("en-IN")}`}
              />
              <Tooltip
                formatter={(val: any) => [`₹${Number(val).toLocaleString("en-IN")}`, undefined]}
                contentStyle={{
                  backgroundColor: "var(--card)",
                  borderColor: "var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Legend />
              <Bar dataKey="Billed" fill="var(--brand, #3b82f6)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Collected" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <div className="grid gap-6 md:grid-cols-2">
        <SectionCard
          title="Aging Receivables"
          description="Distribution of overdue balance by days past invoice due date"
        >
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border/80 bg-muted/30 p-4 text-center">
              <span className="text-xs font-medium text-muted-foreground">1 – 30 Days</span>
              <p className="mt-1 text-lg font-bold text-foreground">
                {formatINR(data.aging.d1_30)}
              </p>
            </div>
            <div className="rounded-lg border border-border/80 bg-amber-500/10 p-4 text-center text-amber-600 dark:text-amber-400">
              <span className="text-xs font-medium">31 – 60 Days</span>
              <p className="mt-1 text-lg font-bold">
                {formatINR(data.aging.d31_60)}
              </p>
            </div>
            <div className="rounded-lg border border-border/80 bg-destructive/10 p-4 text-center text-destructive">
              <span className="text-xs font-medium">60+ Days</span>
              <p className="mt-1 text-lg font-bold">
                {formatINR(data.aging.d61plus)}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Dunning & Attention Queue"
          description="Earliest overdue invoices requiring follow-up"
          actions={
            <Link
              to="/app/invoices?status=overdue"
              className="flex items-center text-xs font-medium text-brand hover:underline"
            >
              View all overdue <ArrowRight className="ml-1 size-3" />
            </Link>
          }
        >
          {data.dunningQueue.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No overdue invoices in the queue! Excellent work.
            </p>
          ) : (
            <div className="divide-y divide-border/60">
              {data.dunningQueue.slice(0, 5).map((row) => (
                <div key={row._id} className="flex items-center justify-between py-2.5">
                  <div>
                    <Link
                      to={`/app/invoices/${row._id}`}
                      className="text-sm font-semibold hover:text-brand"
                    >
                      {row.number}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Due: {row.dueDate}</span>
                      <span className="text-destructive font-medium">
                        ({row.daysOverdue} days overdue)
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-destructive">
                      {formatINR(row.amountDue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
