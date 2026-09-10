// 인입내역의 문의 내용과 해결 절차가 챗봇 학습 데이터로 쓸 만한지 판정하는 순수 함수 모듈.
//
// 챗봇은 두 가지를 한다. 사장님이 친 문장으로 비슷한 문제를 찾고(문의 내용), 찾은 절차를
// 사장님에게 그대로 안내한다(해결 절차). 규칙은 전부 이 두 용도에서 나왔다.
//   - 문의 내용은 "무엇이 어떻게"가 있어야 검색이 된다
//   - 해결 절차는 다른 가맹점에도 그대로 통해야 한다
//
// 관리자 모드·마스터 비밀번호는 사장님도 쓸 수 있으므로 잡지 않는다. 원격과 직원 전용 전산(밴
// 전산·파트너스)은 직원이 대신 한 일이라 잡는다. 사장님용 표현으로 다듬는 일은 정제 단계(프롬프트
// 7번 규칙)가 맡는다.
//
// 이 규칙은 등록·수정 화면에서 저장을 막는 데 쓰지 않는다. 마스터가 수정 요청을 돌릴 때와
// 챗봇 데이터로 내보낼 때만 적용한다. 응대 중 급하게 적는 사람을 붙잡지 않기 위해서다.

export type QualityIssueCode =
  | "title_no_subject"
  | "title_personal_info"
  | "too_short"
  | "too_few_steps"
  | "remote_access"
  | "staff_system"
  | "dangerous"
  | "our_action"
  | "personal_info";

export interface QualityIssue {
  code: QualityIssueCode;
  /** 화면 칩에 뜨는 짧은 라벨 */
  label: string;
  /** 수정 요청 본문에 들어갈 문장 */
  message: string;
}

// ── 문의 내용 ─────────────────────────────────────────────────────────────
// "포스 오류"는 모든 문제에 다 걸려 검색 열쇠가 못 된다. 무엇(대상)이 어떻게(증상·의도)
// 되는지 둘 다 있어야 통과다. 공백을 지운 뒤 비교하므로 "안 됨"과 "안됨"을 같이 잡는다.
const SUBJECT_WORDS = [
  "포스",
  "단말기",
  "결제기",
  "리더기",
  "프린터",
  "영수증",
  "라벨",
  "카드",
  "결제",
  "승인",
  "취소",
  "환불",
  "현금영수증",
  "메뉴",
  "주문",
  "배달",
  "배민",
  "요기요",
  "쿠팡",
  "인터넷",
  "공유기",
  "와이파이",
  "랜선",
  "케이블",
  "통신",
  "앱",
  "키오스크",
  "태블릿",
  "화면",
  "프로그램",
  "업데이트",
  "로그인",
  "계정",
  "비밀번호",
  "매출",
  "정산",
  "마감",
  "시재",
  "세금계산서",
  "사업자",
  "가맹점",
  "회원",
  "포인트",
  "쿠폰",
  "할인",
  "테이블",
  "주방",
  "바코드",
  "스캐너",
  "돈통",
  "서랍",
  "서명",
  "패드",
  "모니터",
  "전원",
  "부팅",
  "밴",
  "van",
  "프론트",
  "명의",
  "선불권",
  "스와이프",
  "테블릿",
  "데스크탑",
  "윈도우",
  "상품",
  "옵션",
  "사진",
  "이미지",
  "용량",
  "인증키",
  "서류",
  "qr",
  "nfc",
  "매장",
  "고유번호",
  "핸드폰",
  "asp",
  "토스",
  "유니온",
  "플릭",
  "아임유",
];

const INTENT_WORDS = [
  "안됨",
  "안됌",
  "않됨",
  "않됌",
  "안돼",
  "안되",
  "않되",
  "안됩",
  "안나옴",
  "안나와",
  "안들어",
  "안켜",
  "안찍",
  "안보",
  "안열",
  "안잡",
  "안읽",
  "안옴",
  "안와",
  "못함",
  "못하",
  "멈춤",
  "멈춰",
  "먹통",
  "오류",
  "에러",
  "느림",
  "느려",
  "꺼짐",
  "꺼져",
  "끊김",
  "끊겨",
  "튕김",
  "튕겨",
  "깨짐",
  "깜빡",
  "이상",
  "실패",
  "거절",
  "불가",
  "반복",
  "계속",
  "중복",
  "누락",
  "지연",
  "방법",
  "문의",
  "설정",
  "변경",
  "추가",
  "삭제",
  "연결",
  "등록",
  "교체",
  "재발급",
  "요청",
  "확인",
  "어떻게",
  "하고싶",
  "알려",
  "궁금",
  "연동",
  "신청",
  "사용법",
  "정리",
  "전환",
  "활성화",
  "조회",
  "없음",
  "나옴",
  "풀려",
  "넘어",
  "종료",
];

// ── 해결 절차 ─────────────────────────────────────────────────────────────
// 단계 구분자. 작성 예시는 ">"로 잇지만 줄바꿈이나 번호 줄로 적은 예전 건도 단계로 인정한다.
// "상품선택 - 결제 - 현금"처럼 양쪽 공백 있는 대시도 단계로 본다.
const STEP_SEPARATOR = /\n|>|＞|→|->|»|\s-\s/;
const STEP_MARKER = /^\s*(\d+\s*[).]|[①-⑳]|[-•*])\s*/;

// 대괄호 표기 규칙은 뺐다. 실제 108건 중 대괄호를 쓴 건이 1건이라 판별력이 없었다.

// 원격 접속은 직원이 대신 한 일이라 사장님이 따라 할 수 없다. 관리자 모드·마스터 비밀번호는
// 사장님도 쓸 수 있으므로 잡지 않는다. "1. 원격"처럼 한 단어로만 적힌 건도 직원이 붙은 것이므로
// "원격"이 있으면 잡되, 사장님이 하는 행동인 "원격 지원 요청·안내·접수" 꼴만 뺀다.
const REMOTE_ACCESS = /원격(?!\s*지원\s*(요청|안내|접수|을))/;

// 밴 전산·KOCES 전산·토스 파트너스는 직원만 들어갈 수 있다. 사장님이 따라 할 수 없는 단계다.
// "전산 장애"는 증상 서술이고 "쿠팡이츠 파트너스"는 점주가 쓰는 앱이라 잡지 않는다.
const STAFF_SYSTEM = /전산(?!\s*장애)|토스(플레이스)?\s*파트너스/;
// "고객센터에 요청하면 직원이 토스 파트너스에서 바꿔 드립니다"처럼 사장님이 요청하는 줄은
// 사장님이 할 수 있는 단계다. 같은 줄에 요청·문의·고객센터·안내가 있으면 직원 전산으로 보지 않는다.
const OWNER_REQUESTS = /요청|문의|고객센터|안내/;

/** 줄 단위로 직원 전산을 본다. 사장님이 요청하는 줄은 전산 이름이 있어도 넘긴다. */
function hasStaffSystemStep(steps: string): boolean {
  return steps.split(/\r?\n/).some((line) => STAFF_SYSTEM.test(line) && !OWNER_REQUESTS.test(line));
}

// 데이터가 지워질 수 있는 조작. "메뉴 삭제"처럼 정상적인 사용법은 잡지 않도록
// 삭제는 데이터·전체·모두 같은 말이 붙을 때만 본다.
const DANGEROUS = /초기화|포맷|재설치|공장\s*초기|(데이터|전체|모두|전부)\s*삭제/;
// 임시 파일·캐시·로그 파일 정리는 지워도 매출·설정이 남는 사장님용 작업이다. 그 줄에서는 위험으로 보지 않는다.
// "프로그램"에 "로그"가 들어가므로 로그는 파일·삭제·정리가 붙을 때만 본다.
const HARMLESS_CLEANUP = /temp|tmp|임시\s*파일|캐시|cache|로그\s*(파일|삭제|정리)/i;

/** 줄 단위로 위험 조작을 본다. 임시 파일 정리 줄은 "전체 삭제"라 적혀 있어도 넘긴다. */
function hasDangerousStep(steps: string): boolean {
  return steps.split(/\r?\n/).some((line) => DANGEROUS.test(line) && !HARMLESS_CLEANUP.test(line));
}

// 우리가 한 행동. "안내"는 예시 6의 "고객센터로 안내"처럼 정당한 마지막 단계라 빼고,
// 유선·통화·콜백과 "~드림/드렸/드릴/해드" 꼴만 잡는다.
const OUR_ACTION = /유선|통화|콜백|드림|드렸|드릴|해\s*드/;

// ── 개인정보 ─────────────────────────────────────────────────────────────
const PHONE = /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/;
const BUSINESS_NUMBER = /\d{3}[-\s]?\d{2}[-\s]?\d{5}/;
const CARD_NUMBER = /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}|\d{15,16}/;
const ACCOUNT_NUMBER = /계좌\s*(번호)?\s*[:：]?\s*[\d-]{8,}/;

const ISSUES: Record<QualityIssueCode, QualityIssue> = {
  title_no_subject: {
    code: "title_no_subject",
    label: "문의 내용 불명확",
    message:
      "문의 내용에 무엇이(포스·단말기·카드 등) 어떻게(안 됨·멈춤·방법 등) 되는지가 없습니다. '카드 결제가 안 됨'처럼 적어주세요.",
  },
  title_personal_info: {
    code: "title_personal_info",
    label: "문의 내용 개인정보",
    message: "문의 내용에 가맹점 이름이나 전화번호가 있습니다. 증상만 남겨주세요.",
  },
  too_short: {
    code: "too_short",
    label: "너무 짧음",
    message:
      "해결 절차가 너무 짧습니다. 어떤 화면에서 무엇을 누르는지 사장님이 따라 할 수 있게 적어주세요.",
  },
  too_few_steps: {
    code: "too_few_steps",
    label: "단계 없음",
    message:
      "해결 절차가 한 단계뿐입니다. '[설정] > [통신설정] > [재연결]'처럼 단계를 >로 나눠 적어주세요.",
  },
  remote_access: {
    code: "remote_access",
    label: "원격 조치",
    message:
      "원격 접속으로 처리한 내용이 절차에 있습니다. 사장님은 따라 할 수 없으니, 사장님이 직접 할 수 있는 확인까지만 적고 '원격 지원 요청'으로 끝내주세요.",
  },
  staff_system: {
    code: "staff_system",
    label: "직원 전산",
    message:
      "밴 전산·KOCES 전산·토스 파트너스처럼 직원만 들어갈 수 있는 전산에서 처리한 내용이 절차에 있습니다. 우리가 한 일은 처리 내용에 적고, 절차에는 '고객센터에 요청'처럼 사장님이 할 수 있는 말로 바꿔주세요.",
  },
  dangerous: {
    code: "dangerous",
    label: "위험 조작",
    message:
      "데이터가 지워질 수 있는 조작이 절차에 있습니다. 사장님이 직접 해도 되는 작업(임시 파일 정리 등)이면 어느 화면에서 무엇을 지우는지 정확히 적어주세요. 매출·설정이 지워지는 초기화·포맷·재설치면 '원격 지원 요청'으로 바꿔주세요.",
  },
  our_action: {
    code: "our_action",
    label: "응대 행동",
    message:
      "'유선으로 안내해드림'처럼 우리가 한 행동이 절차에 적혀 있습니다. 이건 처리 내용에 적고, 절차에는 사장님이 할 일만 남겨주세요.",
  },
  personal_info: {
    code: "personal_info",
    label: "개인정보",
    message:
      "해결 절차에 가맹점 이름, 전화번호, 카드번호 같은 특정 정보가 있습니다. 챗봇이 다른 가맹점에도 그대로 답하니 빼주세요.",
  },
};

const MIN_STEPS_LENGTH = 25;
const MIN_STEP_COUNT = 2;
const MIN_TITLE_LENGTH = 5;

/** 해결 절차를 단계로 나눈다. 구분자와 번호 표시를 떼고 빈 조각은 버린다. */
export function splitSteps(steps: string): string[] {
  return steps
    .split(STEP_SEPARATOR)
    .map((part) => part.replace(STEP_MARKER, "").trim())
    .filter((part) => part.length > 0);
}

function hasName(text: string, name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  if (trimmed.length < 2) return false;
  return text.toLowerCase().includes(trimmed.toLowerCase());
}

function hasPersonalNumber(text: string): boolean {
  return (
    PHONE.test(text) ||
    BUSINESS_NUMBER.test(text) ||
    CARD_NUMBER.test(text) ||
    ACCOUNT_NUMBER.test(text)
  );
}

export interface InspectInput {
  /** 문의 내용 (tickets.title) */
  title?: string | null;
  /** 해결 절차 (tickets.resolution_steps) */
  steps?: string | null;
  /** 이 건의 가맹점 상호. 본문에 그대로 들어갔는지 본다 */
  businessName?: string | null;
  /** 이 건의 가맹점 대표자명 */
  ownerName?: string | null;
}

/** 문의 내용만 판정한다. 비어 있으면 판정하지 않는다. */
export function inspectInquiry(input: InspectInput): QualityIssue[] {
  const title = (input.title ?? "").trim();
  if (!title) return [];

  const issues: QualityIssue[] = [];
  const compact = title.replace(/\s+/g, "").toLowerCase();
  const hasSubject = SUBJECT_WORDS.some((word) => compact.includes(word));
  const hasIntent = INTENT_WORDS.some((word) => compact.includes(word));
  if (compact.length < MIN_TITLE_LENGTH || !hasSubject || !hasIntent) {
    issues.push(ISSUES.title_no_subject);
  }
  if (
    hasPersonalNumber(title) ||
    hasName(title, input.businessName) ||
    hasName(title, input.ownerName)
  ) {
    issues.push(ISSUES.title_personal_info);
  }
  return issues;
}

/** 해결 절차만 판정한다. 비어 있으면 판정하지 않는다 — 안 적은 것과 잘못 적은 것은 다르다. */
export function inspectResolutionSteps(input: InspectInput): QualityIssue[] {
  const steps = input.steps ?? "";
  const trimmed = steps.trim();
  if (!trimmed) return [];

  const issues: QualityIssue[] = [];
  if (trimmed.length < MIN_STEPS_LENGTH) issues.push(ISSUES.too_short);
  if (splitSteps(steps).length < MIN_STEP_COUNT) issues.push(ISSUES.too_few_steps);
  if (REMOTE_ACCESS.test(steps)) issues.push(ISSUES.remote_access);
  if (hasStaffSystemStep(steps)) issues.push(ISSUES.staff_system);
  if (hasDangerousStep(steps)) issues.push(ISSUES.dangerous);
  if (OUR_ACTION.test(steps)) issues.push(ISSUES.our_action);
  if (
    hasPersonalNumber(steps) ||
    hasName(steps, input.businessName) ||
    hasName(steps, input.ownerName)
  ) {
    issues.push(ISSUES.personal_info);
  }
  return issues;
}

/**
 * 문의 내용과 해결 절차를 함께 판정한다. 챗봇 데이터로는 둘이 한 쌍이라 따로 볼 이유가 없다.
 * 해결 절차가 비어 있으면 문의 내용도 보지 않는다 — 절차 없는 건은 애초에 내보내기 대상이 아니다.
 */
export function inspectTicket(input: InspectInput): QualityIssue[] {
  if (!(input.steps ?? "").trim()) return [];
  return [...inspectInquiry(input), ...inspectResolutionSteps(input)];
}

export function composeRevisionMessage(issues: QualityIssue[]): string {
  if (issues.length === 0) return "";
  const lines = issues.map((issue) => `- ${issue.message}`);
  return `챗봇 학습 데이터 점검에서 아래 항목이 걸렸습니다. 문의 내용과 해결 절차는 챗봇이 사장님께 그대로 안내하는 데 쓰이니 확인 후 고쳐주세요.\n\n${lines.join("\n")}`;
}
