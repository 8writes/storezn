// One-time backfill for the multi-branch feature: gives every existing
// store exactly one isDefault branch, backfills productBranchStock rows
// from each product's/variant's current stock value, and points every
// existing order at that store's default branch. Idempotent - safe to
// re-run (skips stores/products that already have branch data).
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL);

const stores = await sql`SELECT id, name FROM stores`;
console.log(`Found ${stores.length} stores`);

let branchesCreated = 0;
let productRowsCreated = 0;
let variantRowsCreated = 0;
let ordersBackfilled = 0;

for (const store of stores) {
  let [branch] = await sql`SELECT id FROM branches WHERE store_id = ${store.id} AND is_default = true LIMIT 1`;
  if (!branch) {
    [branch] = await sql`
      INSERT INTO branches (id, store_id, name, is_default)
      VALUES (gen_random_uuid(), ${store.id}, ${store.name}, true)
      RETURNING id
    `;
    branchesCreated++;
  }

  const products = await sql`SELECT id, stock FROM products WHERE store_id = ${store.id}`;
  for (const product of products) {
    const [existing] = await sql`
      SELECT id FROM product_branch_stock WHERE product_id = ${product.id} AND variant_id IS NULL AND branch_id = ${branch.id}
    `;
    if (!existing) {
      await sql`
        INSERT INTO product_branch_stock (id, product_id, variant_id, branch_id, stock)
        VALUES (gen_random_uuid(), ${product.id}, NULL, ${branch.id}, ${product.stock})
      `;
      productRowsCreated++;
    }

    const variants = await sql`SELECT id, stock FROM product_variants WHERE product_id = ${product.id}`;
    for (const variant of variants) {
      const [existingV] = await sql`
        SELECT id FROM product_branch_stock WHERE product_id = ${product.id} AND variant_id = ${variant.id} AND branch_id = ${branch.id}
      `;
      if (!existingV) {
        await sql`
          INSERT INTO product_branch_stock (id, product_id, variant_id, branch_id, stock)
          VALUES (gen_random_uuid(), ${product.id}, ${variant.id}, ${branch.id}, ${variant.stock})
        `;
        variantRowsCreated++;
      }
    }
  }

  const result = await sql`UPDATE orders SET branch_id = ${branch.id} WHERE store_id = ${store.id} AND branch_id IS NULL`;
  ordersBackfilled += result.count;
}

console.log({ branchesCreated, productRowsCreated, variantRowsCreated, ordersBackfilled });

// Correctness check: SUM(product_branch_stock.stock) per product/variant
// must match products.stock/product_variants.stock exactly (mismatches
// mean a store had more than one branch worth of data already, or a
// product was created concurrently with this script running).
const productMismatches = await sql`
  SELECT p.id, p.stock AS product_stock, COALESCE(SUM(pbs.stock), NULL) AS branch_sum
  FROM products p
  LEFT JOIN product_branch_stock pbs ON pbs.product_id = p.id AND pbs.variant_id IS NULL
  GROUP BY p.id, p.stock
  HAVING p.stock IS DISTINCT FROM COALESCE(SUM(pbs.stock), NULL)
`;
console.log(`Product stock mismatches: ${productMismatches.length}`);
if (productMismatches.length > 0) console.log(productMismatches.slice(0, 10));

const variantMismatches = await sql`
  SELECT v.id, v.stock AS variant_stock, COALESCE(SUM(pbs.stock), NULL) AS branch_sum
  FROM product_variants v
  LEFT JOIN product_branch_stock pbs ON pbs.variant_id = v.id
  GROUP BY v.id, v.stock
  HAVING v.stock IS DISTINCT FROM COALESCE(SUM(pbs.stock), NULL)
`;
console.log(`Variant stock mismatches: ${variantMismatches.length}`);
if (variantMismatches.length > 0) console.log(variantMismatches.slice(0, 10));

await sql.end();
