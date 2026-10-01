// 가맹접수 통화기록창의 재상담·취소 알림 — 화면과 서버 액션이 함께 쓰는 타입과 규칙.
// 설정은 supabase/157의 franchise_call_alert_settings에 이벤트당 한 행으로 저장된다.

export type FranchiseCallAlertEvent = "reconsult" | "cancel";

export const FRANCHISE_CALL_ALERT_EVENTS: FranchiseCallAlertEvent[] = ["reconsult", "cancel"];

export const FRANCHISE_CALL_ALERT_EVENT_LABEL: Record<FranchiseCallAlertEvent, string> = {
  reconsult: "재상담",
  cancel: "취소",
};

// notifications.type 값. 팝업 버튼 문구(RealtimeNotification)도 이 값으로 고른다.
export const FRANCHISE_CALL_ALERT_NOTIFICATION_TYPE: Record<FranchiseCallAlertEvent, string> = {
  reconsult: "franchise_reconsult",
  cancel: "franchise_canceled",
};

export interface FranchiseCallAlertSetting {
  event: FranchiseCallAlertEvent;
  recipient_ids: string[];
  // 이 건의 담당 영업 / 담당 CS에게도 보낼지
  notify_sales: boolean;
  notify_cs: boolean;
}

export interface FranchiseCallAlertCandidate {
  id: string;
  name: string;
  team: string | null;
  position: string | null;
}

export interface FranchiseCallAlertConfig {
  settings: Record<FranchiseCallAlertEvent, FranchiseCallAlertSetting>;
  candidates: FranchiseCallAlertCandidate[];
  canEdit: boolean;
  // supabase/157이 아직 적용되지 않아 설정 표가 없을 때 true
  missingTable: boolean;
  error: string | null;
}

export function emptyFranchiseCallAlertSetting(
  event: FranchiseCallAlertEvent,
): FranchiseCallAlertSetting {
  return { event, recipient_ids: [], notify_sales: false, notify_cs: false };
}

// 알림 받을 사람을 바꿀 수 있는 사람: 관리자·마스터, CS책임·팀장.
// 설정 화면의 편집 가능 여부와 저장 서버 액션의 가드가 모두 이 함수 하나를 쓴다.
export function canEditFranchiseCallAlerts(
  role?: string | null,
  approvalRole?: string | null,
): boolean {
  if (role === "admin" || role === "master") return true;
  return approvalRole === "cs_responsible" || approvalRole === "team_lead";
}

// 실제로 알림을 받을 사람 id. 중복을 없애고, 처리한 본인은 뺀다.
export function resolveFranchiseCallAlertRecipients(
  setting: FranchiseCallAlertSetting,
  row: { sales_id?: string | null; cs_id?: string | null },
  actorId: string,
): string[] {
  const ids = new Set(setting.recipient_ids);
  if (setting.notify_sales && row.sales_id) ids.add(row.sales_id);
  if (setting.notify_cs && row.cs_id) ids.add(row.cs_id);
  ids.delete(actorId);
  return [...ids];
}
