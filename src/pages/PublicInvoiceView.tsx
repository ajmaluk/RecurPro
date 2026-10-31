import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { InvoicePrintView } from "@/components/InvoicePrintView";
import { InvoiceShareDialog } from "@/components/InvoiceShareDialog";
import { LoadingBlock, EmptyState } from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { FileText, ArrowLeft, Lock } from "lucide-react";

export default function PublicInvoiceView() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = id as Id<"invoices">;
  const detail = useQuery(api.invoices.detail, invoiceId ? { id: invoiceId } : "skip");
  const [shareOpen, setShareOpen] = useState(false);

  if (!id) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <EmptyState
          title="Invalid Invoice Link"
          description="No invoice identifier was provided in the URL."
          icon={<FileText className="size-8 text-muted-foreground" />}
        />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <LoadingBlock label="Loading official tax invoice statement…" />
      </div>
    );
  }

  const { invoice, lines, payments, subscription, customer } = detail;

  return (
    <div className="min-h-screen bg-muted/20 py-8 px-4 sm:px-6 lg:px-8">
      {/* Top Banner with brand & portal login */}
      <div className="no-print mx-auto max-w-4xl mb-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <Link to="/" className="flex items-center gap-1.5 font-medium text-foreground hover:text-brand">
          <ArrowLeft className="size-3.5" /> Return to RecurPro
        </Link>
        <div className="flex items-center gap-2">
          <span>Official Customer Statement</span>
          <Button variant="outline" size="sm" asChild className="h-7 text-xs">
            <Link to="/portal/login">
              <Lock className="mr-1 size-3" /> Customer Portal
            </Link>
          </Button>
        </div>
      </div>

      <InvoicePrintView
        invoice={invoice}
        lines={lines}
        payments={payments}
        subscription={subscription}
        customer={customer}
        onShare={() => setShareOpen(true)}
      />

      <InvoiceShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        invoice={invoice}
      />
    </div>
  );
}
