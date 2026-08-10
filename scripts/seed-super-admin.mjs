import { db } from "../lib/db/index.js";
import { users } from "../lib/db/schema.js";
import bcrypt from "bcryptjs";

const passwordHash = await bcrypt.hash("SuperSecret123", 10);
await db
  .insert(users)
  .values({
    firstName: "Root",
    lastName: "Admin",
    email: "superadmin@example.com",
    passwordHash,
    role: "super_admin",
    emailVerified: true,
  })
  .onConflictDoNothing();
console.log("seeded");
process.exit(0);
