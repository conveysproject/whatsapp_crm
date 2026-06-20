import Papa from "papaparse";

export interface ContactCsvRow {
  phoneNumber: string;
  name: string;
  email: string;
  leadStatus: string;
  tags: string;
}

export function generateContactsCsv(
  contacts: Array<{
    phoneNumber: string;
    name: string | null;
    email: string | null;
    leadStatus: string;
    tags: string[];
  }>
): string {
  const rows: ContactCsvRow[] = contacts.map((c) => ({
    phoneNumber: `="${c.phoneNumber}"`,
    name: c.name ?? "",
    email: c.email ?? "",
    leadStatus: c.leadStatus,
    tags: c.tags.join(";"),
  }));
  return Papa.unparse(rows);
}

export function parseContactsCsv(csvText: string): ContactCsvRow[] {
  const result = Papa.parse<ContactCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return result.data;
}
