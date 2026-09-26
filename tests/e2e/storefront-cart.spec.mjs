import { expect, test } from "@playwright/test";
import { cleanupFixture, createSql, createVerifiedVendorFixture, seedProduct } from "./helpers/db.mjs";
import { collectBrowserErrors } from "./helpers/ui.mjs";

test.describe("storefront cart browser flow", () => {
  let sql;
  const port = process.env.E2E_PORT || "3107";

  test.beforeAll(() => {
    sql = createSql();
  });

  test.afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  test("adds a seeded fixed-price product to the guest cart", async ({ page }) => {
    const fixture = await createVerifiedVendorFixture(sql);
    const product = await seedProduct(sql, fixture, { name: `E2E Cart Product ${Date.now()}`, stock: 12, price: 3200 });
    const browserErrors = collectBrowserErrors(page);
    try {
      await page.goto(`http://${fixture.storeSlug}.localhost:${port}/products/${product.slug}`);
      await expect(page.getByRole("heading", { name: product.name })).toBeVisible();
      await page.getByRole("button", { name: "Add to cart" }).click();
      await expect(page.locator("header").getByText("1", { exact: true })).toBeVisible();
      expect(browserErrors).toEqual([]);
    } finally {
      await cleanupFixture(sql, fixture).catch(() => {});
    }
  });
});
