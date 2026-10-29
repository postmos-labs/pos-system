// 가맹점 리서치 설문 항목. 키는 supabase/157_franchise_surveys.sql의 CHECK 제약과 같이 간다.
// tag·title은 설문 페이지에만 나온다. 알림톡 본문에는 넣지 않으므로 바꿔도 카카오 재검수는 필요 없다.

export const SURVEY_ITEM_KEYS = ["water_purifier", "baemin", "table_order", "kiosk"] as const;
export type SurveyItemKey = (typeof SURVEY_ITEM_KEYS)[number];

export const SURVEY_ITEMS: Record<SurveyItemKey, { tag: string; title: string; short: string }> = {
  water_purifier: { tag: "고정비 절감", title: "위약금 없는 반값 정수기", short: "정수기" },
  baemin: { tag: "즉시 현금 혜택", title: "배민 접수만 해도 5만 원 지원", short: "배민" },
  table_order: {
    tag: "초특가 고효율",
    title: "부담 없는 월 1만 원 테이블오더",
    short: "테이블오더",
  },
  kiosk: { tag: "업계 최저", title: "전국 최저가 키오스크", short: "키오스크" },
};

// 링크 유효 기간. 재발송하면 그 시점부터 다시 센다.
export const SURVEY_VALID_DAYS = 7;

export function isSurveyItemKey(value: unknown): value is SurveyItemKey {
  return typeof value === "string" && (SURVEY_ITEM_KEYS as readonly string[]).includes(value);
}

export type FranchiseSurvey = {
  id: string;
  franchise_application_id: string;
  token: string;
  sent_at: string | null;
  sent_by: string | null;
  sent_by_name: string | null;
  send_count: number;
  expires_at: string | null;
  opened_at: string | null;
  entry_item: SurveyItemKey | null;
  picks: SurveyItemKey[] | null;
  submitted_at: string | null;
  contacted_at: string | null;
  contacted_by_name: string | null;
  created_at: string;
  updated_at: string;
};

// 화면에 보일 진행 단계. 연락완료 > 응답 > 열람 > 발송 순으로 앞선 것을 쓴다.
export type SurveyStage = "contacted" | "submitted" | "opened" | "sent" | "not_sent";

export const SURVEY_STAGE_LABEL: Record<SurveyStage, string> = {
  contacted: "연락완료",
  submitted: "응답",
  opened: "열람만",
  sent: "발송",
  not_sent: "미발송",
};

export function surveyStageOf(survey: FranchiseSurvey | null | undefined): SurveyStage {
  if (!survey || !survey.sent_at) return "not_sent";
  if (survey.contacted_at) return "contacted";
  if (survey.submitted_at) return "submitted";
  if (survey.opened_at) return "opened";
  return "sent";
}

export function isSurveyExpired(survey: Pick<FranchiseSurvey, "expires_at">, now = Date.now()) {
  return !!survey.expires_at && new Date(survey.expires_at).getTime() < now;
}
