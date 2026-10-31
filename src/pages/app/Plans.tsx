import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Percent, Plus, Receipt, ScrollText, Tags } from "lucide-react";
import {
  ErrorNote,
  Field,
  LoadingBlock,
  Money,
  PageHeader,
  SectionCard,
} from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/shared/money";
import { BILLING_PERIOD_LABELS } from "@/shared/enums";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@/shared/enums";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "plans", label: "Plans", icon: <Tags className="size-3.5" /> },
  { key: "templates", label: "Quotation templates", icon: <ScrollText className="size-3.5" /> },
  { key: "discounts", label: "Discounts", icon: <Percent className="size-3.5" /> },
  { key: "taxes", label: "Taxes", icon: <Receipt className="size-3.5" /> },
  { key: "terms", label: "Payment terms", icon: <Receipt className="size-3.5" /> },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Plans() {
  const [tab, setTab] = useState<TabKey>("plans");
  const plans = useQuery(api.plans.list);
  const templates = useQuery(api.templates.list);
  const discounts = useQuery(api.pricing.listDiscounts);
  const taxes = useQuery(api.pricing.listTaxes);
  const terms = useQuery(api.plans.paymentTerms);

  const [planOpen, setPlanOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [taxOpen, setTaxOpen] = useState(false);

  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plans & pricing"
        description="Recurring plans, quotation templates, discounts and taxes. Admins manage all four; staff can use them everywhere."
        actions={
          isAdmin ? (
            <>
              {tab === "plans" ? (
                <Button onClick={() => setPlanOpen(true)}>
                  <Plus className="mr-1.5 size-4" /> New plan
                </Button>
              ) : null}
              {tab === "templates" ? (
                <Button onClick={() => setTemplateOpen(true)}>
                  <Plus className="mr-1.5 size-4" /> New template
                </Button>
              ) : null}
              {tab === "discounts" ? (
                <Button onClick={() => setDiscountOpen(true)}>
                  <Plus className="mr-1.5 size-4" /> New discount
                </Button>
              ) : null}
              {tab === "taxes" ? (
                <Button onClick={() => setTaxOpen(true)}>
                  <Plus className="mr-1.5 size-4" /> New tax
                </Button>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              Only admins can change plans, taxes and discounts.
            </span>
          )
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm",
              tab === entry.key
                ? "border-brand bg-brand-soft text-brand-strong"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {entry.icon}
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "plans" ? (
        <SectionCard title="Plans" description="All four billing periods are supported">
          {!plans ? (
            <LoadingBlock />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Period</th>
                    <th className="pb-2 text-right font-medium">Price</th>
                    <th className="pb-2 text-right font-medium">Min qty</th>
                    <th className="pb-2 font-medium">Behaviour</th>
                    <th className="pb-2 font-medium">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {plans.map((plan) => (
                    <tr key={String(plan._id)}>
                      <td className="py-2.5 font-medium">{plan.name}</td>
                      <td className="py-2.5">
                        {BILLING_PERIOD_LABELS[plan.billingPeriod]}
                      </td>
                      <td className="py-2.5 text-right">
                        <Money paise={plan.price} />
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{plan.minQuantity}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {[
                          plan.pausable ? "pausable" : null,
                          plan.closable ? "closable" : null,
                          plan.renewable ? "renewable" : null,
                          plan.autoCloseOnEnd ? "auto-closes at expiry" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "fixed term"}
                      </td>
                      <td className="py-2.5">
                        <Badge variant={plan.isActive ? "secondary" : "outline"}>
                          {plan.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "templates" ? (
        <SectionCard
          title="Quotation templates"
          description="Each template carries a plan, its lines and a validity window"
        >
          {!templates ? (
            <LoadingBlock />
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No templates yet.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {templates.map((template) => (
                <li key={String(template._id)} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{template.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {template.planName} · {template.lineCount} line(s) · valid{" "}
                      {template.validityDays} days
                    </p>
                  </div>
                  <Badge variant={template.isActive ? "secondary" : "outline"}>
                    {template.isActive ? "Active" : "Inactive"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}

      {tab === "discounts" ? (
        <SectionCard title="Discounts" description="Attached per subscription or picked automatically">
          {!discounts ? (
            <LoadingBlock />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2 font-medium">Rules</th>
                    <th className="pb-2 text-right font-medium">Used</th>
                    <th className="pb-2 font-medium">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {discounts.map((discount) => (
                    <tr key={String(discount._id)}>
                      <td className="py-2.5 font-medium">{discount.name}</td>
                      <td className="py-2.5">
                        {discount.type === "PERCENTAGE"
                          ? `${discount.value / 100}%`
                          : formatINR(discount.value)}
                      </td>
                      <td className="py-2.5 text-xs text-muted-foreground">
                        {[
                          discount.minPurchase
                            ? `min ${formatINR(discount.minPurchase)}`
                            : null,
                          discount.minQuantity ? `min qty ${discount.minQuantity}` : null,
                          discount.startDate ? `from ${discount.startDate}` : null,
                          discount.endDate ? `to ${discount.endDate}` : null,
                          discount.usageLimit ? `limit ${discount.usageLimit}` : null,
                          discount.perCustomerLimit
                            ? `${discount.perCustomerLimit}/customer`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "no restrictions"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{discount.usedCount}</td>
                      <td className="py-2.5">
                        <Badge variant={discount.isActive ? "secondary" : "outline"}>
                          {discount.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "taxes" ? (
        <SectionCard title="Taxes" description="Percent (basis points) or fixed, inclusive or exclusive">
          {!taxes ? (
            <LoadingBlock />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Value</th>
                    <th className="pb-2 font-medium">Treatment</th>
                    <th className="pb-2 font-medium">State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {taxes.map((tax) => (
                    <tr key={String(tax._id)}>
                      <td className="py-2.5 font-medium">{tax.name}</td>
                      <td className="py-2.5">{tax.type}</td>
                      <td className="py-2.5">
                        {tax.type === "PERCENT" ? `${tax.value / 100}%` : formatINR(tax.value)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {tax.isInclusive ? "Inclusive (in price)" : "Exclusive (added)"}
                      </td>
                      <td className="py-2.5">
                        <Badge variant={tax.isActive ? "secondary" : "outline"}>
                          {tax.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}

      {tab === "terms" ? (
        <SectionCard title="Payment terms" description="Used for invoice due dates">
          {!terms ? (
            <LoadingBlock />
          ) : (
            <ul className="divide-y divide-border/70">
              {terms.map((term) => (
                <li key={String(term._id)} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">{term.name}</span>
                  <span className="text-muted-foreground">Due in {term.dueDays} days</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ) : null}

      {isAdmin ? (
        <>
          <PlanDialog open={planOpen} onOpenChange={setPlanOpen} />
          <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen} />
          <DiscountDialog open={discountOpen} onOpenChange={setDiscountOpen} />
          <TaxDialog open={taxOpen} onOpenChange={setTaxOpen} />
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------- dialogs ---------------------------- */

function PlanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createPlan = useMutation(api.plans.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState("MONTHLY");
  const [flags, setFlags] = useState({
    pausable: true,
    closable: true,
    renewable: true,
    autoCloseOnEnd: false,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>Price is per billing period, in rupees.</DialogDescription>
        </DialogHeader>
        <ErrorNote message={error} />
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const data = new FormData(event.currentTarget);
            try {
              await createPlan({
                name: String(data.get("name") ?? ""),
                price: String(data.get("price") ?? ""),
                billingPeriod: period,
                minQuantity: Number(data.get("minQuantity") ?? 1) || 1,
                autoCloseOnEnd: flags.autoCloseOnEnd,
                closable: flags.closable,
                pausable: flags.pausable,
                renewable: flags.renewable,
                isActive: true,
              });
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the plan.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan name" required>
              <Input name="name" placeholder="Monthly Standard" required disabled={busy} />
            </Field>
            <Field label="Price per period (₹)" required>
              <Input name="price" inputMode="decimal" placeholder="1499" required disabled={busy} />
            </Field>
            <Field label="Billing period" required>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {BILLING_PERIOD_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Minimum quantity">
              <Input name="minQuantity" type="number" min={1} defaultValue={1} disabled={busy} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {([
              { key: "pausable", label: "Can be paused" },
              { key: "closable", label: "Can be closed early" },
              { key: "renewable", label: "Can be renewed" },
              { key: "autoCloseOnEnd", label: "Auto-closes at expiry" },
            ] as const).map((flag) => (
              <label key={flag.key} className="flex items-center gap-2">
                <Checkbox
                  checked={flags[flag.key]}
                  onCheckedChange={(value) =>
                    setFlags((current) => ({ ...current, [flag.key]: value === true }))
                  }
                />
                {flag.label}
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const plans = useQuery(api.plans.list);
  const products = useQuery(api.catalog.productOptions);
  const createTemplate = useMutation(api.templates.create);
  const [planId, setPlanId] = useState("");
  const [lines, setLines] = useState<{ productId: string; variantId: string; quantity: number }[]>([
    { productId: "", variantId: "", quantity: 1 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New quotation template</DialogTitle>
          <DialogDescription>
            The template brings its plan and line items into every new subscription.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote message={error} />
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const data = new FormData(event.currentTarget);
            try {
              await createTemplate({
                name: String(data.get("name") ?? ""),
                validityDays: Number(data.get("validityDays") ?? 15) || 15,
                planId: planId as Id<"plans">,
                isActive: true,
                lines: lines
                  .filter((line) => line.productId)
                  .map((line) => ({
                    productId: line.productId as Id<"products">,
                    variantId: line.variantId,
                    quantity: line.quantity,
                  })),
              });
              setLines([{ productId: "", variantId: "", quantity: 1 }]);
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the template.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Template name" required>
              <Input name="name" placeholder="Standard Monthly Retainer" required disabled={busy} />
            </Field>
            <Field label="Plan" required>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  {(plans ?? []).filter((plan) => plan.isActive).map((plan) => (
                    <SelectItem key={String(plan._id)} value={String(plan._id)}>
                      {plan.name} · {BILLING_PERIOD_LABELS[plan.billingPeriod]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quotation validity (days)">
              <Input name="validityDays" type="number" min={1} defaultValue={15} disabled={busy} />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Lines</p>
            {lines.map((line, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_5rem_2rem] items-center gap-2">
                <Select
                  value={line.productId}
                  onValueChange={(value) =>
                    setLines((current) =>
                      current.map((row, i) =>
                        i === index ? { ...row, productId: value, variantId: "" } : row,
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(products ?? []).map((product) => (
                      <SelectItem key={String(product._id)} value={String(product._id)}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={line.variantId}
                  onValueChange={(value) =>
                    setLines((current) =>
                      current.map((row, i) => (i === index ? { ...row, variantId: value } : row)),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Variant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Base product</SelectItem>
                    {(products ?? [])
                      .find((product) => String(product._id) === line.productId)
                      ?.variants.map((variant) => (
                        <SelectItem key={String(variant._id)} value={String(variant._id)}>
                          {variant.name} · {formatINR(variant.effectivePrice)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  min={1}
                  className="text-right"
                  value={line.quantity}
                  disabled={busy}
                  onChange={(event) =>
                    setLines((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, quantity: Math.max(1, Number(event.target.value) || 1) }
                          : row,
                      ),
                    )
                  }
                />

                <Button
                  type="button"
                  variant="ghost"
                  disabled={lines.length === 1 || busy}
                  onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  aria-label="Remove line"
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLines((current) => [...current, { productId: "", variantId: "", quantity: 1 }])
              }
            >
              <Plus className="mr-1.5 size-3.5" /> Add line
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !planId}>
              {busy ? "Creating…" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DiscountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const createDiscount = useMutation(api.pricing.createDiscount);
  const [type, setType] = useState("PERCENTAGE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New discount</DialogTitle>
          <DialogDescription>
            Percentage values are stored in basis points (10% = 1000). Fixed values are
            rupees converted to paise.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote message={error} />
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const data = new FormData(event.currentTarget);
            try {
              await createDiscount({
                name: String(data.get("name") ?? ""),
                type,
                value: String(data.get("value") ?? ""),
                minPurchase: String(data.get("minPurchase") ?? "") || undefined,
                minQuantity: String(data.get("minQuantity") ?? "") || undefined,
                startDate: String(data.get("startDate") ?? "") || undefined,
                endDate: String(data.get("endDate") ?? "") || undefined,
                usageLimit: String(data.get("usageLimit") ?? "") || undefined,
                perCustomerLimit: String(data.get("perCustomerLimit") ?? "") || undefined,
                appliesTo: String(data.get("appliesTo") ?? "SUBSCRIPTION"),
                productIds: [],
                isActive: true,
              });
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the discount.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input name="name" placeholder="Monsoon 10%" required disabled={busy} />
            </Field>
            <Field label="Type" required>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={type === "PERCENTAGE" ? "Percent" : "Amount (₹)"} required>
              <Input name="value" inputMode="decimal" placeholder={type === "PERCENTAGE" ? "10" : "500"} required disabled={busy} />
            </Field>
            <Field label="Minimum purchase (₹)">
              <Input name="minPurchase" inputMode="decimal" disabled={busy} />
            </Field>
            <Field label="Minimum quantity">
              <Input name="minQuantity" type="number" min={1} disabled={busy} />
            </Field>
            <Field label="Usage limit">
              <Input name="usageLimit" type="number" min={1} disabled={busy} />
            </Field>
            <Field label="Per-customer limit">
              <Input name="perCustomerLimit" type="number" min={1} disabled={busy} />
            </Field>
            <Field label="Applies to" hint="Subscription-wide in v1">
              <Select defaultValue="SUBSCRIPTION">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SUBSCRIPTION">Whole subscription</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Start date">
              <Input name="startDate" type="date" disabled={busy} />
            </Field>
            <Field label="End date">
              <Input name="endDate" type="date" disabled={busy} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create discount"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaxDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createTax = useMutation(api.pricing.createTax);
  const [type, setType] = useState("PERCENT");
  const [inclusive, setInclusive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New tax</DialogTitle>
          <DialogDescription>
            Percentage taxes are stored in basis points; fixed taxes in paise.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote message={error} />
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const data = new FormData(event.currentTarget);
            try {
              await createTax({
                name: String(data.get("name") ?? ""),
                type,
                value: String(data.get("value") ?? ""),
                isInclusive: inclusive,
                isActive: true,
              });
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the tax.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input name="name" placeholder="GST 18%" required disabled={busy} />
            </Field>
            <Field label="Type" required>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">Percentage</SelectItem>
                  <SelectItem value="FIXED">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={type === "PERCENT" ? "Rate (%)" : "Amount (₹)"} required>
              <Input name="value" inputMode="decimal" placeholder={type === "PERCENT" ? "18" : "99"} required disabled={busy} />
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <Checkbox checked={inclusive} onCheckedChange={(value) => setInclusive(value === true)} />
              Price includes this tax
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create tax"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
