import { expect, test } from "@playwright/test";
import { cleanupFixture, createSql, createVerifiedVendorFixture } from "./helpers/db.mjs";
import { collectBrowserErrors, loginAsVendor } from "./helpers/ui.mjs";

test.describe("vendor product browser flow", () => {
  let sql;

  test.beforeAll(() => {
    sql = createSql();
  });

  test.afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  test("creates a product from the real add-product form with optional fields left blank", async ({ page }) => {
    const fixture = await createVerifiedVendorFixture(sql);
    const browserErrors = collectBrowserErrors(page);
    try {
      await loginAsVendor(page, fixture);

      await page.goto(`/vendor/products/new?storeId=${fixture.storeId}`);
      const productForm = page.locator("form").first();
      const submitButton = page.locator('button:has-text("Create product")').first();
      await expect(submitButton).toBeVisible();

      const productName = `E2E Blank Optional ${Date.now()}`;
      await productForm.locator("input").nth(0).fill(productName);
      await productForm.locator("input").nth(1).fill("1999");

      const requestPromise = page.waitForRequest((request) =>
        request.method() === "POST" && request.url().includes(`/api/v1/vendor/stores/${fixture.storeId}/products`),
      );
      const responsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST" && response.url().includes(`/api/v1/vendor/stores/${fixture.storeId}/products`),
      );
      await submitButton.click();

      const request = await requestPromise;
      const payload = request.postDataJSON();
      expect(payload.name).toBe(productName);
      expect(payload.price).toBe(1999);
      expect(payload).not.toHaveProperty("sku");
      expect(payload).not.toHaveProperty("description");

      const response = await responsePromise;
      expect(response.status()).toBeLessThan(400);
      await expect(page).toHaveURL(/\/vendor\/products\/.+storeId=/);

      const rows = await sql`select id, name, price from products where store_id = ${fixture.storeId} and name = ${productName}`;
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].price)).toBe(1999);
      expect(browserErrors).toEqual([]);
    } finally {
      await cleanupFixture(sql, fixture).catch(() => {});
    }
  });
});
