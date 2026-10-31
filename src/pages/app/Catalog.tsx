import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Boxes, Layers, Plus } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  EmptyState,
  ErrorNote,
  Field,
  LoadingBlock,
  PageHeader,
  SectionCard,
} from "@/components/Bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { PRODUCT_TYPES, ROLES } from "@/shared/enums";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "products", label: "Products" },
  { key: "attributes", label: "Attributes" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function Catalog() {
  const [tab, setTab] = useState<TabKey>("products");
  const products = useQuery(api.catalog.listProducts);
  const attributes = useQuery(api.catalog.listAttributes);
  const [productOpen, setProductOpen] = useState(false);
  const [attributeOpen, setAttributeOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Products, variants and the attributes that price them. Variant price = product price + attribute extras, or an explicit override."
        actions={
          tab === "products" ? (
            <Button onClick={() => setProductOpen(true)}>
              <Plus className="mr-1.5 size-4" /> New product
            </Button>
          ) : (
            <Button onClick={() => setAttributeOpen(true)}>
              <Plus className="mr-1.5 size-4" /> New attribute
            </Button>
          )
        }
      />

      <div className="flex gap-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              tab === entry.key
                ? "border-brand bg-brand-soft text-brand-strong"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "products" ? (
        !products ? (
          <LoadingBlock />
        ) : products.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add what you sell — services, software, add-ons or physical goods."
            action={<Button onClick={() => setProductOpen(true)}>New product</Button>}
          />
        ) : (
          <div className="space-y-4">
            {products.map((product) => (
              <ProductCard key={String(product._id)} product={product} />
            ))}
          </div>
        )
      ) : !attributes ? (
        <LoadingBlock />
      ) : attributes.length === 0 ? (
        <EmptyState
          title="No attributes yet"
          description="Attributes like Coverage or Tier carry an extra price that variant prices are built from."
          action={<Button onClick={() => setAttributeOpen(true)}>New attribute</Button>}
        />
      ) : (
        <SectionCard title="Attributes" description="Each value adds its price on top of the product price">
          <ul className="divide-y divide-border/70">
            {attributes.map((attribute) => (
              <li key={String(attribute._id)} className="py-3">
                <p className="text-sm font-medium">{attribute.name}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {attribute.values.map((value) => (
                    <Badge key={String(value._id)} variant="outline">
                      {value.value}
                      {value.extraPrice > 0 ? ` +${formatINR(value.extraPrice)}` : " · no extra"}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <ProductDialog open={productOpen} onOpenChange={setProductOpen} />
      <AttributeDialog open={attributeOpen} onOpenChange={setAttributeOpen} />
    </div>
  );
}

type ProductRow = Omit<Doc<"products">, "costPrice"> & {
  costPrice: number | null;
  margin: number | null;
  taxNames: string[];
  attributes: { id: Id<"attributes">; name: string }[];
  variants: (Doc<"variants"> & {
    effectivePrice: number;
    attributeTotal: number;
    values: {
      attributeValueId: Id<"attributeValues">;
      attributeId: Id<"attributes">;
      value: string;
      extraPrice: number;
      attributeName: string;
    }[];
  })[];
};

type AttributeRow = Doc<"attributes"> & { values: Doc<"attributeValues">[] };

function ProductCard({ product }: { product: ProductRow }) {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const attributes = useQuery(api.catalog.listAttributes);
  const [variantFor, setVariantFor] = useState<Id<"products"> | null>(null);

  return (
    <section className="card-layer overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-brand-strong">
              <Boxes className="size-4" />
            </span>
            <h2 className="text-sm font-semibold">{product.name}</h2>
            <Badge variant="secondary">{product.type}</Badge>
            {!product.isActive ? <Badge variant="outline">Inactive</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Base {formatINR(product.salesPrice)}
            {product.margin !== null ? ` · margin ${formatINR(product.margin)}` : ""}
            {product.taxNames.length > 0 ? ` · ${product.taxNames.join(", ")}` : ""}
            {product.attributes.length > 0
              ? ` · ${product.attributes.map((entry) => entry.name).join(", ")}`
              : ""}
          </p>
        </div>
        {isAdmin ? (
          <Button size="sm" variant="outline" onClick={() => setVariantFor(product._id)}>
            <Plus className="mr-1.5 size-3.5" /> Variant
          </Button>
        ) : null}
      </header>

      <div className="px-5 py-3">
        {product.variants.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            No variants — the product sells at its base price.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-1.5 font-medium">Variant</th>
                <th className="pb-1.5 font-medium">SKU</th>
                <th className="pb-1.5 font-medium">Composition</th>
                <th className="pb-1.5 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {product.variants.map((variant) => (
                <tr key={String(variant._id)}>
                  <td className="py-2">
                    {variant.name}
                    {!variant.isActive ? (
                      <span className="ml-1.5 text-xs text-muted-foreground">inactive</span>
                    ) : null}
                  </td>
                  <td className="py-2 font-mono text-xs">{variant.sku}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {variant.values.length > 0
                      ? variant.values
                          .map(
                            (value) =>
                              `${value.attributeName}: ${value.value}${
                                value.extraPrice ? ` (+${formatINR(value.extraPrice)})` : ""
                              }`,
                          )
                          .join(" · ")
                      : "price override"}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {formatINR(variant.effectivePrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {product.notes ? (
          <p className="mt-2 text-xs text-muted-foreground">{product.notes}</p>
        ) : null}
      </div>

      <VariantDialog
        productId={variantFor}
        open={variantFor !== null}
        onOpenChange={(open) => {
          if (!open) setVariantFor(null);
        }}
        attributes={(attributes ?? []) as AttributeRow[]}
      />
    </section>
  );
}

function VariantDialog({
  productId,
  open,
  onOpenChange,
  attributes,
}: {
  productId: Id<"products"> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attributes: AttributeRow[];
}) {
  const createVariant = useMutation(api.catalog.createVariant);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New variant</DialogTitle>
          <DialogDescription>
            Either override the price outright or pick attribute values that add
            their prices on top of the product price.
          </DialogDescription>
        </DialogHeader>
        <ErrorNote message={error} />
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!productId) return;
            setBusy(true);
            setError(null);
            const data = new FormData(event.currentTarget);
            const valueIds = data.getAll("valueIds").map(String);
            const override = String(data.get("priceOverride") ?? "").trim();
            try {
              await createVariant({
                productId,
                sku: String(data.get("sku") ?? ""),
                name: String(data.get("name") ?? ""),
                priceOverride: override || undefined,
                valueIds,
              });
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the variant.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Variant name" required>
              <Input name="name" placeholder="Priority" required disabled={busy} />
            </Field>
            <Field label="SKU" required>
              <Input name="sku" placeholder="RET-PRI" required disabled={busy} />
            </Field>
            <Field label="Price override (₹)" hint="Leave empty to derive from attributes">
              <Input name="priceOverride" inputMode="decimal" placeholder="5560" disabled={busy} />
            </Field>
          </div>

          {attributes.length > 0 ? (
            <div className="space-y-2">
              <Label>Attribute values</Label>
              {attributes.map((attribute) => (
                <div key={String(attribute._id)} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{attribute.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {attribute.values.map((value) => (
                      <label
                        key={String(value._id)}
                        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="valueIds"
                          value={String(value._id)}
                          className="accent-[var(--brand)]"
                        />
                        {value.value}
                        {value.extraPrice > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            +{formatINR(value.extraPrice)}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create variant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createProduct = useMutation(api.catalog.createProduct);
  const taxes = useQuery(api.pricing.listTaxes);
  const attributes = useQuery(api.catalog.listAttributes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>
            Prices are typed in rupees and stored as integer paise. Taxes attach to
            the product and follow every line.
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
              await createProduct({
                name: String(data.get("name") ?? ""),
                type: String(data.get("type") ?? "SERVICE"),
                salesPrice: String(data.get("salesPrice") ?? ""),
                costPrice: String(data.get("costPrice") ?? "0") || "0",
                notes: String(data.get("notes") ?? "") || undefined,
                isActive: true,
                attributeIds: data.getAll("attributeIds").map(String),
                taxIds: data.getAll("taxIds").map(String),
              });
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the product.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required>
              <Input name="name" placeholder="Retainer Support Hours" required disabled={busy} />
            </Field>
            <Field label="Type" required>
              <Select name="type" defaultValue="SERVICE">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Sales price (₹)" required>
              <Input name="salesPrice" inputMode="decimal" placeholder="5000" required disabled={busy} />
            </Field>
            <Field label="Cost price (₹)" hint="Admin-only; drives the margin shown">
              <Input name="costPrice" inputMode="decimal" placeholder="2500" disabled={busy} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <Input name="notes" placeholder="10 hours of support each billing period." disabled={busy} />
              </Field>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Taxes</Label>
              <div className="flex flex-wrap gap-2">
                {(taxes ?? []).filter((tax) => tax.isActive).map((tax) => (
                  <label
                    key={String(tax._id)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm"
                  >
                    <input type="checkbox" name="taxIds" value={String(tax._id)} className="accent-[var(--brand)]" />
                    {tax.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Attributes this product can use</Label>
              <div className="flex flex-wrap gap-2">
                {(attributes ?? []).map((attribute) => (
                  <label
                    key={String(attribute._id)}
                    className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="attributeIds"
                      value={String(attribute._id)}
                      className="accent-[var(--brand)]"
                    />
                    {attribute.name}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttributeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createAttribute = useMutation(api.catalog.createAttribute);
  const [values, setValues] = useState<{ value: string; extraPrice: string }[]>([
    { value: "", extraPrice: "0" },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New attribute</DialogTitle>
          <DialogDescription>
            For example Coverage, with Standard at +₹0 and Priority at +₹560.
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
            const name = String(data.get("name") ?? "");
            try {
              await createAttribute({
                name,
                values: values
                  .filter((row) => row.value.trim())
                  .map((row) => ({
                    value: row.value.trim(),
                    extraPrice: row.extraPrice.trim() || "0",
                  })),
              });
              setValues([{ value: "", extraPrice: "0" }]);
              onOpenChange(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create the attribute.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Attribute name" required>
            <Input name="name" placeholder="Coverage" required disabled={busy} />
          </Field>

          <div className="space-y-2">
            <Label>Values and extra prices (₹)</Label>
            {values.map((row, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Priority"
                  value={row.value}
                  disabled={busy}
                  onChange={(event) =>
                    setValues((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, value: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Input
                  inputMode="decimal"
                  placeholder="560"
                  className="w-28 text-right"
                  value={row.extraPrice}
                  disabled={busy}
                  onChange={(event) =>
                    setValues((current) =>
                      current.map((entry, i) =>
                        i === index ? { ...entry, extraPrice: event.target.value } : entry,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={values.length === 1 || busy}
                  onClick={() => setValues((current) => current.filter((_, i) => i !== index))}
                  aria-label="Remove value"
                >
                  ×
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setValues((current) => [...current, { value: "", extraPrice: "0" }])}
            >
              <Layers className="mr-1.5 size-3.5" /> Add value
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create attribute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
