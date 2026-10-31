import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PlayCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { EmptyState, ErrorNote, LoadingBlock, Money, PageHeader, SectionCard } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/shared/money";

export default function Billing() {
  const preview = useQuery(api.billing.preview);
  const runs = useQuery(api.billing.recentRuns);
  const startRun = useMutation(api.billing.start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedId, setStartedId] = useState<Id<"jobRuns"> | null>(null);
  const job = useQuery(
    api.billing.jobStatus,
    startedId ? { jobRunId: startedId } : "skip",
  );

  const runNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await startRun({});
      setStartedId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run could not start.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing runs"
        description="Preview exactly what would be billed, then run it. Every period carries a unique key, so nothing bills twice."
        actions={
          <Button onClick={runNow} disabled={busy || preview?.invoiceCount === 0}>
            {busy ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : <PlayCircle className="mr-1.5 size-4" />}
            Run billing now
          </Button>
        }
      />

      <ErrorNote message={error} />

      {job ? (
        <SectionCard
          title={
            <>
              Latest run · <span className="capitalize">{job.triggeredBy}</span>
            </>
          }
          description={`Started ${new Date(job.startedAt).toLocaleString("en-IN")}`}
        >
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="font-medium">{job.status}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Subscriptions processed</p>
              <p className="font-medium tabular-nums">{job.processed}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Invoices created</p>
              <p className="font-medium tabular-nums">{job.created}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Failures</p>
              <p className="font-medium tabular-nums">{job.failed}</p>
            </div>
            {job.stuckIds.length > 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-700">
                <ShieldAlert className="size-4" />
                {job.stuckIds.length} stuck subscription(s) need attention
              </div>
            ) : null}
            {job.error ? (
              <p className="w-full text-sm text-rose-600">{job.error}</p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Dry run preview"
        description="Same builder as the real run, writes disabled"
        actions={
          preview ? (
            <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-strong">
              {preview.invoiceCount} invoice(s) · {formatINR(preview.total)}
            </span>
          ) : null
        }
      >
        {!preview ? (
          <LoadingBlock />
        ) : preview.rows.length === 0 ? (
          <EmptyState
            title="Nothing is due"
            description="Every active subscription has been billed up to today. The next period starts on its own schedule."
          />
        ) : (
          <div className="space-y-4">
            {preview.rows.map((row) => (
              <div key={String(row.subscriptionId)} className="rounded-xl border border-border/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/app/subscriptions/${row.subscriptionId}`}
                    className="text-sm font-semibold hover:text-brand"
                  >
                    {row.number}
                  </Link>
                  <span className="text-sm text-muted-foreground">{row.customerName}</span>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-1 font-medium">Period</th>
                      <th className="pb-1 font-medium">Discount</th>
                      <th className="pb-1 text-right font-medium">Subtotal</th>
                      <th className="pb-1 text-right font-medium">Discount off</th>
                      <th className="pb-1 text-right font-medium">Tax</th>
                      <th className="pb-1 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {row.periods.map((period) => (
                      <tr key={period.periodStart}>
                        <td className="py-2 tabular-nums">
                          {period.periodStart} → {period.periodEnd}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {period.discountName ?? "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatINR(period.subtotal)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {period.discountTotal ? `−${formatINR(period.discountTotal)}` : "—"}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatINR(period.taxTotal)}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {formatINR(period.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Run history"
        description="Cron fires daily at 00:30 IST (19:00 UTC)"
      >
        {!runs ? (
          <LoadingBlock />
        ) : runs.length === 0 ? (
          <EmptyState title="No runs yet" description="Manual runs and the nightly cron both appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Run date</th>
                  <th className="pb-2 font-medium">Trigger</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Processed</th>
                  <th className="pb-2 text-right font-medium">Invoices</th>
                  <th className="pb-2 text-right font-medium">Failed</th>
                  <th className="pb-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {runs.map((run) => (
                  <tr key={String(run._id)}>
                    <td className="py-2.5 tabular-nums">{run.runDate}</td>
                    <td className="py-2.5 capitalize">{run.triggeredBy}</td>
                    <td className="py-2.5">
                      <span
                        className={
                          run.status === "SUCCEEDED"
                            ? "text-emerald-700"
                            : run.status === "FAILED"
                              ? "text-rose-700"
                              : "text-sky-700"
                        }
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{run.processed}</td>
                    <td className="py-2.5 text-right tabular-nums">{run.created}</td>
                    <td className="py-2.5 text-right tabular-nums">{run.failed}</td>
                    <td className="max-w-xs truncate py-2.5 text-xs text-muted-foreground">
                      {run.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Due totals in this preview: <Money paise={preview?.total ?? 0} />. Preview
        rows are computed by the same code the run executes, so what you see is
        what gets written.
      </p>
    </div>
  );
}
