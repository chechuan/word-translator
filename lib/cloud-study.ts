import { makeInitialData, parseStudyData, type StudyData } from "./study.ts";

export const CLOUD_META_KEY = "_cloud";
export type CloudSnapshot = { revision: number; data: StudyData | null };
export type CloudMeta = { revision: number; fingerprint: string };

export function studyFingerprint(data: StudyData): string {
  const normalized = parseStudyData(JSON.stringify(data));
  const drafts = Object.fromEntries(Object.entries(normalized.drafts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const canonical = JSON.stringify({ ...normalized, drafts, updatedAt: "" });
  let first = 2166136261, second = 5381;
  for (let i = 0; i < canonical.length; i++) {
    first = Math.imul(first ^ canonical.charCodeAt(i), 16777619);
    second = Math.imul(second, 33) ^ canonical.charCodeAt(i);
  }
  return `${canonical.length}:${first >>> 0}:${second >>> 0}`;
}

export function parseCloudSnapshot(value: unknown): CloudSnapshot {
  const snapshot = value as CloudSnapshot;
  if (!snapshot || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || !Object.hasOwn(snapshot, "data")) throw new Error("云端返回的数据格式异常。");
  return { revision: snapshot.revision, data: snapshot.data === null ? null : parseStudyData(JSON.stringify(snapshot.data)) };
}

export function chooseInitialSource(local: StudyData | null, remote: CloudSnapshot, meta: CloudMeta | null): "local" | "remote" | "conflict" {
  if (!remote.data) return "local";
  if (!local) return "remote";
  const localFingerprint = studyFingerprint(local), remoteFingerprint = studyFingerprint(remote.data);
  const emptyFingerprint = studyFingerprint(makeInitialData());
  if (localFingerprint === remoteFingerprint) return "remote";
  if (meta?.fingerprint === localFingerprint) return "remote";
  if (meta?.fingerprint === remoteFingerprint) return "local";
  if (meta) return "conflict";
  if (localFingerprint === emptyFingerprint) return "remote";
  if (remoteFingerprint === emptyFingerprint) return "local";
  return "conflict";
}
