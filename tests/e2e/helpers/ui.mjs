import { expect } from "@playwright/test";

export async function loginAsVendor(page, fixture) {
  await page.goto("/login");
  await page.evaluate(() => localStorage.clear());
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto(`/login?next=/vendor/dashboard`);
    await page.getByPlaceholder("you@example.com").fill(fixture.email);
    await page.locator('input[type="password"]').fill(fixture.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    try {
      await expect
        .poll(() => page.evaluate(() => Boolean(localStorage.getItem("ecom_token"))), { timeout: 15_000 })
        .toBe(true);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

export function collectBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/favicon|Download the React DevTools|bad HTTP response code \(404\).*script/i.test(text)) return;
    errors.push(text);
  });
  return errors;
}
