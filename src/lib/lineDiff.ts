export type DiffLine = { kind: "same" | "removed" | "added"; text: string };

/** 두 텍스트를 줄 단위로 비교한다. 빈 텍스트는 줄 0개로 본다. 줄 끝 공백은 비교에서 무시한다. */
export function diffLines(before: string, after: string): DiffLine[] {
  const rawA = before === "" ? [] : before.split(/\r?\n/);
  const rawB = after === "" ? [] : after.split(/\r?\n/);
  const truncated = rawA.length > 400 || rawB.length > 400;
  const a = rawA.length > 400 ? rawA.slice(0, 400) : rawA;
  const b = rawB.length > 400 ? rawB.slice(0, 400) : rawB;
  const key = (s: string) => s.replace(/[ \t]+$/, "");

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (key(a[i]) === key(b[j])) {
      result.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      result.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < m) {
    result.push({ kind: "removed", text: a[i] });
    i++;
  }
  while (j < n) {
    result.push({ kind: "added", text: b[j] });
    j++;
  }

  if (truncated) result.push({ kind: "same", text: "… (이하 생략)" });
  return result;
}
