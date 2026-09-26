import { expect, test } from "@playwright/test";
import { cleanupFixture, createSql, createVerifiedVendorFixture, seedProduct } from "./helpers/db.mjs";
import { collectBrowserErrors, loginAsVendor } from "./helpers/ui.mjs";

test.describe("POS browser flow", () => {
  let sql;

  test.beforeAll(() => {
    sql = createSql();
  });

  test.afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  test("opens the POS and finds a product through the register product search", async ({ page }) => {
    const fixture = await createVerifiedVendorFixture(sql);
    const product = await seedProduct(sql, fixture, {
      name: `E2E POS Search ${Date.now()}`,
      sku: `POS-${Date.now()}`,
      stock: 9,
      price: 1500,
    });
    const browserErrors = collectBrowserErrors(page);
    try {
      await loginAsVendor(page, fixture);
      await page.evaluate((data) => {
        localStorage.setItem("pos_stores", JSON.stringify([{
          id: data.storeId,
          name: data.storeName,
          slug: data.storeSlug,
          plan: "enterprise",
          isActive: true,
          isOpen: true,
        }]));
        localStorage.setItem(`pos_registers_${data.storeId}`, JSON.stringify([{
          id: data.registerId,
          name: "Main register",
          branchId: data.branchId,
          branchName: "Main branch",
          isActive: true,
          openSession: null,
        }]));
      }, fixture);

      await page.goto(`/vendor/pos?storeId=${fixture.storeId}`);
      await expect(page.getByRole("heading", { name: "Open a register" })).toBeVisible();
      await page.getByPlaceholder("Count and enter the amount").fill("0");
      await expect(page.locator('button:has-text("Open register")')).toBeEnabled();
      const openResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "POST" &&
        response.url().includes(`/api/v1/vendor/stores/${fixture.storeId}/pos/sessions`),
      );
      await page.locator('button:has-text("Open register")').click();
      const openResponse = await openResponsePromise;
      expect(openResponse.status()).toBeLessThan(400);

      await expect(page.getByText("Current sale")).toBeVisible();
      const search = page.getByPlaceholder("Scan a barcode, or search by name / SKU");
      const searchResponsePromise = page.waitForResponse((response) =>
        response.request().method() === "GET" &&
        response.url().includes(`/api/v1/vendor/stores/${fixture.storeId}/products`) &&
        new URL(response.url()).searchParams.get("q") === product.name,
      );
      await search.fill(product.name);
      const searchResponse = await searchResponsePromise;
      expect(searchResponse.status()).toBeLessThan(400);
      const searchData = await searchResponse.json();
      expect(searchData.products.some((row) => row.id === product.id)).toBe(true);
      await page.waitForTimeout(500);
      expect(await page.locator("main").innerText()).toContain(product.name);
      await page.getByText(product.name, { exact: false }).first().click();
      await expect(page.getByText(product.name, { exact: false })).toBeVisible();
      expect(browserErrors).toEqual([]);
    } finally {
      await cleanupFixture(sql, fixture).catch(() => {});
    }
  });
});
