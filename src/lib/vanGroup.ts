import { KICC_VAN_COMPANY, type VanGroup } from "@/types";

export function parseVanList(value: string) {
  return value
    ? value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

// 판정 기준은 src/types/index.ts의 VAN 계열 정의를 따른다 (KICC 포함 → kicc, 값만 있음 → toss, 비어 있음 → null).
export function vanGroupOf(value: string | null | undefined): VanGroup | null {
  const list = parseVanList(value ?? "");
  if (list.length === 0) return null;
  if (list.includes(KICC_VAN_COMPANY)) return "kicc";
  return "toss";
}
