import { db } from "../lib/db/index.js";
import { users } from "../lib/db/schema.js";
import bcrypt from "bcryptjs";
import { inArray } from "drizzle-orm";

// One-off local-dev utility: resets every account's password to a single
// known value so all test logins (admin/vendor/customer) work again.
// Local dev only - never point this at a prod DATABASE_URL.
const NEW_PASSWORD = "Test1234!";

const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);
const updated = await db
  .update(users)
  .set({ passwordHash })
  .where(inArray(users.role, ["super_admin", "vendor", "customer"]))
  .returning({ email: users.email, role: users.role });

console.log(`Reset password for ${updated.length} account(s) to: ${NEW_PASSWORD}`);
for (const u of updated.sort((a, b) => a.role.localeCompare(b.role))) {
  console.log(`  [${u.role}] ${u.email}`);
}
process.exit(0);
