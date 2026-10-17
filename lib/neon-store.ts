import { parseCloudSnapshot, type CloudSnapshot } from "./cloud-study.ts";
import { parseStudyData, type StudyData } from "./study.ts";

export type StudyQuery = (query: string, parameters?: unknown[]) => Promise<Record<string, unknown>[]>;

export function validateNeonConnection(value: string | undefined): string {
  if (!value) throw new Error("尚未配置个人 Neon 数据库。");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("个人 Neon 数据库配置格式不正确。"); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech') || !url.username || !url.password || url.pathname.length < 2) {
    throw new Error("只允许连接 Neon 数据库，请检查个人项目的连接配置。");
  }
  return value;
}

export function createStudyStore(query: StudyQuery) {
  let initialization: Promise<void> | null = null;
  function initialize() {
    initialization ??= (async () => {
      await query(`CREATE TABLE IF NOT EXISTS yantu_study_documents (
        id TEXT PRIMARY KEY CHECK (id = 'main'),
        revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
        data JSONB,
        history JSONB NOT NULL DEFAULT '[]'::jsonb
      )`);
      await query("INSERT INTO yantu_study_documents (id) VALUES ('main') ON CONFLICT (id) DO NOTHING");
    })().catch(error => { initialization = null; throw error; });
    return initialization;
  }

  async function read(): Promise<CloudSnapshot> {
    await initialize();
    const rows = await query("SELECT revision, data FROM yantu_study_documents WHERE id = 'main'");
    if (!rows[0]) throw new Error("云端题库读取异常。");
    return parseCloudSnapshot({ revision: Number(rows[0].revision), data: rows[0].data });
  }

  async function write(expectedRevision: number, data: StudyData): Promise<{ revision: number; updatedAt: string } | null> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) throw new Error("版本号无效。");
    const saved = { ...parseStudyData(JSON.stringify(data)), updatedAt: new Date().toISOString() };
    await initialize();
    // The version predicate and the backup run in the same PostgreSQL statement.
    const rows = await query(`UPDATE yantu_study_documents SET
      history = CASE WHEN data IS NULL THEN history ELSE (
        SELECT COALESCE(jsonb_agg(entry ORDER BY position), '[]'::jsonb)
        FROM jsonb_array_elements(jsonb_build_array(jsonb_build_object('revision', revision, 'data', data)) || history)
          WITH ORDINALITY AS snapshots(entry, position)
        WHERE position <= 20
      ) END,
      revision = revision + 1,
      data = $2::jsonb
      WHERE id = 'main' AND revision = $1::bigint
      RETURNING revision`, [expectedRevision, JSON.stringify(saved)]);
    return rows[0] ? { revision: Number(rows[0].revision), updatedAt: saved.updatedAt } : null;
  }
  return { read, write };
}
