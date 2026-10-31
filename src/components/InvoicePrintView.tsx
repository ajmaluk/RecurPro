import React from "react";
import { formatINR, amountInWords } from "@/shared/money";
import { Printer, Share2, ArrowLeft, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";

export interface InvoicePrintViewProps {
  invoice: {
    _id: string;
    number?: string | null;
    status: string;
    issueDate: string;
    dueDate: string;
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    total: number;
    amountDue: number;
    amountPaid?: number;
    currency?: string;
    periodStart?: string;
    periodEnd?: string;
    notes?: string | null;
    customerSnapshot?: {
      name: string;
      email?: string;
      billingAddress?: string;
      taxId?: string;
    };
  };
  lines: Array<{
    _id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    discountAmount?: number;
    taxAmount?: number;
    lineTotal: number;
    taxes?: Array<{ name: string; rateBps?: number }>;
  }>;
  payments?: Array<{
    _id: string;
    amount: number;
    paidOn?: string;
    recordedAt?: string;
    method: string;
    reference?: string;
  }>;
  subscription?: {
    _id: string;
    number: string;
  } | null;
  customer?: {
    _id: string;
    name: string;
    email: string;
  } | null;
  onBack?: () => void;
  onShare?: () => void;
}

export function InvoicePrintView({
  invoice,
  lines,
  payments = [],
  subscription,
  customer,
  onBack,
  onShare,
}: InvoicePrintViewProps) {
  const isPaid = invoice.status.toUpperCase() === "PAID" || invoice.amountDue === 0;
  const isOverdue = invoice.status.toUpperCase() === "OVERDUE";
  const customerName = invoice.customerSnapshot?.name || customer?.name || "Customer";
  const customerEmail = invoice.customerSnapshot?.email || customer?.email || "billing@example.com";
  const billingAddress = invoice.customerSnapshot?.billingAddress || "Maharashtra, India";
  const taxId = invoice.customerSnapshot?.taxId || "27AAACA1234A1Z5";

  const halfTax = Math.round(invoice.taxTotal / 2);

  return (
    <div className="printable-document w-full">
      {/* Top action bar - HIDDEN IN PRINT */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="size-4" /> Back
            </Button>
          )}
          <span className="text-sm font-semibold text-foreground">
            Invoice {invoice.number || "Statement"}
          </span>
          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
            {invoice.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onShare && (
            <Button variant="outline" size="sm" onClick={onShare} className="gap-1.5">
              <Share2 className="size-4" /> Share
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand-strong"
          >
            <Printer className="size-4" /> Print / Save PDF
          </Button>
        </div>
      </div>

      {/* Actual A4 Printable Sheet */}
      <div
        id="printable-invoice"
        className="mx-auto max-w-4xl rounded-xl border border-border bg-white p-8 text-neutral-900 shadow-sm print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none"
      >
        {/* Header: Company & Tax Invoice Badge */}
        <div className="flex flex-col justify-between gap-6 border-b border-neutral-300 pb-6 sm:flex-row sm:items-start">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <Logo className="size-8 text-teal-600 print:text-black" />
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  RecurPro Technologies Pvt. Ltd.
                </h1>
                <p className="text-xs text-neutral-500">
                  Cloud Subscription & Recurring Billing Platform
                </p>
              </div>
            </div>
            <div className="pt-2 text-xs leading-relaxed text-neutral-600">
              <p>CIN: U72900PN2023PTC123456 · GSTIN: <strong>27AABCB1515L1Z2</strong></p>
              <p>Suite 402, Embassy TechZone, Hinjawadi Phase 2, Pune 411057, MH, India</p>
              <p>Email: billing@recurpro.io · Web: https://recurpro.io</p>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="inline-block rounded border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-neutral-700">
              TAX INVOICE
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <p className="text-sm font-bold text-neutral-900">
                {invoice.number || "INV-DRAFT"}
              </p>
              <p className="text-neutral-600">
                Date: <strong className="text-neutral-800">{invoice.issueDate}</strong>
              </p>
              <p className="text-neutral-600">
                Due Date: <strong className="text-neutral-800">{invoice.dueDate}</strong>
              </p>
              {subscription?.number && (
                <p className="text-neutral-600">
                  Subscription: <strong className="text-neutral-800">{subscription.number}</strong>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Customer & State of Supply Grid */}
        <div className="my-6 grid grid-cols-1 gap-6 border-b border-neutral-300 pb-6 sm:grid-cols-2">
          <div className="space-y-1 text-xs">
            <p className="font-semibold uppercase tracking-wider text-neutral-500">Billed To (Customer):</p>
            <p className="text-sm font-bold text-neutral-900">{customerName}</p>
            <p className="text-neutral-600">{billingAddress}</p>
            <p className="text-neutral-600">
              GSTIN / Tax ID: <strong>{taxId}</strong>
            </p>
            <p className="text-neutral-600">Contact: {customerEmail}</p>
          </div>

          <div className="flex flex-col justify-between sm:items-end sm:text-right text-xs">
            <div className="space-y-1">
              <p className="font-semibold uppercase tracking-wider text-neutral-500">Invoice Details:</p>
              <p className="text-neutral-600">Place of Supply: <strong>Maharashtra (27)</strong></p>
              <p className="text-neutral-600">Reverse Charge: <strong>No</strong></p>
              {invoice.periodStart && invoice.periodEnd && (
                <p className="text-neutral-600">
                  Billing Period: <strong>{invoice.periodStart}</strong> to <strong>{invoice.periodEnd}</strong>
                </p>
              )}
            </div>

            {/* Rubber Stamp Status Overlay */}
            <div className="mt-4">
              {isPaid ? (
                <div className="inline-flex items-center gap-1.5 rounded border-2 border-emerald-600 bg-emerald-50 px-3 py-1 font-bold tracking-wider text-emerald-700">
                  <CheckCircle2 className="size-4" /> PAID
                </div>
              ) : isOverdue ? (
                <div className="inline-flex items-center rounded border-2 border-rose-600 bg-rose-50 px-3 py-1 font-bold tracking-wider text-rose-700">
                  OVERDUE
                </div>
              ) : (
                <div className="inline-flex items-center rounded border-2 border-teal-600 bg-teal-50 px-3 py-1 font-bold tracking-wider text-teal-800">
                  {invoice.status}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="my-6 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b-2 border-neutral-800 bg-neutral-100 text-neutral-800 font-semibold">
                <th className="py-2.5 pl-2">#</th>
                <th className="py-2.5">Item & Description</th>
                <th className="py-2.5 text-center">HSN/SAC</th>
                <th className="py-2.5 text-center">Qty</th>
                <th className="py-2.5 text-right">Unit Price</th>
                {invoice.discountTotal > 0 && <th className="py-2.5 text-right">Discount</th>}
                <th className="py-2.5 text-right">Tax (18%)</th>
                <th className="py-2.5 pr-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {lines.map((item, idx) => (
                <tr key={item._id} className="text-neutral-800">
                  <td className="py-2.5 pl-2 font-medium">{idx + 1}</td>
                  <td className="py-2.5 pr-4 font-medium text-neutral-900">
                    <div>{item.description}</div>
                    <span className="text-[10px] text-neutral-500">Subscription recurring fee</span>
                  </td>
                  <td className="py-2.5 text-center text-neutral-600">998313</td>
                  <td className="py-2.5 text-center tabular-nums">{item.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums">{formatINR(item.unitPrice)}</td>
                  {invoice.discountTotal > 0 && (
                    <td className="py-2.5 text-right tabular-nums text-neutral-600">
                      {item.discountAmount ? `-${formatINR(item.discountAmount)}` : "—"}
                    </td>
                  )}
                  <td className="py-2.5 text-right tabular-nums text-neutral-600">
                    {formatINR(item.taxAmount || 0)}
                  </td>
                  <td className="py-2.5 pr-2 text-right font-semibold tabular-nums text-neutral-900">
                    {formatINR(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary & Amount in Words */}
        <div className="my-6 grid grid-cols-1 gap-6 border-t-2 border-neutral-800 pt-4 sm:grid-cols-2">
          {/* Amount in words & Bank info */}
          <div className="space-y-4 text-xs">
            <div>
              <p className="font-semibold uppercase text-neutral-500">Amount in Words:</p>
              <p className="mt-1 font-semibold italic text-neutral-900">
                {amountInWords(invoice.total)}
              </p>
            </div>

            <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-700">
              <p className="font-bold text-neutral-900">Bank & Remittance Details:</p>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span>Beneficiary:</span>
                <span className="font-medium text-neutral-900">RecurPro Technologies Pvt Ltd</span>
                <span>Bank:</span>
                <span className="font-medium text-neutral-900">HDFC Bank Ltd</span>
                <span>Account No:</span>
                <span className="font-medium text-neutral-900">50200098765432</span>
                <span>IFSC Code:</span>
                <span className="font-medium text-neutral-900">HDFC0000123</span>
                <span>UPI ID:</span>
                <span className="font-medium text-neutral-900">recurpro@hdfcbank</span>
              </div>
            </div>
          </div>

          {/* Numerical breakdown */}
          <div className="space-y-1.5 text-xs text-neutral-700">
            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span>Subtotal</span>
              <span className="font-medium text-neutral-900 tabular-nums">
                {formatINR(invoice.subtotal)}
              </span>
            </div>

            {invoice.discountTotal > 0 && (
              <div className="flex justify-between py-1 border-b border-neutral-200 text-emerald-700">
                <span>Total Discount</span>
                <span className="font-medium tabular-nums">
                  -{formatINR(invoice.discountTotal)}
                </span>
              </div>
            )}

            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span>CGST (9%)</span>
              <span className="font-medium text-neutral-900 tabular-nums">
                {formatINR(halfTax)}
              </span>
            </div>

            <div className="flex justify-between py-1 border-b border-neutral-200">
              <span>SGST (9%)</span>
              <span className="font-medium text-neutral-900 tabular-nums">
                {formatINR(invoice.taxTotal - halfTax)}
              </span>
            </div>

            <div className="flex justify-between border-b-2 border-neutral-800 py-2 text-sm font-bold text-neutral-900">
              <span>Grand Total</span>
              <span className="tabular-nums">{formatINR(invoice.total)}</span>
            </div>

            <div className="flex justify-between py-1 text-neutral-600">
              <span>Amount Paid</span>
              <span className="font-medium tabular-nums">{formatINR(invoice.total - invoice.amountDue)}</span>
            </div>

            <div className="flex justify-between py-1 text-sm font-bold text-neutral-900">
              <span>Balance Due</span>
              <span className={invoice.amountDue > 0 ? "text-rose-600 tabular-nums" : "text-emerald-700 tabular-nums"}>
                {formatINR(invoice.amountDue)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment history list if recorded */}
        {payments.length > 0 && (
          <div className="my-4 border-t border-neutral-200 pt-3 text-xs">
            <p className="font-semibold text-neutral-800 mb-1.5">Payment Transactions Recorded:</p>
            <div className="space-y-1 text-neutral-600">
              {payments.map((p) => (
                <div key={p._id} className="flex justify-between bg-neutral-50 px-2.5 py-1.5 rounded">
                  <span>
                    {p.paidOn || p.recordedAt?.slice(0, 10)} · {p.method} {p.reference ? `(${p.reference})` : ""}
                  </span>
                  <span className="font-semibold text-emerald-700">{formatINR(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Terms & Authorized Signatory */}
        <div className="mt-8 flex flex-col justify-between gap-6 border-t border-neutral-300 pt-4 text-[10px] text-neutral-500 sm:flex-row sm:items-end">
          <div className="max-w-md space-y-1">
            <p className="font-semibold uppercase tracking-wider text-neutral-700">Terms & Conditions:</p>
            <p>1. Payment is strictly due by the specified due date.</p>
            <p>2. Please quote invoice number when remitting payments via NEFT/RTGS/UPI.</p>
            <p>3. This is a computer-generated tax invoice and requires no physical signature.</p>
          </div>

          <div className="text-center sm:text-right">
            <div className="mb-2 font-medium text-neutral-800">
              For RecurPro Technologies Pvt. Ltd.
            </div>
            <div className="inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-600">
              <ShieldCheck className="size-4 text-emerald-600" />
              <span className="text-[10px] font-semibold tracking-wide">DIGITALLY SIGNED</span>
            </div>
            <p className="mt-1 text-[9px] text-neutral-400">Authorized Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
