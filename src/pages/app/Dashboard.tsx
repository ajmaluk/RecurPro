import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowUpRight,
  BadgeIndianRupee,
  CircleAlert,
  IndianRupee,
  LogOut,
  Plus,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { EmptyState, LoadingBlock, Money, PageHeader, SectionCard, StatusBadge } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/shared/money";

function KpiCard({
  label,
  value,
  caption,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  caption?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "brand" | "alert";
}) {
  return (
    <div className="card-layer p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span
          className={
            tone === "alert"
              ? "flex size-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600"
              : tone === "brand"
                ? "flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand-strong"
                : "flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          }
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {caption ? <p className="mt-1 text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

export default function Dashboard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const overview = useQuery(api.reports.overview);
  const runs = useQuery(api.billing.recentRuns);

  if (!overview) return <LoadingBlock label="Loading your numbers…" />;

  const maxBilled = Math.max(1, ...overview.series.map((row) => row.billed));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Recurring revenue at a glance · ${overview.today}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/billing">
                <RefreshCw className="mr-1.5 size-4" /> Billing runs
              </Link>
            </Button>
            <Button asChild>
              <Link to="/app/subscriptions/new">
                <Plus className="mr-1.5 size-4" /> New subscription
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                signOut();
                navigate("/admin/login");
              }}
              className="gap-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/40"
            >
              <LogOut className="size-4" /> Log out
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Billed this month"
          value={formatINR(overview.billedThisMonth)}
          caption={`${overview.invoiceCountThisMonth} invoice(s) issued`}
          icon={<BadgeIndianRupee className="size-4" />}
          tone="brand"
        />
        <KpiCard
          label="Collected this month"
          value={formatINR(overview.collectedThisMonth)}
          caption="Payments recorded in IST calendar month"
          icon={<TrendingUp className="size-4" />}
        />
        <KpiCard
          label="Overdue"
          value={formatINR(overview.overdueAmount)}
          caption={`${overview.overdueCount} confirmed invoice(s) past due`}
          icon={<CircleAlert className="size-4" />}
          tone={overview.overdueCount > 0 ? "alert" : "neutral"}
        />
        <KpiCard
          label="MRR"
          value={formatINR(overview.mrr)}
          caption={`${overview.activeSubscriptions} active subscription(s)`}
          icon={<IndianRupee className="size-4" />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <SectionCard
          title="Billed vs collected"
          description="Rolling 12 months, by IST calendar month"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/reports">
                Reports <ArrowUpRight className="ml-1 size-3.5" />
              </Link>
            </Button>
          }
        >
          <div className="flex h-56 items-end gap-2">
            {overview.series.map((row) => {
              const billedHeight = Math.round((row.billed / maxBilled) * 100);
              const collectedHeight = Math.round((row.collected / maxBilled) * 100);
              return (
                <div key={row.month} className="group relative flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-1">
                    <div
                      className="w-1/2 rounded-t bg-brand/80 transition-all group-hover:bg-brand"
                      style={{ height: `${Math.max(billedHeight, 2)}%` }}
                      title={`Billed ${formatINR(row.billed)}`}
                    />
                    <div
                      className="w-1/2 rounded-t bg-ink/25 transition-all group-hover:bg-ink/45"
                      style={{ height: `${Math.max(collectedHeight, 2)}%` }}
                      title={`Collected ${formatINR(row.collected)}`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{row.month}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-brand" /> Billed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-ink/30" /> Collected
            </span>
            <span className="ml-auto">
              Last run:{" "}
              {runs && runs[0]
                ? `${runs[0].status.toLowerCase()} · ${runs[0].created} created`
                : "never"}
            </span>
          </div>
        </SectionCard>

        <SectionCard
          title="Dunning queue"
          description="Confirmed invoices past their due date"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/app/invoices?overdue=1">All overdue</Link>
            </Button>
          }
        >
          {overview.dunningQueue.length === 0 ? (
            <EmptyState
              title="Nothing overdue"
              description="Every confirmed invoice is inside its payment terms."
            />
          ) : (
            <ul className="divide-y divide-border/70">
              {overview.dunningQueue.map((row) => (
                <li key={String(row._id)}>
                  <Link
                    to={`/app/invoices/${row._id}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:opacity-80"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.number}</p>
                      <p className="text-xs text-muted-foreground">
                        Due {row.dueDate} · {row.daysOverdue}d late
                      </p>
                    </div>
                    <Money paise={row.amountDue} className="text-sm font-semibold text-rose-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-border/70 pt-3 text-xs text-muted-foreground">
            Ageing: 1–30d {formatINR(overview.aging.d1_30)} · 31–60d{" "}
            {formatINR(overview.aging.d31_60)} · 60d+ {formatINR(overview.aging.d61plus)}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Billing run activity"
        description="Newest first — every run records what it created"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/billing">Open billing runs</Link>
          </Button>
        }
      >
        {!runs ? (
          <LoadingBlock />
        ) : runs.length === 0 ? (
          <EmptyState
            title="No billing runs yet"
            description="Start one from the billing page or wait for the nightly cron at 00:30 IST."
            action={
              <Button asChild>
                <Link to="/app/billing">Go to billing runs</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Started</th>
                  <th className="pb-2 font-medium">Trigger</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Processed</th>
                  <th className="pb-2 text-right font-medium">Created</th>
                  <th className="pb-2 text-right font-medium">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {runs.map((run) => (
                  <tr key={String(run._id)}>
                    <td className="py-2.5 tabular-nums">
                      {new Date(run.startedAt).toLocaleString("en-IN")}
                    </td>
                    <td className="py-2.5 capitalize">{run.triggeredBy}</td>
                    <td className="py-2.5">
                      <StatusBadge
                        status={
                          run.status === "SUCCEEDED"
                            ? "ACTIVE"
                            : run.status === "FAILED"
                              ? "CANCELLED"
                              : "CONFIRMED"
                        }
                        className={
                          run.status === "SUCCEEDED"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : run.status === "FAILED"
                              ? "bg-rose-50 text-rose-700 ring-rose-200"
                              : "bg-sky-50 text-sky-700 ring-sky-200"
                        }
                      />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{run.processed}</td>
                    <td className="py-2.5 text-right tabular-nums">{run.created}</td>
                    <td className="py-2.5 text-right tabular-nums">{run.failed}</td>
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
