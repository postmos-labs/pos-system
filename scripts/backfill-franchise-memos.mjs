// franchise_applications.memo 블롭 -> franchise_application_memos 정규화 백필
// 실행: node scripts/backfill-franchise-memos.mjs
// 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// 전제: 090_franchise_receipts_restructure.sql이 먼저 적용되어 franchise_application_memos 테이블이 있어야 함
//
// FranchiseClient.tsx의 parseMemoEntries/stripPin 로직을 그대로 포팅했다 (동작 일치가 목적이라 임의 개선 안 함).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ---- FranchiseClient.tsx 메모 파싱 로직 포팅 (원본과 동일하게 유지) ----
const PIN_RE = /^PIN:(\d+):/;
const LEGACY_PIN_MARKER = "PIN::";
const LEGACY_PIN_STAMP_LENGTH = 10;

function pinTimestampToIso(digits) {
  if (digits.length === LEGACY_PIN_STAMP_LENGTH) {
    const now = new Date();
    const month = Number(digits.slice(0, 2)) - 1;
    const day = Number(digits.slice(2, 4));
    const hour = Number(digits.slice(4, 6));
    const minute = Number(digits.slice(6, 8));
    const second = Number(digits.slice(8, 10));
    return new Date(now.getFullYear(), month, day, hour, minute, second).toISOString();
  }
  return new Date(Number(digits)).toISOString();
}

function stripPin(text) {
  const m = text.match(PIN_RE);
  if (m) return { pinned: true, pinnedAt: pinTimestampToIso(m[1]), text: text.slice(m[0].length) };
  if (text.startsWith(LEGACY_PIN_MARKER))
    return { pinned: true, pinnedAt: null, text: text.slice(LEGACY_PIN_MARKER.length) };
  return { pinned: false, pinnedAt: null, text };
}

function parseMemoEntries(memo, fallbackAt) {
  if (!memo?.trim()) return [];
  const re = /\[(.+?) (\d{2})\. (\d{2})\. (\d{2}):(\d{2})\]/g;
  const matches = [...memo.matchAll(re)];
  if (matches.length === 0) {
    const { pinned, pinnedAt, text } = stripPin(memo.trim());
    return [{ at: fallbackAt, user: "-", text, pinned, pinnedAt }];
  }
  const entries = [];
  const leadingRaw = memo.slice(0, matches[0].index).trim();
  if (leadingRaw) {
    const { pinned, pinnedAt, text } = stripPin(leadingRaw);
    entries.push({ at: fallbackAt, user: "-", text, pinned, pinnedAt });
  }
  matches.forEach((m, i) => {
    const [, userRaw, month, day, hour, minute] = m;
    const { pinned, pinnedAt, text: user } = stripPin(userRaw);
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : memo.length;
    const text = memo.slice(start, end).trim();
    if (!text) return;
    const now = new Date();
    const at = new Date(
      now.getFullYear(),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    ).toISOString();
    entries.push({ at, user, text, pinned, pinnedAt });
  });
  return entries;
}
// ---- 포팅 끝 ----

console.log("franchise_applications memo 조회 중...");
const { data: rows, error: rowsError } = await supabase
  .from("franchise_applications")
  .select("id, memo, created_at")
  .not("memo", "is", null)
  .neq("memo", "");
if (rowsError) {
  console.error("조회 실패:", rowsError.message);
  process.exit(1);
}
console.log(`memo 있는 건 ${rows.length}건`);

console.log("profiles 조회 중 (이름 매칭용)...");
const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, name");
if (profilesError) {
  console.error("조회 실패:", profilesError.message);
  process.exit(1);
}
const nameToIds = new Map();
for (const p of profiles) {
  if (!p.name) continue;
  if (!nameToIds.has(p.name)) nameToIds.set(p.name, []);
  nameToIds.get(p.name).push(p.id);
}
function resolveUserId(name) {
  if (!name || name === "-") return null;
  const ids = nameToIds.get(name.trim());
  return ids && ids.length === 1 ? ids[0] : null; // 동명이인/매칭없음이면 null (author_name에는 항상 원문 남김)
}

const toInsert = [];
let ambiguousCount = 0;
for (const row of rows) {
  const entries = parseMemoEntries(row.memo, row.created_at);
  for (const entry of entries) {
    const userId = resolveUserId(entry.user);
    if (entry.user !== "-" && nameToIds.has(entry.user.trim()) && !userId) ambiguousCount++;
    toInsert.push({
      franchise_application_id: row.id,
      user_id: userId,
      author_name: entry.user === "-" ? null : entry.user,
      content: entry.text,
      pinned_at: entry.pinned ? (entry.pinnedAt ?? entry.at) : null,
      created_at: entry.at,
    });
  }
}

console.log(`\n총 ${rows.length}건의 memo -> ${toInsert.length}개 항목으로 분해됨`);
console.log(`이름 매칭 모호(동명이인)해서 user_id를 못 채운 항목: ${ambiguousCount}건 (author_name은 남음)`);
console.log("\n[미리보기 5건]");
toInsert.slice(0, 5).forEach((r, i) => console.log(i + 1, JSON.stringify(r, null, 2)));

const readline = await import("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise((resolve) =>
  rl.question("\n계속 진행할까요? (y/N) ", (ans) => {
    rl.close();
    if (ans.trim().toLowerCase() !== "y") {
      console.log("취소됨");
      process.exit(0);
    }
    resolve();
  }),
);

const BATCH = 200;
let inserted = 0;
for (let i = 0; i < toInsert.length; i += BATCH) {
  const batch = toInsert.slice(i, i + BATCH);
  const { error } = await supabase.from("franchise_application_memos").insert(batch);
  if (error) {
    console.error(`배치 ${i}~${i + batch.length} 실패:`, error.message);
    process.exit(1);
  }
  inserted += batch.length;
  console.log(`${inserted}/${toInsert.length} 완료`);
}

console.log("백필 완료! (기존 franchise_applications.memo 컬럼은 그대로 보존됨)");
