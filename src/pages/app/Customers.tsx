import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Building2, Mail, MapPin, Phone, Plus, Search, ShieldCheck } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatINR } from "@/shared/money";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { results, status, loadMore, isLoading } = usePaginatedQuery(
    api.customers.list,
    { q: query || undefined },
    { numItems: 20 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Every account a subscription can hang off. Portal access links automatically on first sign-in with the same email."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 size-4" /> New customer
          </Button>
        }
      />

      <form
        className="relative w-full sm:w-80"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email or company"
          className="pl-9"
        />
      </form>

      <SectionCard>
        {isLoading && results.length === 0 ? (
          <LoadingBlock />
        ) : results.length === 0 ? (
          <EmptyState
            title="No customers yet"
            description="Add the first customer, then quote them from a template."
            action={
              <Button onClick={() => setOpen(true)}>New customer</Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Portal</th>
                  <th className="pb-2 text-right font-medium">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {results.map((customer) => (
                  <tr key={String(customer._id)} className="hover:bg-muted/50">
                    <td className="py-3">
                      <Link
                        to={`/app/customers/${customer._id}`}
                        className="font-medium hover:text-brand"
                      >
                        {customer.name}
                      </Link>
                      {customer.company ? (
                        <p className="text-xs text-muted-foreground">{customer.company}</p>
                      ) : null}
                    </td>
                    <td className="py-3 text-muted-foreground">{customer.company ?? "—"}</td>
                    <td className="py-3 text-muted-foreground">{customer.email}</td>
                    <td className="py-3">
                      {customer.userId ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand-strong">
                          <ShieldCheck className="size-3" /> Linked
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not yet</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <Link to={`/app/customers/${customer._id}`} className="hover:text-brand">
                        →
                      </Link>
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

      <CreateCustomerDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function CreateCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useMutation(api.customers.create);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            They can sign in to the portal with this email — the customer record
            links to their account on first sign-in.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote message={error} />
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            const data = new FormData(event.currentTarget);
            try {
              await create({
                name: String(data.get("name") ?? ""),
                email: String(data.get("email") ?? ""),
                phone: String(data.get("phone") ?? "") || undefined,
                company: String(data.get("company") ?? "") || undefined,
                taxId: String(data.get("taxId") ?? "") || undefined,
                addressLine: String(data.get("addressLine") ?? "") || undefined,
                city: String(data.get("city") ?? "") || undefined,
                state: String(data.get("state") ?? "") || undefined,
                pincode: String(data.get("pincode") ?? "") || undefined,
              });
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the customer.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Name" required>
            <Input name="name" placeholder="Ananya Sharma" required disabled={busy} />
          </Field>
          <Field label="Email" required>
            <Input name="email" type="email" placeholder="name@company.in" required disabled={busy} />
          </Field>
          <Field label="Company">
            <Input name="company" placeholder="Nebula Foods Pvt Ltd" disabled={busy} />
          </Field>
          <Field label="Phone">
            <Input name="phone" placeholder="+91 98450 11223" disabled={busy} />
          </Field>
          <Field label="GSTIN / Tax ID">
            <Input name="taxId" placeholder="29AABCN1234F1Z5" disabled={busy} />
          </Field>
          <Field label="Address line">
            <Input name="addressLine" placeholder="12 Residency Road" disabled={busy} />
          </Field>
          <Field label="City">
            <Input name="city" placeholder="Bengaluru" disabled={busy} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="State">
              <Input name="state" placeholder="Karnataka" disabled={busy} />
            </Field>
            <Field label="Pincode">
              <Input name="pincode" placeholder="560025" disabled={busy} />
            </Field>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = id as Id<"customers">;
  const detail = useQuery(api.customers.detail, { id: customerId });
  const subscriptions = usePaginatedQuery(
    api.subscriptions.list,
    { customerId },
    { numItems: 10 },
  );
  const invoices = usePaginatedQuery(
    api.invoices.list,
    { customerId },
    { numItems: 10 },
  );

  if (!detail) return <LoadingBlock label="Loading customer…" />;
  const { customer } = detail;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link to="/app/customers" className="hover:text-foreground">
            Customers
          </Link>
        }
        title={customer.name}
        description={customer.company ?? customer.email}
        actions={
          <Button asChild>
            <Link to="/app/subscriptions/new">New subscription</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card-layer p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Active subscriptions
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {detail.activeSubscriptions}
          </p>
        </div>
        <div className="card-layer p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Open invoices
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{detail.openInvoices}</p>
        </div>
        <div className="card-layer p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Outstanding
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            <Money paise={detail.outstanding} />
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <SectionCard title="Profile">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center gap-2.5">
              <Mail className="size-4 text-muted-foreground" />
              {customer.email}
            </li>
            <li className="flex items-center gap-2.5">
              <Building2 className="size-4 text-muted-foreground" />
              {customer.company ?? "No company"}
            </li>
            <li className="flex items-center gap-2.5">
              <Phone className="size-4 text-muted-foreground" />
              {customer.phone ?? "No phone"}
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                {customer.address?.line1 ?? "No address"}
                {customer.address?.city ? `, ${customer.address.city}` : ""}
                {customer.address?.state ? `, ${customer.address.state}` : ""}
                {customer.address?.pincode ? ` — ${customer.address.pincode}` : ""}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="size-4 text-muted-foreground" />
              {customer.userId ? "Portal account linked" : "No portal account yet"}
            </li>
          </ul>
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Subscriptions">
            {subscriptions.results.length === 0 ? (
              <EmptyState title="None yet" />
            ) : (
              <ul className="divide-y divide-border/70 text-sm">
                {subscriptions.results.map((row) => (
                  <li key={String(row._id)} className="flex items-center justify-between gap-3 py-2.5">
                    <Link to={`/app/subscriptions/${row._id}`} className="font-medium hover:text-brand">
                      {row.number}
                    </Link>
                    <StatusBadge status={row.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Recent invoices">
            {invoices.results.length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              <ul className="divide-y divide-border/70 text-sm">
                {invoices.results.map((invoice) => (
                  <li key={String(invoice._id)} className="flex items-center justify-between gap-3 py-2.5">
                    <Link to={`/app/invoices/${invoice._id}`} className="font-medium hover:text-brand">
                      {invoice.number ?? "Draft"}
                    </Link>
                    <span className="flex items-center gap-3">
                      <span className="tabular-nums">{formatINR(invoice.total)}</span>
                      <StatusBadge status={invoice.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
