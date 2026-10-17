"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { CLOUD_META_KEY, chooseInitialSource, parseCloudSnapshot, studyFingerprint, type CloudMeta, type CloudSnapshot } from "@/lib/cloud-study";
import { makeInitialData, parseStudyData, removeUnusedExample, STORAGE_KEY, type StudyData } from "@/lib/study";

type SyncStatus = "connecting" | "saving" | "synced" | "offline" | "conflict";
export function useCloudStudy() {
  const [data, updateData] = useState<StudyData>(makeInitialData);
  const [loaded, setLoaded] = useState(false);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [syncError, setSyncError] = useState("");
  const [conflict, setConflict] = useState<CloudSnapshot | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [remoteGeneration, setRemoteGeneration] = useState(0);
  const current = useRef(data);
  const baseline = useRef<CloudMeta | null>(null);
  const ready = useRef(false);
  const hold = useRef(false);
  const writing = useRef(false);
  const reading = useRef(false);
  const booted = useRef(false);
  const legacyLocal = useRef<StudyData | null>(null);
  const mounted = useRef(false);
  const localWriteBlocked = useRef(false);

  const setData = useCallback((action: SetStateAction<StudyData>) => {
    const next = typeof action === "function" ? action(current.current) : action;
    current.current = next;
    updateData(next);
  }, []);
  const remember = useCallback((revision: number, fingerprint: string) => {
    baseline.current = { revision, fingerprint };
    if (!localWriteBlocked.current) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current.current, [CLOUD_META_KEY]: baseline.current })); }
      catch { setSaveError("此浏览器未能保存本地备份，请先导出题库备份。"); }
    }
  }, []);
  const adopt = useCallback((snapshot: CloudSnapshot) => {
    if (!snapshot.data) return;
    setData(snapshot.data);
    remember(snapshot.revision, studyFingerprint(snapshot.data));
    setRemoteGeneration(value => value + 1);
  }, [remember, setData]);
  const pauseForConflict = useCallback((snapshot: CloudSnapshot) => {
    hold.current = true;
    setConflict(snapshot);
    setStatus("conflict");
  }, []);

  const refresh = useCallback(async () => {
    if (reading.current || writing.current || document.querySelector("dialog[open]")) return;
    reading.current = true;
    try {
      const response = await fetch("/api/study", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("暂时连接不上云端，内容仍保存在此浏览器。");
      const snapshot = parseCloudSnapshot(await response.json());
      if (!mounted.current || writing.current || document.querySelector("dialog[open]")) return;
      // A GET started before our PUT may arrive after that PUT has succeeded.
      if (booted.current && baseline.current && snapshot.revision < baseline.current.revision) return;
      if (!booted.current) {
        const local = legacyLocal.current || studyFingerprint(current.current) !== studyFingerprint(makeInitialData()) ? current.current : null;
        const source = chooseInitialSource(local, snapshot, baseline.current);
        booted.current = true;
        ready.current = true;
        if (source === "conflict") { pauseForConflict(snapshot); return; }
        if (source === "remote") adopt(snapshot);
        else remember(snapshot.revision, snapshot.data ? studyFingerprint(snapshot.data) : "");
      } else if (hold.current && status === "conflict") {
        setConflict(snapshot);
        return;
      } else if (snapshot.revision !== baseline.current?.revision) {
        const dirty = studyFingerprint(current.current) !== baseline.current?.fingerprint;
        if (dirty && (!snapshot.data || studyFingerprint(snapshot.data) !== studyFingerprint(current.current))) { pauseForConflict(snapshot); return; }
        adopt(snapshot);
      }
      hold.current = false;
      setSyncError("");
      setStatus(studyFingerprint(current.current) === baseline.current?.fingerprint ? "synced" : "saving");
      setEpoch(value => value + 1);
    } catch (error) {
      if (!mounted.current) return;
      hold.current = true;
      setStatus("offline");
      setSyncError(error instanceof Error ? error.message : "云端同步暂时不可用，内容仍保存在此浏览器。");
    } finally { reading.current = false; }
  }, [adopt, pauseForConflict, remember, status]);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    mounted.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const local = removeUnusedExample(parseStudyData(raw)); legacyLocal.current = local; setData(local);
        const meta = (JSON.parse(raw) as Record<string, unknown>)[CLOUD_META_KEY] as CloudMeta | undefined;
        if (meta && Number.isSafeInteger(meta.revision) && meta.revision >= 0 && typeof meta.fingerprint === "string") baseline.current = meta;
      }
    } catch {
      localWriteBlocked.current = true;
      setSaveBlocked(true);
      setSaveError("本地题库读取失败，原数据已保留。请先导出已有备份，或从云端恢复。");
    }
    setLoaded(true);
    void refreshRef.current();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refreshRef.current(); }, 15000);
    const reconnect = () => { void refreshRef.current(); };
    window.addEventListener("focus", reconnect);
    window.addEventListener("online", reconnect);
    return () => { mounted.current = false; clearInterval(timer); window.removeEventListener("focus", reconnect); window.removeEventListener("online", reconnect); };
  }, [setData]);

  useEffect(() => {
    if (!loaded) return;
    localWriteBlocked.current = saveBlocked;
    if (saveBlocked) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, [CLOUD_META_KEY]: baseline.current })); setSaveError(""); }
    catch { setSaveError("此浏览器未能保存本地备份，请先导出题库备份。"); }
  }, [data, loaded, saveBlocked]);

  useEffect(() => {
    if (!loaded || !ready.current || hold.current || writing.current) return;
    const fingerprint = studyFingerprint(data);
    if (fingerprint === baseline.current?.fingerprint) return;
    setStatus("saving");
    const timer = setTimeout(async () => {
      if (writing.current || hold.current || !baseline.current) return;
      writing.current = true;
      const sent = current.current, sentFingerprint = studyFingerprint(sent);
      try {
        const response = await fetch("/api/study", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: baseline.current.revision, data: sent }), signal: AbortSignal.timeout(15000) });
        if (!mounted.current) return;
        if (response.status === 409) { pauseForConflict(parseCloudSnapshot(await response.json())); return; }
        if (!response.ok) throw new Error("云端暂未保存成功，内容仍保存在此浏览器，可稍后重试。");
        const result = await response.json() as { revision: number };
        if (!Number.isSafeInteger(result.revision) || result.revision <= baseline.current.revision) throw new Error("云端保存结果异常，请稍后重试。");
        remember(result.revision, sentFingerprint);
        setSyncError("");
        setStatus(studyFingerprint(current.current) === sentFingerprint ? "synced" : "saving");
      } catch (error) {
        if (!mounted.current) return;
        hold.current = true;
        setStatus("offline");
        setSyncError(error instanceof Error ? error.message : "云端暂未保存成功，内容仍保存在此浏览器。");
      } finally {
        writing.current = false;
        if (mounted.current) setEpoch(value => value + 1);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [data, epoch, loaded, pauseForConflict, remember]);

  function useRemote() {
    if (!conflict?.data) return;
    adopt(conflict);
    hold.current = false;
    setConflict(null);
    setSyncError("");
    setStatus("synced");
    setEpoch(value => value + 1);
  }
  function useLocal() {
    if (!conflict) return;
    remember(conflict.revision, conflict.data ? studyFingerprint(conflict.data) : "");
    hold.current = false;
    setConflict(null);
    setStatus("saving");
    setEpoch(value => value + 1);
  }
  return { data, setData, loaded, saveError, setSaveBlocked, status, syncError, conflict, useRemote, useLocal, retry: () => void refreshRef.current(), remoteGeneration };
}
