import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Link, useParams } from "react-router";
import {
  Receipt,
  ArrowLeft,
  CheckCircle2,
  Printer,
  Share2,
  FileText,
} from "lucide-react";
import { InvoicePrintView } from "@/components/InvoicePrintView";
import { InvoiceShareDialog } from "@/components/InvoiceShareDialog";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/Bits";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR } from "@/shared/money";

export default function PortalInvoices() {
  const [quickPrintId, setQuickPrintId] = useState<Id<"invoices"> | null>(null);
  const [quickShareInvoice, setQuickShareInvoice] = useState<any | null>(null);

  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.portal.invoices,
    {},
    { initialNumItems: 25 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices & Statements"
        description="All your past and outstanding invoices with payment records."
      />

      {isLoading && results.length === 0 ? (
        <LoadingBlock label="Loading invoices…" />
      ) : results.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description="You do not have any invoices on record."
          icon={<Receipt className="size-8 text-muted-foreground" />}
        />
      ) : (
        <SectionCard title="Billing History" description="Statements sorted by issue date">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-xs font-medium text-muted-foreground">
                  <th className="pb-3">Invoice</th>
                  <th className="pb-3">Issue Date</th>
                  <th className="pb-3">Due Date</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Amount Due</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {results.map((inv) => (
                  <tr key={inv._id} className="hover:bg-muted/30">
                    <td className="py-3 font-medium">
                      <Link
                        to={`/portal/invoices/${inv._id}`}
                        className="font-semibold text-brand hover:underline"
                      >
                        {inv.number}
                      </Link>
                    </td>
                    <td className="py-3 text-muted-foreground">{inv.issueDate}</td>
                    <td className="py-3 text-muted-foreground">{inv.dueDate}</td>
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
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-brand/60"
                          onClick={() => setQuickPrintId(inv._id as Id<"invoices">)}
                          title="Print or Save PDF"
                        >
                          <Printer className="size-3.5 text-brand" />
                          <span className="hidden md:inline">Print / PDF</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:border-teal-600/60"
                          onClick={() =>
                            setQuickShareInvoice({
                              _id: String(inv._id),
                              number: inv.number,
                              total: inv.total,
                              amountDue: inv.amountDue,
                              dueDate: inv.dueDate,
                              status: inv.status,
                              customerSnapshot: { name: "Customer" },
                            })
                          }
                          title="Share statement"
                        >
                          <Share2 className="size-3.5 text-teal-600" />
                          <span className="hidden md:inline">Share</span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                          <Link to={`/portal/invoices/${inv._id}`}>View</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{status === "LoadingMore" ? "Loading…" : `${results.length} shown`}</span>
            {status === "CanLoadMore" ? (
              <Button variant="outline" size="sm" onClick={() => loadMore(25)}>
                Load more
              </Button>
            ) : null}
          </div>
        </SectionCard>
      )}

      {quickPrintId && (
        <PortalQuickPrintModal
          invoiceId={quickPrintId}
          open={!!quickPrintId}
          onOpenChange={(open) => !open && setQuickPrintId(null)}
        />
      )}

      {quickShareInvoice && (
        <InvoiceShareDialog
          invoice={quickShareInvoice}
          open={!!quickShareInvoice}
          onOpenChange={(open) => !open && setQuickShareInvoice(null)}
        />
      )}
    </div>
  );
}

function PortalQuickPrintModal({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: Id<"invoices"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useQuery(api.portal.invoiceDetail, invoiceId ? { id: invoiceId } : "skip");
  const [shareOpen, setShareOpen] = useState(false);

  if (!invoiceId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="sr-only">
          <DialogTitle>Tax Statement Print Preview</DialogTitle>
          <DialogDescription>Print or save statement</DialogDescription>
        </DialogHeader>

        {!detail ? (
          <LoadingBlock label="Preparing statement document…" />
        ) : (
          <InvoicePrintView
            invoice={detail.invoice}
            lines={detail.lines}
            onBack={() => onOpenChange(false)}
            onShare={() => setShareOpen(true)}
          />
        )}

        {detail && (
          <InvoiceShareDialog
            open={shareOpen}
            onOpenChange={setShareOpen}
            invoice={detail.invoice}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PortalInvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const data = useQuery(api.portal.invoiceDetail, { id: id as Id<"invoices"> });
  const [shareOpen, setShareOpen] = useState(false);
  const [showPrintView, setShowPrintView] = useState(false);

  if (!data) return <LoadingBlock label="Loading invoice statement…" />;
  const { invoice, lines } = data;

  const handlePrint = () => {
    setShowPrintView(true);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            to="/portal/invoices"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" /> Back to invoices
          </Link>
        }
        title={`Invoice ${invoice.number ?? "—"}`}
        description={`Issued on ${invoice.issueDate} · Due by ${invoice.dueDate}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={invoice.status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPrintView((v) => !v)}
              className="gap-1.5"
            >
              <FileText className="size-3.5" />
              {showPrintView ? "Standard View" : "Invoice Document"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShareOpen(true)}
              className="gap-1.5"
            >
              <Share2 className="size-3.5" /> Share
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand-strong"
            >
              <Printer className="size-3.5" /> Print / PDF
            </Button>
          </div>
        }
      />

      {showPrintView ? (
        <InvoicePrintView
          invoice={invoice}
          lines={lines}
          onBack={() => setShowPrintView(false)}
          onShare={() => setShareOpen(true)}
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <SectionCard title="Line Items" description="Services and items included on this invoice">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border/70 text-xs font-medium text-muted-foreground">
                      <th className="pb-3">Description</th>
                      <th className="pb-3 text-center">Qty</th>
                      <th className="pb-3 text-right">Unit Price</th>
                      <th className="pb-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {lines.map((l) => (
                      <tr key={l._id}>
                        <td className="py-3 font-medium text-foreground">{l.description}</td>
                        <td className="py-3 text-center text-muted-foreground">{l.quantity}</td>
                        <td className="py-3 text-right text-muted-foreground">{formatINR(l.unitPrice)}</td>
                        <td className="py-3 text-right font-medium text-foreground">{formatINR(l.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 border-t border-border/80 pt-4 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatINR(invoice.subtotal)}</span>
                </div>
                {invoice.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                    <span>Discount</span>
                    <span>-{formatINR(invoice.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatINR(invoice.taxTotal)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold text-foreground">
                  <span>Total Amount</span>
                  <span>{formatINR(invoice.total)}</span>
                </div>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Payment Status">
              <div className="space-y-4">
                <div>
                  <span className="text-xs text-muted-foreground">Amount Due</span>
                  <p className="text-2xl font-bold text-foreground">
                    {formatINR(invoice.amountDue)}
                  </p>
                </div>

                {invoice.amountDue === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-5 shrink-0" />
                    <span>This invoice has been settled in full.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Please use the bank account or payment link provided by your billing administrator.
                    </p>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      <InvoiceShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        invoice={invoice}
      />
    </div>
  );
}
