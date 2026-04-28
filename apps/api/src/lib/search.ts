import { Meilisearch } from "meilisearch";

export const searchClient = new Meilisearch({
  host: process.env["MEILISEARCH_URL"] ?? "http://localhost:7700",
  apiKey: process.env["MEILISEARCH_MASTER_KEY"],
});

export async function setupSearchIndexes(): Promise<void> {
  const contacts = searchClient.index("contacts");
  await contacts.updateSettings({
    searchableAttributes: ["name", "phoneNumber", "email"],
    filterableAttributes: ["organizationId", "lifecycleStage"],
    sortableAttributes: ["createdAt"],
  });
}

export interface ContactDocument {
  id: string;
  organizationId: string;
  name: string | null;
  phoneNumber: string;
  email: string | null;
  lifecycleStage: string;
}

export async function indexContact(contact: ContactDocument): Promise<void> {
  await searchClient.index("contacts").addDocuments([contact]);
}

export async function removeContact(id: string): Promise<void> {
  await searchClient.index("contacts").deleteDocument(id);
}

export async function searchContacts(
  organizationId: string,
  query: string,
  limit = 20
): Promise<ContactDocument[]> {
  const result = await searchClient.index("contacts").search<ContactDocument>(query, {
    filter: [`organizationId = "${organizationId}"`],
    limit,
  });
  return result.hits;
}
