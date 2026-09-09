// 택배 발송 체크리스트 — "제품준비" 단계에서 실제로 보낼 장비와 수량을 확정한다.
//
// 완료 시 재고 차감은 installations.items를 그대로 쓰므로, 체크리스트를 저장할 때 items도
// 확정 수량으로 함께 덮어쓴다. 그래야 "택배 완료 수량 = 재고 출고 수량"이 지켜진다.
// 저장된 체크리스트 자체는 installations.delivery_checklist(JSONB, supabase/147)에 남긴다.

export interface DeliveryChecklistItem {
  name: string;
  quantity: number;
  checked: boolean;
}

export interface DeliveryChecklist {
  items: DeliveryChecklistItem[];
  /** 대체 장비·추가 케이블·중고 장비 같은 예외 사항 */
  note: string | null;
  saved_by: string | null;
  saved_by_name: string | null;
  saved_at: string | null;
}

/** 완료 시 비고에 자동으로 붙는 한 줄. 예: "택배처리 : 토스프론트1 + 영수증프린터1" */
export function formatDeliveryNoteLine(items: { name: string; quantity: number }[]): string {
  const parts = items
    .filter((item) => item.quantity > 0 && item.name.trim())
    .map((item) => `${item.name.trim()}${item.quantity}`);
  return parts.length ? `택배처리 : ${parts.join(" + ")}` : "";
}

/** 재고 이력 유형 — DB CHECK(supabase/147)와 같이 간다 */
export const INVENTORY_LOG_TYPES = [
  "in",
  "delivery_out",
  "install_out",
  "manual_out",
  "audit_adjust",
  "return",
] as const;
export type InventoryLogType = (typeof INVENTORY_LOG_TYPES)[number];

export const INVENTORY_LOG_TYPE_LABEL: Record<InventoryLogType, string> = {
  in: "입고",
  delivery_out: "택배출고",
  install_out: "설치출고",
  manual_out: "수동출고",
  audit_adjust: "실사조정",
  return: "회수",
};
