/** Adapters between stored documents and the pure pricing-engine types. */
import type { Doc } from "../_generated/dataModel";
import type { DiscountRule, TaxRule } from "../../shared/pricing";

export function toDiscountRule(doc: Doc<"discounts">): DiscountRule {
  return {
    id: doc._id,
    name: doc.name,
    type: doc.type,
    value: doc.value,
    minPurchase: doc.minPurchase ?? null,
    minQuantity: doc.minQuantity ?? null,
    startDate: doc.startDate ?? null,
    endDate: doc.endDate ?? null,
    usageLimit: doc.usageLimit ?? null,
    perCustomerLimit: doc.perCustomerLimit ?? null,
    usedCount: doc.usedCount,
    appliesTo: doc.appliesTo,
    productIds: doc.productIds,
    isActive: doc.isActive,
  };
}

export function toTaxRule(doc: Doc<"taxes">): TaxRule {
  return {
    id: doc._id,
    name: doc.name,
    type: doc.type,
    rateBps: doc.type === "PERCENT" ? doc.value : undefined,
    amount: doc.type === "FIXED" ? doc.value : undefined,
    isInclusive: doc.isInclusive,
  };
}
