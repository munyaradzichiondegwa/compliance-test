// Lightweight CSV builder — used for the Recommendation Register and Risk
// Register exports (PRD Section 17, "Excel / PDF"). No external dependency
// needed for straightforward tabular exports.

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    // Neutralise spreadsheet formula injection (=, +, -, @ prefixes)
    if (/^[=+\-@\t\r]/.test(str) && Number.isNaN(Number(str))) str = `'${str}`;
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  });
  return lines.join('\n');
}
