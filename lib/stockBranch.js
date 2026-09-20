export const STAFF_BRANCH_REQUIRED_MESSAGE =
  "Your staff account is not assigned to a valid branch. Ask the store owner to assign your branch before changing stock.";

export function stockBranchForUser(branchRows, user) {
  if (user?.role === "staff") {
    if (user.branchId) return branchRows.find((branch) => branch.id === user.branchId) || null;
    return branchRows.length === 1 ? branchRows[0] : null;
  }

  return branchRows.find((branch) => branch.isDefault) || branchRows[0] || null;
}
