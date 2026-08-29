import { inArray } from "drizzle-orm";
import { db } from "./db/index.js";
import { productVariants, productBranchStock, cartItems, orderItems } from "./db/schema.js";

// A variant that's already been ordered can't be hard-deleted - orderItems
// snapshots its label/price so history survives, but the (NO ACTION)
// foreign key would block the delete anyway. Callers turn this into a 409.
export class VariantOrderedError extends Error {
  constructor() {
    super("One or more of these options are part of an existing order and can't be removed.");
    this.name = "VariantOrderedError";
  }
}

// Deletes variant rows plus everything that only exists because of them:
// the branch-stock ledger rows and any stale cart lines still pointing at
// them (the bug that made single deletes 500 - the old route only cleared
// productBranchStock, so a variant sitting in anyone's cart couldn't go).
export async function deleteVariants(variantIds) {
  const ids = [...new Set((variantIds || []).filter(Boolean))];
  if (ids.length === 0) return 0;

  return db.transaction(async (tx) => {
    const ordered = await tx
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(inArray(orderItems.variantId, ids))
      .limit(1);
    if (ordered.length > 0) throw new VariantOrderedError();

    await tx.delete(cartItems).where(inArray(cartItems.variantId, ids));
    await tx.delete(productBranchStock).where(inArray(productBranchStock.variantId, ids));
    const deleted = await tx
      .delete(productVariants)
      .where(inArray(productVariants.id, ids))
      .returning({ id: productVariants.id });
    return deleted.length;
  });
}
