import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Ban,
  CheckCircle2,
  CreditCard,
  Download,
  Printer,
  Search,
} from "lucide-react";
import {
  EmptyState,
  ErrorNote,
  LoadingBlock,
  Money,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR, paiseToRupees } from "@/shared/money";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "PAID", label: "Paid" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "overdue", label: "Overdue" },
];

export default function Invoices() {
  const [params, setParams] = useSearchParams();
  const active = params.get("overdue") ? "overdue" : (params.get("status") ?? "");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.invoices.list,
    {
      status: active && active !== "overdue" ? active : undefined,
      overdue: active === "overdue" ? true : undefined,
      q: query || undefined,
    },
    { numItems: 25 },
  );

  const setFilter = (key: string) => {
    const next = new URLSearchParams();
    if (key === "overdue") next.set("overdue", "1");
    else if (key) next.set("status", key);
    setParams(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Draft → Confirmed → Paid. Confirmed invoices are immutable; corrections happen by cancelling a draft."
        actions={
          <Button variant="outline" asChild>
            <Link to="/app/billing">Run billing</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.key}
              onClick={() => setFilter(filter.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active === filter.key
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {filter.label}
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
            title="No invoices here"
            description="Invoices appear once a billing run generates them — or when you confirm a draft."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Invoice</th>
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 font-medium">Period</th>
                  <th className="pb-2 font-medium">Due</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 text-right font-medium">Due amount</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {results.map((invoice) => (
                  <tr key={String(invoice._id)} className="hover:bg-muted/50">
                    <td className="py-3">
                      <Link
                        to={`/app/invoices/${invoice._id}`}
                        className="font-medium hover:text-brand"
                      >
                        {invoice.number ?? "Draft"}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {invoice.subscriptionNumber}
                      </p>
                    </td>
                    <td className="py-3">{invoice.customerName}</td>
                    <td className="py-3 text-xs tabular-nums text-muted-foreground">
                      {invoice.periodStart ?? "—"} → {invoice.periodEnd ?? "—"}
                    </td>
                    <td className="py-3 text-xs tabular-nums">{invoice.dueDate}</td>
                    <td className="py-3 text-right tabular-nums">
                      {formatINR(invoice.total)}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {invoice.amountDue > 0 ? formatINR(invoice.amountDue) : "—"}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={invoice.status} />
                        {invoice.overdue ? (
                          <StatusBadge status="OVERDUE" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>{status === "LoadingMore" ? "Loading…" : `${results.length} shown`}</span>
          {status === "CanLoadMore" ? (
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

const METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "CASH", label: "Cash" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "ONLINE", label: "Online" },
] as const;

export function InvoiceDetailPage() {
  const { id } = useParams();
  const invoiceId = id as Id<"invoices">;
  const detail = useQuery(api.invoices.detail, { id: invoiceId });
  const confirm = useMutation(api.invoices.confirm);
  const cancel = useMutation(api.invoices.cancel);
  const recordPayment = useMutation(api.payments.record);

  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  if (!detail) return <LoadingBlock label="Loading invoice…" />;
  const { invoice, lines, payments, subscription, customer, isStaff } = detail;

  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (success) setError(null);
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
          <Link to="/app/invoices" className="hover:text-foreground">
            Invoices
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {invoice.number ?? "Draft invoice"}
            <StatusBadge status={invoice.status} />
            {detail.overdue ? <StatusBadge status="OVERDUE" /> : null}
          </span>
        }
        description={
          <>
            {invoice.customerSnapshot.name}
            {subscription ? <> · {subscription.number}</> : null}
            {invoice.periodStart ? (
              <> · {invoice.periodStart} → {invoice.periodEnd}</>
            ) : null}
            {detail.overdue ? (
              <span className="text-rose-600"> · {detail.daysOverdue} days overdue</span>
            ) : null}
          </>
        }
        actions={
          isStaff ? (
            <>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 size-4" /> Print
              </Button>
              {detail.canConfirm ? (
                <Button disabled={busy} onClick={() => run(() => confirm({ id: invoice._id }))}>
                  <CheckCircle2 className="mr-1.5 size-4" /> Confirm invoice
                </Button>
              ) : null}
              {detail.canPay ? (
                <Button disabled={busy} onClick={() => setPayOpen(true)}>
                  <CreditCard className="mr-1.5 size-4" /> Record payment
                </Button>
              ) : null}
              {detail.canCancel ? (
                <Button
                  variant="outline"
                  className="text-rose-600 hover:text-rose-700"
                  disabled={busy}
                  onClick={() => run(() => cancel({ id: invoice._id }))}
                >
                  <Ban className="mr-1.5 size-4" /> Cancel
                </Button>
              ) : null}
            </>
          ) : (
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="mr-1.5 size-4" /> Download
            </Button>
          )
        }
      />

      <ErrorNote message={error} />

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <SectionCard title="Lines">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Unit</th>
                <th className="pb-2 text-right font-medium">Discount</th>
                <th className="pb-2 text-right font-medium">Tax</th>
                <th className="pb-2 text-right font-medium">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {lines.map((line) => (
                <tr key={String(line._id)}>
                  <td className="py-2.5 pr-3">
                    {line.description}
                    {line.taxes.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {line.taxes
                          .map(
                            (tax) =>
                              `${tax.name}${tax.rateBps ? ` ${tax.rateBps / 100}%` : ""}`,
                          )
                          .join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatINR(line.unitPrice)}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                    {line.discountAmount ? `−${formatINR(line.discountAmount)}` : "—"}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">
                    {formatINR(line.taxAmount)}
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
              <Money paise={invoice.subtotal} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums text-brand-strong">
                −{formatINR(invoice.discountTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <Money paise={invoice.taxTotal} />
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <span>Total</span>
              <Money paise={invoice.total} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Paid</span>
              <Money paise={invoice.amountPaid} />
            </div>
            <div className="flex justify-between font-medium">
              <span>Amount due</span>
              <Money paise={invoice.amountDue} className={invoice.amountDue > 0 ? "text-rose-600" : "text-emerald-600"} />
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Invoice facts">
            <dl className="space-y-2.5 text-sm">
              {[
                ["Customer", customer?.name ?? invoice.customerSnapshot.name],
                ["Email", invoice.customerSnapshot.email],
                ["Subscription", subscription?.number ?? "—"],
                ["Issued", invoice.issueDate],
                ["Due", invoice.dueDate],
                [
                  "Payment terms",
                  subscription?.paymentTermId ? "As per subscription" : "Immediate",
                ],
                ["Created", new Date(invoice.createdAt).toLocaleString("en-IN")],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <SectionCard
            title="Payments"
            description={`${payments.length} recorded`}
          >
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments yet against this invoice.
              </p>
            ) : (
              <ul className="divide-y divide-border/70 text-sm">
                {payments.map((payment) => (
                  <li key={String(payment._id)} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{formatINR(payment.amount)}</span>
                      <span className="text-xs text-muted-foreground">{payment.paidOn}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {METHODS.find((m) => m.value === payment.method)?.label ??
                        payment.method}
                      {payment.reference ? ` · ${payment.reference}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        amountDue={invoice.amountDue}
        invoiceId={invoice._id}
        today={today}
        busy={busy}
        onSubmit={async (values) => {
          setBusy(true);
          setError(null);
          try {
            await recordPayment({
              invoiceId,
              method: values.method,
              amount: values.amount,
              paidOn: values.paidOn,
              reference: values.reference || undefined,
            });
            setPayOpen(false);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Payment could not be recorded.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  amountDue,
  invoiceId,
  today,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountDue: number;
  invoiceId: Id<"invoices">;
  today: string;
  busy: boolean;
  onSubmit: (values: {
    method: string;
    amount: string;
    paidOn: string;
    reference: string;
  }) => Promise<void>;
}) {
  const [method, setMethod] = useState<string>("UPI");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Balance due {formatINR(amountDue)}. Overpayment is rejected; partial
            payments are allowed and the invoice flips to Paid when the balance
            hits zero.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onSubmit({
              method,
              amount: String(data.get("amount") ?? ""),
              paidOn: String(data.get("paidOn") ?? today),
              reference: String(data.get("reference") ?? ""),
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount (₹)</Label>
              <Input
                id="pay-amount"
                name="amount"
                inputMode="decimal"
                defaultValue={paiseToRupees(amountDue).toFixed(2)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Paid on</Label>
              <Input id="pay-date" name="paidOn" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Method" />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference (optional)</Label>
              <Input id="pay-ref" name="reference" placeholder="UTR / UPI id" />
            </div>
          </div>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
