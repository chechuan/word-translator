import { neon } from "@neondatabase/serverless";
import { createStudyStore, validateNeonConnection } from "./neon-store";

let store: ReturnType<typeof createStudyStore> | undefined;
export function personalStudyStore() {
  if (!store) {
    const sql = neon(validateNeonConnection(process.env.DATABASE_URL));
    store = createStudyStore((query, parameters = []) => sql.query(query, parameters, { fetchOptions: { signal: AbortSignal.timeout(10000) } }));
  }
  return store;
}
