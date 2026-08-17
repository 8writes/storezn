import { NextResponse } from "next/server";
import { getUser } from "../../../../../../lib/auth.js";
import { removeStaffMember } from "../../../../../../lib/staff.js";

// A staff member removing themselves from a store, distinct from
// DELETE /api/v1/vendor/stores/[storeId]/staff/[staffId] (owner-only,
// gated by isStoreOwner, which deliberately excludes staff from touching
// the roster at all). This one is authorized as "acting on my own row",
// nothing else - so a staff member can leave without needing the owner
// to do it for them.
export async function DELETE(req) {
  const user = await getUser(req);
  if (!user || user.role !== "staff") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await removeStaffMember(user.id);

  return NextResponse.json({ ok: true });
}
