import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/shared/money";
import { toast } from "sonner";
import { Check, Copy, Mail, MessageSquare, Share2 } from "lucide-react";

export interface InvoiceShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    _id: string;
    number?: string | null;
    total: number;
    amountDue?: number;
    dueDate: string;
    status: string;
    customerSnapshot?: {
      name: string;
    };
  };
}

export function InvoiceShareDialog({
  open,
  onOpenChange,
  invoice,
}: InvoiceShareDialogProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const invoiceNumber = invoice.number || "Invoice";
  const customerName = invoice.customerSnapshot?.name || "Customer";
  const totalFormatted = formatINR(invoice.total);
  const shareUrl = `${window.location.origin}/invoice/view/${invoice._id}`;

  const summaryText = `📄 ${invoiceNumber} from Brightloop
To: ${customerName}
Amount: ${totalFormatted}
Due Date: ${invoice.dueDate}
Status: ${invoice.status}

View & download statement:
${shareUrl}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      toast.success("Invoice link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Could not copy link to clipboard");
    }
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedSummary(true);
      toast.success("Invoice summary copied to clipboard!");
      setTimeout(() => setCopiedSummary(false), 2000);
    } catch {
      toast.error("Could not copy summary");
    }
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `Hello ${customerName}, here is your ${invoiceNumber} for ${totalFormatted} due by ${invoice.dueDate}.\n\nYou can view and pay online here: ${shareUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Invoice ${invoiceNumber} from Brightloop`);
    const body = encodeURIComponent(
      `Dear ${customerName},\n\nPlease find the details for invoice ${invoiceNumber} for the amount of ${totalFormatted}.\nDue date: ${invoice.dueDate}\nStatus: ${invoice.status}\n\nYou can view and download the complete statement here:\n${shareUrl}\n\nThank you,\nBrightloop Technologies`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoiceNumber}`,
          text: `Invoice ${invoiceNumber} for ${customerName} - ${totalFormatted}`,
          url: shareUrl,
        });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          toast.error("Share failed");
        }
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
            <Share2 className="size-5" />
          </div>
          <DialogTitle>Share {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Share this invoice statement with {customerName} or their finance department.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Direct link input */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Shareable Invoice Link
            </label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                readOnly
                value={shareUrl}
                className="bg-muted/50 font-mono text-xs select-all"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="shrink-0 gap-1.5"
              >
                {copiedLink ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                {copiedLink ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Quick share action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button
              variant="outline"
              className="gap-2 justify-start text-xs font-medium"
              onClick={handleWhatsApp}
            >
              <MessageSquare className="size-4 text-emerald-600" />
              Share on WhatsApp
            </Button>

            <Button
              variant="outline"
              className="gap-2 justify-start text-xs font-medium"
              onClick={handleEmail}
            >
              <Mail className="size-4 text-blue-600" />
              Send via Email
            </Button>
          </div>

          {/* Formatted summary copy */}
          <div className="rounded-lg border border-border/80 bg-muted/40 p-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-medium text-foreground">Message Summary</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopySummary}
                className="h-7 text-xs text-brand gap-1"
              >
                {copiedSummary ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copiedSummary ? "Copied" : "Copy text"}
              </Button>
            </div>
            <pre className="text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap font-sans">
              {summaryText}
            </pre>
          </div>

          {typeof navigator !== "undefined" && "share" in navigator && (
            <Button
              variant="default"
              className="w-full gap-2 bg-brand text-brand-foreground hover:bg-brand-strong"
              onClick={handleNativeShare}
            >
              <Share2 className="size-4" />
              Share via other apps…
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
