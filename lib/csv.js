// Minimal CSV parser/writer -no external dependency, handles quoted
// fields (commas/newlines/escaped quotes inside "..."), \r\n or \n line
// endings, and blank trailing lines. Client-and-server safe (no db
// import). Used for bulk data import/export (e.g. migrating students
// from a spreadsheet) rather than pulling in a whole CSV library for it.

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      pushField();
    } else if (char === "\n") {
      pushRow();
    } else if (char === "\r") {
      // skip, \n (if present) handles the row break
    } else {
      field += char;
    }
  }
  if (inQuotes) throw new Error("Unterminated quoted field");
  if (field !== "" || row.length > 0) pushRow();

  const nonEmptyRows = rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (nonEmptyRows.length === 0) return [];

  // Spreadsheet exports often prefix the first header with a UTF-8 BOM.
  // Strip it here so the first column still maps to the expected field.
  const headers = nonEmptyRows[0].map((h) => h.replace(/^\uFEFF/, "").trim());
  return nonEmptyRows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function csvEscape(value) {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

// Triggers a browser download of a CSV built from `headers` (column
// order) and `rows` (array of objects keyed by header name).
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
