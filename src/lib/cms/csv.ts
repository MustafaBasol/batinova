/** CSV helpers (owner: cms-admin). Isomorphic. Neutralises spreadsheet formula injection (OWASP). */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString() : String(value);
  s = s.replace(/\r\n|\r|\n/g, " ").replace(/\u0000/g, "");
  // leading =, +, -, @, TAB, CR (also after leading spaces) would be interpreted as a formula
  if (/^[\s]*[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`; // BOM + ';' so French Excel opens it correctly
}
