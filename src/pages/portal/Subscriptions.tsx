import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Layers } from "lucide-react";
import {
  EmptyState,
  LoadingBlock,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "@/components/Bits";
import { formatINR } from "@/shared/money";

export default function PortalSubscriptions() {
  const subscriptions = useQuery(api.portal.subscriptions);

  if (!subscriptions) return <LoadingBlock label="Loading your subscriptions…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Subscriptions"
        description="View your active billing plans, renewal timelines, and included package services."
      />

      {subscriptions.length === 0 ? (
        <EmptyState
          title="No active subscriptions"
          description="You don't have any subscriptions linked to your account yet. Contact your account manager to activate a plan."
          icon={<Layers className="size-8 text-muted-foreground" />}
        />
      ) : (
        <div className="space-y-4">
          {subscriptions.map((sub) => (
            <SectionCard
              key={sub._id}
              title={
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-foreground">{sub.planName}</span>
                  <StatusBadge status={sub.status} />
                </div>
              }
              description={`Ref: ${sub.number} · Billed ${sub.planPeriod.toLowerCase()}`}
              actions={
                <div className="text-right">
                  <span className="text-sm font-bold text-foreground">
                    {formatINR(sub.planPrice)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    /{sub.planPeriod === "MONTHLY" ? "mo" : sub.planPeriod.toLowerCase()}
                  </span>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-3 border-b border-border/60 pb-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Start Date:</span>{" "}
                  <span className="font-medium text-foreground">{sub.startDate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Renews / Next Invoice:</span>{" "}
                  <span className="font-medium text-foreground">
                    {sub.nextInvoiceDate ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valid Through:</span>{" "}
                  <span className="font-medium text-foreground">{sub.expiryDate}</span>
                </div>
              </div>

              {sub.lines.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Included Services & Line Items
                  </p>
                  <ul className="divide-y divide-border/40 text-sm">
                    {sub.lines.map((line, idx) => (
                      <li key={idx} className="flex justify-between py-1.5">
                        <span className="text-foreground">
                          {line.description} × {line.quantity}
                        </span>
                        <span className="font-medium text-muted-foreground">
                          {formatINR(line.unitPrice * line.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}
