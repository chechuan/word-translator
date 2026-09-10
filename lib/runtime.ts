const CACHE = new Map<string, { value: unknown; expiresAt: number }>();
const VISITS = new Map<string, number[]>();
export function readCache<T>(key: string): T | null { const entry = CACHE.get(key); if (!entry || entry.expiresAt < Date.now()) { CACHE.delete(key); return null; } return entry.value as T; }
export function writeCache(key: string, value: unknown, ttl = 86_400_000) { CACHE.set(key, { value, expiresAt: Date.now() + ttl }); }
export function allowRequest(ip: string) { const now = Date.now(); const recent = (VISITS.get(ip) ?? []).filter((time) => now - time < 60_000); if (recent.length >= 10) return false; recent.push(now); VISITS.set(ip, recent); return true; }
