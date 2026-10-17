import { NextResponse } from "next/server";
import { parseStudyData } from "@/lib/study";
import { personalStudyStore } from "@/lib/neon-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, max-age=0" };
function unavailable() {
  return NextResponse.json({ error: process.env.DATABASE_URL ? "云端暂时不可用，请稍后重试。本地内容会保留。" : "尚未连接个人云数据库，本地内容会保留。" }, { status: 503, headers });
}
export async function GET() {
  try { return NextResponse.json(await personalStudyStore().read(), { headers }); }
  catch { return unavailable(); }
}
export async function PUT(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "请求来源不匹配。" }, { status: 403, headers });
  let revision: number;
  let data;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4_000_000) return NextResponse.json({ error: "题库过大，请先导出备份。" }, { status: 413, headers });
    const input = JSON.parse(raw) as { revision: number; data: unknown };
    if (!Number.isSafeInteger(input.revision) || input.revision < 0 || input.revision >= Number.MAX_SAFE_INTEGER) throw new Error("版本号无效。");
    revision = input.revision;
    data = parseStudyData(JSON.stringify(input.data));
  } catch { return NextResponse.json({ error: "题库格式无效，未写入云端。" }, { status: 400, headers }); }
  try {
    const store = personalStudyStore();
    const result = await store.write(revision, data);
    return result ? NextResponse.json(result, { headers }) : NextResponse.json(await store.read(), { status: 409, headers });
  } catch { return unavailable(); }
}
