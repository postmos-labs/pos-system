// 설치 방식 — 방문설치 / 자가설치 / 외부기사 설치 (supabase/160).
//
// 설치·전환 건을 "어떻게 설치하느냐"로 나눈다. 구분(delivery_type: 설치·AS·명변·전환·택배발송)과는 별개 축이다.
// 자가설치·외부기사는 택배로 보내고 [택배발송] 한 번(승인 없음)으로 끝난다(completeShipment).
// 외부기사 건은 고객 알림톡을 보내지 않는다.
//
// install_method가 비어 있는 기존 건은 delivery_type으로 대신 판단한다 — 기존 데이터는 건드리지 않는다.
//   택배발송(delivery) → 자가설치, 설치(install)·전환(transfer) → 방문설치, AS·명변 → 방식 없음
//
// 저장 규칙: 방식은 install_method에만 적는다. delivery_type은 만들 때 정한 값(설치·전환)을 그대로 두어
// 설치관리에서 방식을 자가·외부기사로 바꿔도 탭이 옮겨지지 않고 보던 자리에 남는다.
// 설치관리·택배발송 탭의 소속은 delivery_type이 정하고, install_method는 흐름(택배 여부)만 정한다.

export const INSTALL_METHODS = ["visit", "self", "external"] as const;
export type InstallMethod = (typeof INSTALL_METHODS)[number];

export const INSTALL_METHOD_LABEL: Record<InstallMethod, string> = {
  visit: "방문설치",
  self: "자가설치",
  external: "외부기사",
};

export const INSTALL_METHOD_BADGE: Record<InstallMethod, string> = {
  visit: "bg-blue-50 text-blue-700 border-blue-200",
  self: "bg-orange-50 text-orange-700 border-orange-200",
  external: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

type MethodSource = { delivery_type?: string | null; install_method?: string | null };

export function isInstallMethod(value: unknown): value is InstallMethod {
  return typeof value === "string" && (INSTALL_METHODS as readonly string[]).includes(value);
}

/** 설치 방식. AS·명변처럼 방식이 없는 건은 null. */
export function installMethodOf(row: MethodSource): InstallMethod | null {
  const type = row.delivery_type ?? "install";
  if (!["install", "delivery", "transfer"].includes(type)) return null;
  if (isInstallMethod(row.install_method)) return row.install_method;
  return type === "delivery" ? "self" : "visit";
}

/** 택배로 보내는 건(자가설치·외부기사)인지 — [택배발송] 한 번으로 끝나는 흐름. */
export function isShippingFlow(row: MethodSource): boolean {
  const method = installMethodOf(row);
  return method === "self" || method === "external";
}

/**
 * 진행 단계·상태 라벨을 고를 때 쓰는 구분값. 택배 흐름이면 "delivery", 아니면 원래 delivery_type.
 * statusOrderFor / statusLabel 등 delivery_type 문자열을 받는 기존 함수에 그대로 넘기면 된다.
 */
export function flowDeliveryType(row: MethodSource): string {
  return isShippingFlow(row) ? "delivery" : (row.delivery_type ?? "install");
}

/** 방식을 바꿀 때 delivery_type을 어떻게 둘지. 등록 폼·이관 승인에서 쓴다(변경 액션은 delivery_type을 건드리지 않는다). */
export function deliveryTypeForMethod(currentType: string, method: InstallMethod): string {
  if (currentType === "transfer") return "transfer";
  return method === "visit" ? "install" : "delivery";
}

/** install_method 칸이 아직 없을 때(160 미적용) 나는 오류인지. */
export function isMissingInstallMethodColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /install_method/i.test(error.message ?? "")
  );
}

/**
 * 이관 최종 승인·설치건 등록에서 고르는 "구분 + 방식" 조합.
 * 값은 `${delivery_type}:${install_method}` 또는 방식이 없는 구분은 delivery_type만.
 */
export const WORK_TYPE_OPTIONS = [
  { value: "install:visit", label: "방문설치" },
  { value: "install:self", label: "자가설치 (택배)" },
  { value: "install:external", label: "외부기사 설치 (택배)" },
  { value: "transfer:visit", label: "전환 · 방문설치" },
  { value: "transfer:self", label: "전환 · 자가설치 (택배)" },
  { value: "transfer:external", label: "전환 · 외부기사 (택배)" },
  { value: "as", label: "AS" },
  { value: "name_change", label: "명변" },
] as const;

/** WORK_TYPE_OPTIONS 값 → 저장할 delivery_type / install_method */
export function parseWorkType(value: string): {
  deliveryType: string;
  installMethod: InstallMethod | null;
} | null {
  const [type, method] = value.split(":");
  if (!type) return null;
  if (!method) {
    return ["as", "name_change"].includes(type)
      ? { deliveryType: type, installMethod: null }
      : null;
  }
  if (!["install", "transfer"].includes(type) || !isInstallMethod(method)) return null;
  return { deliveryType: deliveryTypeForMethod(type, method), installMethod: method };
}
