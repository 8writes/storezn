export function snapshotCustomerFieldAnswers(fields, answers) {
  const definitions = Array.isArray(fields) ? fields : [];
  const source = answers && typeof answers === "object" && !Array.isArray(answers) ? answers : {};
  return Object.fromEntries(definitions
    .filter((field) => Object.prototype.hasOwnProperty.call(source, field.id))
    .map((field) => [field.id, { label: field.label, value: source[field.id] }]));
}

export function customerFieldEntries(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  return Object.entries(snapshot).map(([id, detail]) => {
    if (detail && typeof detail === "object" && !Array.isArray(detail) && Object.prototype.hasOwnProperty.call(detail, "value")) {
      return { id, label: detail.label || id, value: detail.value };
    }
    return { id, label: id.replaceAll("_", " "), value: detail };
  });
}
