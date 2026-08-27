import { KICC_VAN_COMPANY } from "@/types";

/**
 * 목록에서 VAN사를 계열 색으로 보여준다. 필터 카드와 같은 규칙 — 토스계열 파랑, KICC 초록.
 * van_company는 "코세스2,코벤"처럼 쉼표로 여러 개일 수 있어 KICC 포함 여부로만 판정한다.
 */
export function VanBadge({ value, className = "" }: { value?: string | null; className?: string }) {
  const text = value?.trim();
  if (!text) return null;
  const isKicc = text.toUpperCase().includes(KICC_VAN_COMPANY);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
        isKicc
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-blue-200 bg-blue-50 text-blue-700"
      } ${className}`}
    >
      {text}
    </span>
  );
}
