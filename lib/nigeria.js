import ng from "naija-state-local-government";

// Canonical Nigerian states + LGA list, so every state/city field in the
// app (customer addresses, shipping rates, checkout) offers the same
// dropdown instead of free text - shipping rate matching (see
// lib/shipping.js) depends on the state/city a customer picks at checkout
// lining up with what a vendor picked when setting a rate, which
// free-typed text could never reliably guarantee (typos, casing,
// "Lagos" vs "lagos state").
export const NIGERIA_STATE_OPTIONS = ng.states().map((s) => ({ value: s, label: s }));

export function getLgaOptions(state) {
  if (!state) return [];
  const result = ng.lgas(state);
  return (result?.lgas || []).map((lga) => ({ value: lga, label: lga }));
}
