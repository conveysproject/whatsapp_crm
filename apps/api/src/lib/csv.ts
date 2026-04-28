import Papa from "papaparse";

export interface ContactCsvRow {
  phoneNumber: string;
  name: string;
  email: string;
  lifecycleStage: string;
  tags: string;
}

export function generateContactsCsv(
  contacts: Array<{
    phoneNumber: string;
    name: string | null;
    email: string | null;
    lifecycleStage: string;
    tags: string[];
  }>
): string {
  const rows: ContactCsvRow[] = contacts.map((c) => ({
    phoneNumber: c.phoneNumber,
    name: c.name ?? "",
    email: c.email ?? "",
    lifecycleStage: c.lifecycleStage,
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
