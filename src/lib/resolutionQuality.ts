// 기술지원 인입내역의 해결 절차를 챗봇 학습 데이터로 내보내기 전에 품질을 점검하는 순수 함수 모듈

export type QualityIssueCode = "too_short" | "no_order" | "personal_info" | "our_action";

export interface QualityIssue {
  /** 화면 칩에 뜨는 짧은 라벨 */
  code: QualityIssueCode;
  label: string;
  /** 수정 요청 본문에 들어갈 문장 */
  message: string;
}

const ORDER_MARK_REGEX = /(^|\s)(\d+\s*[).]|[①-⑳]|[-•*]\s)/;
const PHONE_REGEX = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
const BUSINESS_NUMBER_REGEX = /\d{3}[-\s]?\d{2}[-\s]?\d{5}/;
const OUR_ACTION_REGEX = /유선|통화|전화\s*(드림|드렸|안내|연결)|안내\s*(드림|드렸|함|완료)|콜백/;

const TOO_SHORT_ISSUE: QualityIssue = {
  code: "too_short",
  label: "내용이 너무 짧음",
  message:
    "해결 절차가 너무 짧아 다른 사람이 그대로 따라 할 수 없습니다. 어떤 화면에서 무엇을 눌렀는지 순서대로 적어주세요.",
};

const NO_ORDER_ISSUE: QualityIssue = {
  code: "no_order",
  label: "순서 구분 없음",
  message: "해결 절차가 한 덩어리로 적혀 있습니다. 1) 2) 3) 처럼 단계를 나눠 적어주세요.",
};

const PERSONAL_INFO_ISSUE: QualityIssue = {
  code: "personal_info",
  label: "개인정보 포함 의심",
  message:
    "해결 절차에 가맹점 이름이나 전화번호처럼 특정 정보로 보이는 내용이 있습니다. 챗봇이 다른 문의에도 그대로 답하게 되니 빼고 문제와 해결 순서만 남겨주세요.",
};

const OUR_ACTION_ISSUE: QualityIssue = {
  code: "our_action",
  label: "응대 행동이 절차로 적힘",
  message:
    "'유선으로 안내했다'처럼 우리가 한 행동이 해결 절차에 적혀 있습니다. 이런 내용은 처리 내용 칸에 적고, 해결 절차에는 무엇을 확인하고 어떻게 푸는지만 남겨주세요.",
};

export function inspectResolutionSteps(input: {
  steps: string;
  businessName?: string | null;
}): QualityIssue[] {
  const { steps, businessName } = input;
  const trimmed = steps.trim();

  // 공백뿐이면 다른 규칙을 돌릴 필요가 없으니 짧음 하나만 반환
  if (trimmed.length === 0) {
    return [TOO_SHORT_ISSUE];
  }

  const issues: QualityIssue[] = [];

  if (trimmed.length < 20) {
    issues.push(TOO_SHORT_ISSUE);
  }

  if (!steps.includes("\n") && trimmed.length >= 60 && !ORDER_MARK_REGEX.test(steps)) {
    issues.push(NO_ORDER_ISSUE);
  }

  const hasBusinessName =
    !!businessName &&
    businessName.trim().length >= 2 &&
    steps.toLowerCase().includes(businessName.trim().toLowerCase());
  if (PHONE_REGEX.test(steps) || BUSINESS_NUMBER_REGEX.test(steps) || hasBusinessName) {
    issues.push(PERSONAL_INFO_ISSUE);
  }

  if (OUR_ACTION_REGEX.test(steps)) {
    issues.push(OUR_ACTION_ISSUE);
  }

  return issues;
}

export function composeRevisionMessage(issues: QualityIssue[]): string {
  if (issues.length === 0) {
    return "";
  }

  const lines = issues.map((issue) => `- ${issue.message}`);
  return `해결 절차 품질 점검에서 아래 항목이 걸렸습니다. 해결 절차는 챗봇 학습에 쓰이니 확인 후 고쳐주세요.\n\n${lines.join("\n")}`;
}
