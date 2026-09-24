// Barcode scanners may include an AIM symbology prefix (for example ]E0)
// and UPC-A may be represented as either 12 digits or EAN-13 with a leading
// zero. Keep matching exact while accepting those equivalent scan formats.
export function normalizeBarcode(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/^\][A-Za-z]\d/, "")
    .toLowerCase();
}

export function barcodeCandidates(value) {
  const normalized = normalizeBarcode(value);
  if (!normalized) return [];
  const candidates = [normalized];
  if (/^\d{13}$/.test(normalized) && normalized.startsWith("0")) candidates.push(normalized.slice(1));
  if (/^\d{12}$/.test(normalized)) candidates.push(`0${normalized}`);
  return [...new Set(candidates)];
}

export function barcodeMatches(storedValue, scannedValue) {
  const stored = new Set(barcodeCandidates(storedValue));
  return barcodeCandidates(scannedValue).some((candidate) => stored.has(candidate));
}
