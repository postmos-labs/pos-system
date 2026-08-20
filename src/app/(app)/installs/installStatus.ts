// installations.status / delivery_type 라벨·색·순서 매핑. InstallsClient.tsx(표/필터)와
// InstallDetailDrawer.tsx(상태 뱃지·설치 진행 스테퍼)가 공유한다. InstallsClient.tsx가
// InstallDetailDrawer를 렌더링하고 InstallDetailDrawer는 이 상태 매핑이 필요해, 두 컴포넌트가
// 서로를 import하면 순환 참조가 생긴다 — 그래서 상태 매핑만 이 파일로 분리했다.
export const STATUS_LABELS: Record<string, string> = {
  received: "접수",
  preparing: "제품준비",
  scheduled: "일정확정",
  in_transit: "이동중",
  delivery_sent: "택배발송",
  completed: "설치완료",
  rejected: "반려",
};
export const STATUS_ORDER_INSTALL = [
  "received",
  "preparing",
  "scheduled",
  "in_transit",
  "completed",
];
export const STATUS_ORDER_DELIVERY = ["received", "preparing", "delivery_sent", "completed"];

export const STATUS_ORDER_AS = ["received", "scheduled", "in_transit", "completed"];
export const APPROVAL_TARGETS = new Set(["preparing", "scheduled", "delivery_sent"]);
export function statusOrderFor(deliveryType?: string) {
  if (deliveryType === "delivery") return STATUS_ORDER_DELIVERY;
  if (deliveryType === "as") return STATUS_ORDER_AS;
  return STATUS_ORDER_INSTALL;
}

export function statusLabel(status: string, deliveryType?: string) {
  if (status === "in_transit" && deliveryType === "delivery") return "택배발송";
  if (status === "completed" && deliveryType === "as") return "AS완료";
  if (status === "completed" && deliveryType === "delivery") return "완료";
  return STATUS_LABELS[status] ?? status;
}

export type DeliveryType = "install" | "delivery" | "as" | "name_change" | "transfer";
export const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  install: "설치",
  delivery: "택배발송",
  as: "AS",
  name_change: "명변",
  transfer: "전환",
};
export const DELIVERY_TYPE_BADGE_COLORS: Record<DeliveryType, string> = {
  install: "bg-blue-50 text-blue-600 border-blue-200",
  delivery: "bg-orange-50 text-orange-600 border-orange-200",
  as: "bg-purple-50 text-purple-600 border-purple-200",
  name_change: "bg-teal-50 text-teal-600 border-teal-200",
  transfer: "bg-pink-50 text-pink-600 border-pink-200",
};
export const DELIVERY_TYPE_SOLID_COLORS: Record<DeliveryType, string> = {
  install: "bg-blue-600 text-white border-blue-600",
  delivery: "bg-orange-500 text-white border-orange-500",
  as: "bg-purple-500 text-white border-purple-500",
  name_change: "bg-teal-500 text-white border-teal-500",
  transfer: "bg-pink-500 text-white border-pink-500",
};
export function deliveryTypeOf(value?: string): DeliveryType {
  return value === "delivery" || value === "as" || value === "name_change" || value === "transfer"
    ? value
    : "install";
}

export const STATUS_COLORS: Record<string, string> = {
  received: "bg-gray-100 text-gray-600 border-gray-200",
  preparing: "bg-blue-50 text-blue-600 border-blue-200",
  scheduled: "bg-purple-50 text-purple-600 border-purple-200",
  in_transit: "bg-amber-50 text-amber-600 border-amber-200",
  delivery_sent: "bg-amber-50 text-amber-600 border-amber-200",
  completed: "bg-green-50 text-green-600 border-green-200",
  rejected: "bg-red-50 text-red-600 border-red-200",
};
