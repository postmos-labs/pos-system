import { KICC_VAN_COMPANY, NICE_VAN_COMPANY, type VanGroup } from "@/types";

export function parseVanList(value: string) {
  return value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

// 서버(PostgREST imatch)용 — 비어 있거나 KICC/NICE로만 이뤄진 값. 이 패턴에 안 맞고 값이 있으면 토스계열이다.
// 화면의 vanGroupsOf와 같은 의미여야 한다.
export const TOSS_ONLY_OTHER_PATTERN = "^[\\s,]*((KICC|NICE)([\\s,]+(KICC|NICE))*)?[\\s,]*$";

// 판정 기준은 src/types/index.ts의 VAN 계열 정의를 따른다 (포함 방식, 순서 toss·kicc·nice).
export function vanGroupsOf(value: string | null | undefined): VanGroup[] {
  const list = parseVanList(value ?? "").map((v) => v.toUpperCase());
  const groups: VanGroup[] = [];
  if (list.some((v) => v !== KICC_VAN_COMPANY && v !== NICE_VAN_COMPANY)) groups.push("toss");
  if (list.includes(KICC_VAN_COMPANY)) groups.push("kicc");
  if (list.includes(NICE_VAN_COMPANY)) groups.push("nice");
  return groups;
}

export function inVanGroup(value: string | null | undefined, group: VanGroup): boolean {
  return vanGroupsOf(value).includes(group);
}
