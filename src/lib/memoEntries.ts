// FranchiseClient.tsx와 같은 규칙의 메모 항목 고정·수정 함수. 공용 히스토리 창(MemoHistoryPanel)용.

// 스탬프(`[이름 YYYY. MM. DD. HH:mm]`, 연도 도입 전 옛 형식은 `[이름 MM. DD. HH:mm]`)가 붙은 항목뿐
// 아니라, 스탬프 도입 전에 저장된 맨 텍스트도 하나의 항목으로 살려서 반환한다
export const MEMO_STAMP_RE = /\[(.+?) (?:(\d{4})\. )?(\d{2})\. (\d{2})\. (\d{2}):(\d{2})\]/g;

// 핀 마커는 핀을 누른 시각을 epoch ms로 담아, 여러 개 고정됐을 때 "먼저 고정한 것"을 확실하게 구분한다
export const PIN_RE = /^PIN:(\d+):/;
// 이전에 잠깐 쓰였던 구버전 마커들. 기존에 저장된 데이터 호환을 위해 계속 인식한다
export const LEGACY_PIN_MARKER = "PIN::"; // 시각 정보 없음
export const LEGACY_PIN_STAMP_LENGTH = 10; // MMDDHHmmss (초 단위, 연도 없음)

export function nowPinStamp(): string {
  return String(Date.now());
}

// 구버전 MMDDHHmmss 포맷은 연도 없이 저장돼 있어 올해 기준으로 복원한다
export function pinTimestampToIso(digits: string): string {
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

// 마커가 붙어 있으면 그 뒤 텍스트를 반환하고, 없으면 null을 반환한다 (신규/구버전 포맷 모두 인식)
export function stripPinPrefix(text: string): string | null {
  if (text.startsWith(LEGACY_PIN_MARKER)) return text.slice(LEGACY_PIN_MARKER.length);
  const m = text.match(PIN_RE);
  return m ? text.slice(m[0].length) : null;
}

// 앞에 PIN 마커가 붙어 있으면 상단 고정된 항목이다. 표시용 텍스트에서는 마커를 떼어낸다
export function stripPin(text: string): {
  pinned: boolean;
  pinnedAt: string | null;
  text: string;
} {
  const m = text.match(PIN_RE);
  if (m) return { pinned: true, pinnedAt: pinTimestampToIso(m[1]), text: text.slice(m[0].length) };
  if (text.startsWith(LEGACY_PIN_MARKER))
    return { pinned: true, pinnedAt: null, text: text.slice(LEGACY_PIN_MARKER.length) };
  return { pinned: false, pinnedAt: null, text };
}

// 스탬프 순서대로 원본 텍스트(스탬프 포함)를 블록 단위로 쪼갠다.
// 특정 인덱스를 제외하고 다시 합치면 해당 메모 항목만 삭제된 원본 메모 문자열을 얻을 수 있다.
export function splitMemoBlocks(memo: string | undefined | null): string[] {
  if (!memo?.trim()) return [];
  const re = MEMO_STAMP_RE;
  const matches = [...memo.matchAll(re)];
  if (matches.length === 0) return [memo.trim()];
  const blocks: string[] = [];
  const leading = memo.slice(0, matches[0].index).trim();
  if (leading) blocks.push(leading);
  matches.forEach((m, i) => {
    const start = m.index!;
    const end = i + 1 < matches.length ? matches[i + 1].index! : memo.length;
    const block = memo.slice(start, end).trim();
    if (block) blocks.push(block);
  });
  return blocks;
}

// index번째 블록에 PIN 마커(핀 시각 포함)를 붙이거나 떼어내 상단 고정 여부를 토글한다
export function togglePinEntry(memo: string | undefined | null, index: number): string {
  const blocks = splitMemoBlocks(memo);
  const target = blocks[index];
  if (target === undefined) return blocks.join("\n");
  const stampRe = /^\[(.+?) (\d{2})\. (\d{2})\. (\d{2}):(\d{2})\]/;
  const m = target.match(stampRe);
  if (m) {
    const user = m[1];
    const unpinned = stripPinPrefix(user);
    const newUser = unpinned !== null ? unpinned : `PIN:${nowPinStamp()}:${user}`;
    blocks[index] = `[${newUser} ${m[2]}. ${m[3]}. ${m[4]}:${m[5]}]${target.slice(m[0].length)}`;
  } else {
    const unpinned = stripPinPrefix(target);
    blocks[index] = unpinned !== null ? unpinned : `PIN:${nowPinStamp()}:${target}`;
  }
  return blocks.join("\n");
}

// index번째 항목의 내용만 바꾼다. 스탬프(작성자·시각)와 고정 마커는 그대로 둔다.
export function updateMemoEntry(
  memo: string | undefined | null,
  index: number,
  newText: string,
): string {
  const blocks = splitMemoBlocks(memo);
  const target = blocks[index];
  const text = newText.trim();
  if (target === undefined || !text) return blocks.join("\n");
  const stamp = target.match(/^\[(.+?) (?:\d{4}\. )?\d{2}\. \d{2}\. \d{2}:\d{2}\]/);
  if (stamp) {
    blocks[index] = `${stamp[0]} ${text}`;
  } else {
    // 스탬프 없는 옛 메모: 고정 마커가 있으면 보존한다.
    const pin =
      target.match(PIN_RE)?.[0] ?? (target.startsWith(LEGACY_PIN_MARKER) ? LEGACY_PIN_MARKER : "");
    blocks[index] = `${pin}${text}`;
  }
  return blocks.join("\n");
}
