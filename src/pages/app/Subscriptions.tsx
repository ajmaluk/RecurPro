import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "sonner";
import {
  ArrowRight,
  CalendarClock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  Field,
  LoadingBlock,
  Money,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR, paiseToRupees, parseRupeesToPaise } from "@/shared/money";
import { BILLING_PERIOD_LABELS, SUBSCRIPTION_STATUSES } from "@/shared/enums";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = ["", ...SUBSCRIPTION_STATUSES] as const;

const TRANSITION_LABELS: Record<string, string> = {
  DRAFT: "Return to draft",
  QUOTATION: "Send as quotation",
  CONFIRMED: "Confirm subscription",
  ACTIVE: "Activate",
  PAUSED: "Pause",
  CLOSED: "Close",
};

function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export default function Subscriptions() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const { results, status: pageStatus, loadMore, isLoading } = usePaginatedQuery(
    api.subscriptions.list,
    { q: query || undefined, status: status || undefined },
    { numItems: 20 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Every recurring agreement, from quotation to closed, with its full status history."
        actions={
          <Button asChild>
            <Link to="/app/subscriptions/new">
              <Plus className="mr-1.5 size-4" /> New subscription
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((value) => (
            <button
              key={value || "all"}
              onClick={() => setStatus(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                status === value
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {value ? (value.charAt(0) + value.slice(1).toLowerCase()) : "All"}
            </button>
          ))}
        </div>
        <form
          className="relative w-full sm:w-72"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search.trim());
          }}
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search number or customer"
            className="pl-9"
          />
        </form>
      </div>

      <SectionCard>
        {isLoading && results.length === 0 ? (
          <LoadingBlock />
        ) : results.length === 0 ? (
          <EmptyState
            title="No subscriptions yet"
            description="Start from a quotation template — it brings the plan, lines and validity with it."
            action={
              <Button asChild>
                <Link to="/app/subscriptions/new">New subscription</Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Subscription</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Window</th>
                  <th className="pb-2 font-medium">Next invoice</th>
                  <th className="pb-2 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {results.map((row) => (
                  <tr key={String(row._id)} className="hover:bg-muted/50">
                    <td className="py-3">
                      <Link
                        to={`/app/subscriptions/${row._id}`}
                        className="font-medium hover:text-brand"
                      >
                        {row.number}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {(row.searchText ?? "").split(" ").slice(1).join(" ")}
                      </p>
                    </td>
                    <td className="py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-3 text-xs tabular-nums text-muted-foreground">
                      {row.startDate} → {row.expiryDate}
                    </td>
                    <td className="py-3 text-xs tabular-nums">
                      {row.nextInvoiceDate ?? "—"}
                    </td>
                    <td className="py-3 text-right">
                      <Link to={`/app/subscriptions/${row._id}`} className="hover:text-brand">
                        <ArrowRight className="inline size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{pageStatus === "LoadingMore" ? "Loading…" : `${results.length} shown`}</span>
          {pageStatus === "CanLoadMore" ? (
            <Button variant="outline" size="sm" onClick={loadMore}>
              Load more
            </Button>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export function SubscriptionDetailPage() {
  const { id } = useParams();
  const subscriptionId = id as Id<"subscriptions">;
  const detail = useQuery(api.subscriptions.detail, { id: subscriptionId });
  const history = useQuery(api.subscriptions.historyFor, { id: subscriptionId });
  const preview = useQuery(
    api.subscriptions.renewalPreview,
    detail?.canRenew ? { id: subscriptionId } : "skip",
  );
  const transition = useMutation(api.subscriptions.transition);
  const renew = useMutation(api.subscriptions.renew);
  const updateDraft = useMutation(api.subscriptions.updateDraft);

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  if (!detail) return <LoadingBlock label="Loading subscription…" />;

  const { subscription, plan, customer, paymentTerm, lines, totals, transitions, invoices, isStaff, canRenew } = detail;
  const editable =
    isStaff && (subscription.status === "DRAFT" || subscription.status === "QUOTATION");

  const act = async (action: () => Promise<unknown>, successMessage?: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link to="/app/subscriptions" className="hover:text-foreground">
            Subscriptions
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {subscription.number}
            <StatusBadge status={subscription.status} />
          </span>
        }
        description={`${customer?.name ?? ""} · ${plan?.name ?? ""} · ${
          plan ? BILLING_PERIOD_LABELS[plan.billingPeriod] : ""
        }`}
        actions={
          <>
            {editable ? (
              <Button variant="outline" onClick={() => setEditing((value) => !value)}>
                <Pencil className="mr-1.5 size-4" />
                {editing ? "Stop editing" : "Edit draft"}
              </Button>
            ) : null}
            {canRenew && isStaff ? (
              <Button variant="outline" onClick={() => setRenewOpen(true)}>
                <RefreshCw className="mr-1.5 size-4" /> Renew
              </Button>
            ) : null}
          </>
        }
      />

      <ErrorNote message={error} />

      {transitions.filter((step) => step.allowed).length > 0 && isStaff ? (
        <SectionCard
          title="Move it along"
          description="Only the transitions the state machine allows are shown"
        >
          <div className="flex flex-wrap gap-2">
            {transitions
              .filter((step) => step.allowed)
              .map((step) => (
                <Button
                  key={step.to}
                  variant={step.to === "CLOSED" ? "outline" : "default"}
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => transition({ id: subscription._id, to: step.to }),
                      `Moved to ${step.to.toLowerCase()}`,
                    )
                  }
                >
                  {TRANSITION_LABELS[step.to] ?? step.to}
                </Button>
              ))}
          </div>
          {transitions.some((step) => !step.allowed && step.reason) ? (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {transitions
                .filter((step) => !step.allowed && step.reason)
                .map((step) => (
                  <li key={step.to}>
                    {step.to}: {step.reason}
                  </li>
                ))}
            </ul>
          ) : null}
        </SectionCard>
      ) : null}

      {editing ? (
        <DraftEditor
          startDate={subscription.startDate}
          expiryDate={subscription.expiryDate}
          paymentTermId={subscription.paymentTermId}
          discountId={subscription.discountId ?? ""}
          lines={lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId ?? "",
            description: line.description,
            quantity: line.quantity,
            unitPrice: paiseToRupees(line.unitPrice).toFixed(2),
          }))}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (values) => {
            await act(async () => {
              await updateDraft({
                id: subscription._id,
                startDate: values.startDate,
                expiryDate: values.expiryDate,
                paymentTermId: values.paymentTermId,
                discountId: values.discountId || undefined,
                lines: values.lines,
              });
            }, "Draft updated");
            setEditing(false);
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <SectionCard title="Lines">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Unit price</th>
                  <th className="pb-2 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {lines.map((line) => (
                  <tr key={String(line._id)}>
                    <td className="py-2.5 pr-3">
                      {line.description}
                      {line.variantName ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {line.productName} · {line.variantName}
                        </span>
                      ) : null}
                      {line.currentPrice !== line.unitPrice ? (
                        <p className="text-xs text-amber-600">
                          Catalog price is now {formatINR(line.currentPrice)} — the
                          snapshot on this line stays {formatINR(line.unitPrice)}.
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{line.quantity}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatINR(line.unitPrice)}
                    </td>
                    <td className="py-2.5 text-right font-medium tabular-nums">
                      {formatINR(line.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-5 ml-auto w-full max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <Money paise={totals.subtotal} />
              </div>
              {detail.discountApplied ? (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {detail.discountApplied.name}
                  </span>
                  <span className="tabular-nums text-brand-strong">
                    −{formatINR(detail.discountApplied.amount)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <Money paise={totals.taxTotal} />
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Per period</span>
                <Money paise={totals.total} />
              </div>
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard title="Terms">
              <dl className="space-y-2.5 text-sm">
                {[
                  ["Customer", customer?.name ?? "—"],
                  ["Plan", plan?.name ?? "—"],
                  [
                    "Period",
                    plan ? BILLING_PERIOD_LABELS[plan.billingPeriod] : "—",
                  ],
                  ["Starts", subscription.startDate],
                  ["Expiry", subscription.expiryDate],
                  [
                    "Next invoice",
                    subscription.status === "ACTIVE"
                      ? (subscription.nextInvoiceDate ?? "—")
                      : "On activation",
                  ],
                  ["Payment terms", paymentTerm ? `${paymentTerm.name} (${paymentTerm.dueDays}d)` : "—"],
                  ["Renewal", plan?.renewable ? "Renewable" : "One term"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
            </SectionCard>

            <SectionCard title="Status history" description="Newest first">
              {!history ? (
                <LoadingBlock />
              ) : (
                <ol className="space-y-3">
                  {history.map((entry) => (
                    <li key={String(entry._id)} className="flex gap-3 text-sm">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                      <div>
                        <p className="font-medium">
                          {entry.fromStatus ? `${entry.fromStatus} → ` : ""}
                          {entry.toStatus}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(entry.changedAt).toLocaleString("en-IN")} ·{" "}
                          {entry.changedByName ?? "System"}
                          {entry.reason ? ` · ${entry.reason}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      <SectionCard
        title="Invoices"
        description="Generated by billing runs for this subscription"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/invoices">All invoices</Link>
          </Button>
        }
      >
        {invoices.length === 0 ? (
          <EmptyState title="No invoices yet" description="They appear when a billing run reaches the first period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Invoice</th>
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 text-right font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {invoices.map((invoice) => (
                  <tr key={String(invoice._id)}>
                    <td className="py-2.5">
                      <Link to={`/app/invoices/${invoice._id}`} className="font-medium hover:text-brand">
                        {invoice.number ?? "Draft"}
                      </Link>
                    </td>
                    <td className="py-2.5 text-xs tabular-nums text-muted-foreground">
                      {invoice.periodStart} → {invoice.periodEnd}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatINR(invoice.total)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {formatINR(invoice.amountDue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {renewOpen && preview ? (
        <RenewDialog
          preview={preview}
          busy={busy}
          onClose={() => setRenewOpen(false)}
          onConfirm={async () => {
            await act(async () => {
              await renew({ id: subscription._id });
              toast.success("Renewal created — it is now a draft subscription");
            });
            setRenewOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function RenewDialog({
  preview,
  busy,
  onClose,
  onConfirm,
}: {
  preview: {
    startDate: string;
    expiryDate: string;
    planName: string;
    customerName: string;
    lines: { description: string; quantity: number; unitPrice: number }[];
    totals: { subtotal: number; discountTotal: number; taxTotal: number; total: number };
  };
  busy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card-layer w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold">Renew this subscription</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {preview.customerName} · {preview.planName} · {preview.startDate} →{" "}
          {preview.expiryDate}
        </p>
        <ul className="mt-4 divide-y divide-border/70 text-sm">
          {preview.lines.map((line, index) => (
            <li key={`${line.description}-${index}`} className="flex justify-between py-2">
              <span>
                {line.description} × {line.quantity}
              </span>
              <span className="tabular-nums">{formatINR(line.unitPrice * line.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">First period total</span>
          <span className="text-base font-semibold tabular-nums">
            {formatINR(preview.totals.total)}
          </span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            Confirm renewal
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Draft editor                                                        */
/* ------------------------------------------------------------------ */

type DraftLine = {
  productId: Id<"products">;
  variantId: string;
  description: string;
  quantity: number;
  unitPrice: string;
};

function DraftEditor({
  startDate,
  expiryDate,
  paymentTermId,
  discountId,
  lines: initialLines,
  busy,
  onCancel,
  onSave,
}: {
  startDate: string;
  expiryDate: string;
  paymentTermId: Id<"paymentTerms">;
  discountId: string;
  lines: DraftLine[];
  busy: boolean;
  onCancel: () => void;
  onSave: (values: {
    startDate: string;
    expiryDate: string;
    paymentTermId: Id<"paymentTerms">;
    discountId: string;
    lines: {
      productId: Id<"products">;
      variantId: string;
      description: string;
      quantity: number;
      unitPrice: string;
    }[];
  }) => Promise<void>;
}) {
  const [start, setStart] = useState(startDate);
  const [expiry, setExpiry] = useState(expiryDate);
  const [term, setTerm] = useState<Id<"paymentTerms">>(paymentTermId);
  const [discount, setDiscount] = useState(discountId);
  const [rows, setRows] = useState(initialLines);
  const [error, setError] = useState<string | null>(null);

  const terms = useQuery(api.plans.paymentTerms);
  const discounts = useQuery(api.pricing.listDiscounts);

  const dirty = useMemo(
    () =>
      start !== startDate ||
      expiry !== expiryDate ||
      term !== paymentTermId ||
      discount !== discountId ||
      JSON.stringify(rows) !== JSON.stringify(initialLines),
    [start, expiry, term, discount, rows, startDate, expiryDate, paymentTermId, discountId, initialLines],
  );

  return (
    <SectionCard title="Edit draft" description="Only drafts and quotations can be edited. Prices are stored in rupees and converted to integer paise.">
      <ErrorNote message={error} />
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <Field label="Start date" required>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Expiry date" required>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label="Payment terms" required>
          <Select value={term} onValueChange={(value) => setTerm(value as Id<"paymentTerms">)}>
            <SelectTrigger>
              <SelectValue placeholder="Terms" />
            </SelectTrigger>
            <SelectContent>
              {(terms ?? []).map((entry) => (
                <SelectItem key={String(entry._id)} value={String(entry._id)}>
                  {entry.name} ({entry.dueDays}d)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Discount" hint="Applied to every period while attached">
          <Select value={discount || "none"} onValueChange={(value) => setDiscount(value === "none" ? "" : value)}>
            <SelectTrigger>
              <SelectValue placeholder="No discount" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No discount</SelectItem>
              {(discounts ?? [])
                .filter((entry) => entry.isActive)
                .map((entry) => (
                  <SelectItem key={String(entry._id)} value={String(entry._id)}>
                    {entry.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-6 space-y-3">
        <div className="grid grid-cols-[1fr_5rem_7rem_2rem] gap-3 text-xs font-medium text-muted-foreground">
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit (₹)</span>
          <span />
        </div>
        {rows.map((row, index) => (
          <div key={`${row.productId}-${index}`} className="grid grid-cols-[1fr_5rem_7rem_2rem] items-center gap-3">
            <Input
              value={row.description}
              onChange={(event) =>
                setRows((current) =>
                  current.map((entry, i) =>
                    i === index ? { ...entry, description: event.target.value } : entry,
                  ),
                )
              }
            />
            <Input
              type="number"
              min={1}
              value={row.quantity}
              className="text-right"
              onChange={(event) =>
                setRows((current) =>
                  current.map((entry, i) =>
                    i === index
                      ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) }
                      : entry,
                  ),
                )
              }
            />
            <Input
              inputMode="decimal"
              value={row.unitPrice}
              className="text-right"
              onChange={(event) =>
                setRows((current) =>
                  current.map((entry, i) =>
                    i === index ? { ...entry, unitPrice: event.target.value } : entry,
                  ),
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              aria-label="Remove line"
            >
              ×
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Prices are entered in rupees and stored as integer paise.
          </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={busy || !dirty}
            onClick={async () => {
              setError(null);
              for (const row of rows) {
                if (parseRupeesToPaise(row.unitPrice) === null) {
                  setError(`"${row.description}" has an invalid price.`);
                  return;
                }
              }
              if (expiry < start) {
                setError("Expiry must be on or after the start date.");
                return;
              }
              try {
                await onSave({
                  startDate: start,
                  expiryDate: expiry,
                  paymentTermId: term,
                  discountId: discount,
                  lines: rows,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Save failed.");
              }
            }}
          >
            Save draft
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* New subscription wizard                                             */
/* ------------------------------------------------------------------ */

export function NewSubscriptionPage() {
  const navigate = useNavigate();
  const customers = useQuery(api.customers.options);
  const templates = useQuery(api.templates.list);
  const terms = useQuery(api.plans.paymentTerms);
  const discounts = useQuery(api.pricing.listDiscounts);
  const create = useMutation(api.subscriptions.createFromTemplate);

  const [customerId, setCustomerId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [start, setStart] = useState(todayIso());
  const [expiry, setExpiry] = useState(todayIso(365));
  const [termId, setTermId] = useState("");
  const [discountId, setDiscountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!termId && terms && terms.length > 0) setTermId(String(terms[0]._id));
    if (!templateId && templates && templates.length > 0)
      setTemplateId(String(templates[0]._id));
  }, [terms, templates, termId, templateId]);

  const chosen = templates?.find((template) => String(template._id) === templateId);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await create({
        templateId: templateId as Id<"quotationTemplates">,
        customerId: customerId as Id<"customers">,
        startDate: start,
        expiryDate: expiry,
        paymentTermId: termId as Id<"paymentTerms">,
        discountId: discountId && discountId !== "none" ? discountId : undefined,
      });
      toast.success("Subscription created as a draft");
      navigate(`/app/subscriptions/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the subscription.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link to="/app/subscriptions" className="hover:text-foreground">
            Subscriptions
          </Link>
        }
        title="New subscription"
        description="Start from a quotation template: it brings the plan, line items and validity. You can edit lines before confirming."
      />

      <ErrorNote message={error} />

      <form onSubmit={submit}>
        <SectionCard title="1 · Customer and template">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer" required>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a customer" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map((customer) => (
                    <SelectItem key={String(customer._id)} value={String(customer._id)}>
                      {customer.name}
                      {customer.company ? ` · ${customer.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Quotation template"
              required
              hint={chosen ? `${chosen.planName} · ${chosen.lineCount} line(s)` : undefined}
            >
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template" />
                </SelectTrigger>
                <SelectContent>
                  {(templates ?? []).map((template) => (
                    <SelectItem key={String(template._id)} value={String(template._id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SectionCard>

        <div className="h-4" />

        <SectionCard title="2 · Dates and terms">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" required hint="Billing begins on this date (IST)">
              <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} required />
            </Field>
            <Field label="Expiry date" required hint="The subscription closes after this day if the plan auto-closes">
              <Input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} required />
            </Field>
            <Field label="Payment terms" required>
              <Select value={termId} onValueChange={(value) => setTermId(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Terms" />
                </SelectTrigger>
                <SelectContent>
                  {(terms ?? []).map((entry) => (
                    <SelectItem key={String(entry._id)} value={String(entry._id)}>
                      {entry.name} ({entry.dueDays}d)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Discount" hint="Optional — applied to every period it is eligible for">
              <Select value={discountId || "none"} onValueChange={(value) => setDiscountId(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="No discount" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No discount</SelectItem>
                  {(discounts ?? [])
                    .filter((entry) => entry.isActive)
                    .map((entry) => (
                      <SelectItem key={String(entry._id)} value={String(entry._id)}>
                        {entry.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              Created as a draft — confirm it from the subscription page.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" asChild>
                <Link to="/app/subscriptions">Cancel</Link>
              </Button>
              <Button type="submit" disabled={busy || !customerId || !templateId || !termId}>
                {busy ? "Creating…" : "Create draft"}
                <ArrowRight className="ml-1.5 size-4" />
              </Button>
            </div>
          </div>
        </SectionCard>
      </form>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">Step 1 of 2</Badge>
        <span className="text-xs text-muted-foreground">
          A third step — editing lines — happens on the subscription itself, so
          template edits stay shared.
        </span>
      </div>
    </div>
  );
}
