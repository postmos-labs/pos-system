import { SolapiMessageService, type KakaoButton } from "solapi";
import type { ApplicantType } from "@/types";

const service = new SolapiMessageService(
  process.env.SOLAPI_API_KEY!,
  process.env.SOLAPI_API_SECRET!,
);

function kakaoOptions(
  templateEnvKey: string,
  variables: Record<string, string>,
  buttons?: KakaoButton[],
) {
  const pfId = process.env.SOLAPI_KAKAO_PFID;
  const templateId = process.env[templateEnvKey];
  if (!pfId || !templateId) {
    const msg = `알림톡 환경변수 누락: pfId=${!!pfId} ${templateEnvKey}=${!!templateId}`;
    console.error("[solapi]", msg);
    throw new Error(msg);
  }
  console.log(`[solapi] sending pfId=${pfId} templateId=${templateId}`);
  return { pfId, templateId, variables, disableSms: true, ...(buttons ? { buttons } : {}) };
}

async function solapiSend(params: {
  to: string;
  from: string;
  text: string;
  kakaoOptions: ReturnType<typeof kakaoOptions>;
}) {
  try {
    const result = await service.send(params);
    const failed = result?.failedMessageList;
    if (failed?.length) {
      const firstErr = failed[0];
      const msg = firstErr?.statusMessage ?? JSON.stringify(firstErr);
      console.error("[solapi] failedMessageList:", JSON.stringify(failed));
      throw Object.assign(new Error(msg), { failedMessageList: failed });
    }
    return result;
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "failedMessageList" in e) throw e;
    try {
      const dump: Record<string, unknown> = {};
      if (typeof e === "object" && e !== null) {
        const errorRecord = e as Record<string, unknown>;
        for (const k of Object.getOwnPropertyNames(e)) dump[k] = errorRecord[k];
      }
      console.error("[solapi] error dump:", JSON.stringify(dump, null, 2));
    } catch {
      console.error("[solapi] raw error:", String(e));
    }
    throw e;
  }
}

const origin = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "https://pos-system-beta-eight.vercel.app").replace(
    /\/$/,
    "",
  );

export async function sendSignRequest({
  signerPhone,
  signerName,
  contractTitle,
  signToken,
}: {
  signerPhone: string;
  signerName: string;
  contractTitle: string;
  signToken: string;
}) {
  if (!signerPhone) return;
  const signUrl = `${origin()}/sign/${signToken}`;
  const text = `[서명 요청]\n${signerName}님, "${contractTitle}" 계약서 서명을 요청드립니다.\n\n${signUrl}`;
  const ko = kakaoOptions("SOLAPI_KAKAO_TEMPLATE_SIGN_REQUEST", {
    "#{고객명}": signerName,
    "#{계약서명}": contractTitle,
    "#{서명토큰}": signToken,
  });
  if (!ko) return;
  await solapiSend({
    to: signerPhone,
    from: process.env.SOLAPI_SENDER!,
    text,
    kakaoOptions: ko,
  });
}

const CORPORATE_DOCS = [
  "대표자 신분증",
  "사업자 통장 사본",
  "사업자등록증",
  "영업신고증 (음식점에 한함)",
  "법인 등기부등본 (3개월 이내 발급)",
  "법인 인감증명서 (3개월 이내 발급)",
  "주주명부 (3개월 이내 발급)",
  "사업장 외부 사진 2장",
  "사업장 내부 사진 2장",
];

const INDIVIDUAL_DOCS = [
  "대표자 신분증",
  "사업자 통장 사본",
  "사업자등록증",
  "영업신고증 (음식점에 한함)",
  "사업장 외부 사진 2장",
  "사업장 내부 사진 2장",
];

const FRANCHISE_DOCS: Record<ApplicantType, string[]> = {
  corporate: CORPORATE_DOCS,
  individual: INDIVIDUAL_DOCS,
  giga_corporate: CORPORATE_DOCS,
  giga_individual: INDIVIDUAL_DOCS,
};

export type DocCase = "both" | "business_only" | "owner_only" | "phone_only";

export function docCaseOf(ownerName?: string, businessName?: string): DocCase {
  if (ownerName && businessName) return "both";
  if (businessName) return "business_only";
  if (ownerName) return "owner_only";
  return "phone_only";
}

const FRANCHISE_TEMPLATE_ENV_KEY: Record<ApplicantType, Record<DocCase, string>> = {
  individual: {
    both: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_INDIVIDUAL_BOTH",
    business_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_INDIVIDUAL_BUSINESS_ONLY",
    owner_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_INDIVIDUAL_OWNER_ONLY",
    phone_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_INDIVIDUAL_PHONE_ONLY",
  },
  corporate: {
    both: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_CORPORATE_BOTH",
    business_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_CORPORATE_BUSINESS_ONLY",
    owner_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_CORPORATE_OWNER_ONLY",
    phone_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_CORPORATE_PHONE_ONLY",
  },
  giga_individual: {
    both: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_INDIVIDUAL_BOTH",
    business_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_INDIVIDUAL_BUSINESS_ONLY",
    owner_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_INDIVIDUAL_OWNER_ONLY",
    phone_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_INDIVIDUAL_PHONE_ONLY",
  },
  giga_corporate: {
    both: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_CORPORATE_BOTH",
    business_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_CORPORATE_BUSINESS_ONLY",
    owner_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_CORPORATE_OWNER_ONLY",
    phone_only: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_GIGA_CORPORATE_PHONE_ONLY",
  },
};

export async function sendFranchiseDocRequest({
  phone,
  ownerName,
  businessName,
  applicantType,
  docCase: docCaseOverride,
}: {
  phone: string;
  ownerName?: string;
  businessName?: string;
  applicantType: ApplicantType;
  docCase?: DocCase;
}): Promise<boolean> {
  if (!phone) return false;
  const docList = FRANCHISE_DOCS[applicantType].map((d) => `- ${d}`).join("\n");
  const photoNote =
    "\n* 간판이 없는 경우, 건물에 부착된 도로명주소 표지판 사진으로 대체 가능합니다.";
  const greeting =
    ownerName && businessName
      ? `${ownerName}님, "${businessName}" 카드 가맹 신청을 위해 아래 서류를 준비해주세요.`
      : businessName
        ? `"${businessName}" 카드 가맹 신청을 위해 아래 서류를 준비해주세요.`
        : ownerName
          ? `${ownerName}님, 카드 가맹 신청을 위해 아래 서류를 준비해주세요.`
          : `카드 가맹 신청을 위해 아래 서류를 준비해주세요.`;
  const text = `[가맹 서류 안내]\n${greeting}\n\n제출 서류\n${docList}${photoNote}`;

  const docCase = docCaseOverride ?? docCaseOf(ownerName, businessName);
  const ko = kakaoOptions(FRANCHISE_TEMPLATE_ENV_KEY[applicantType][docCase], {
    ...(ownerName ? { "#{고객명}": ownerName } : {}),
    ...(businessName ? { "#{상호명}": businessName } : {}),
  });
  if (!ko) return false;
  await solapiSend({
    to: phone,
    from: process.env.SOLAPI_SENDER!,
    text,
    kakaoOptions: ko,
  });
  return true;
}

type FranchiseStatusUpdateKind =
  | "doc_waiting"
  | "doc_incomplete"
  | "card_apply_done"
  | "internet_apply_done"
  | "card_done"
  | "internet_done"
  | "toss_review_apply_done"
  | "toss_review_done";

const FRANCHISE_STATUS_TEXT: Record<FranchiseStatusUpdateKind, string> = {
  doc_waiting:
    "가맹 신청이 접수되었습니다. 서류 준비를 부탁드립니다. 담당자가 곧 안내드리겠습니다.",
  doc_incomplete: "제출하신 서류에 보완이 필요합니다. 담당자에게 문의해주세요.",
  card_apply_done: "카드가맹 접수가 완료되었습니다. 심사가 진행됩니다.",
  internet_apply_done: "인터넷 가입 접수가 완료되었습니다.",
  card_done: "카드가맹이 완료되었습니다.",
  internet_done: "인터넷 가입이 완료되었습니다.",
  toss_review_apply_done: "토스 심사 접수가 완료되었습니다. 심사가 진행됩니다.",
  toss_review_done: "토스 심사가 완료되었습니다. 곧 기술지원팀에서 설치 일정을 안내드립니다.",
};

const FRANCHISE_STATUS_TEMPLATE_ENV_KEY: Record<FranchiseStatusUpdateKind, string> = {
  doc_waiting: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_WAITING",
  doc_incomplete: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_DOC_INCOMPLETE",
  card_apply_done: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_CARDAPPLY_DONE",
  internet_apply_done: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_INTERNET_APPLY_DONE",
  card_done: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_CARD_DONE",
  internet_done: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_INTERNET_DONE",
  toss_review_apply_done: "SOLAPI_KAKAO_TEMPLATE_FRANCHISE_TOSSAPPLY_DONE",
  toss_review_done: "SOLAPI_KAKAO_TEMPLATE_FRANCHISEDONE",
};

export async function sendFranchiseStatusUpdate({
  phone,
  ownerName,
  businessName,
  status,
  equipmentSelectToken,
}: {
  phone: string;
  ownerName?: string | null;
  businessName?: string | null;
  status: FranchiseStatusUpdateKind;
  equipmentSelectToken?: string;
}): Promise<boolean> {
  if (!phone) return false;
  const name = ownerName || businessName || "고객";
  const biz = businessName || ownerName || name;
  const text = `[가맹 진행 안내]\n${name}님, "${biz}" 가맹 진행상황을 안내드립니다.\n${FRANCHISE_STATUS_TEXT[status]}`;

  const variables: Record<string, string> = { "#{고객명}": name, "#{상호명}": biz };
  if (status === "toss_review_done" && equipmentSelectToken) {
    variables["#{링크}"] =
      `${origin().replace(/^https?:\/\//, "")}/equipment-select/${equipmentSelectToken}`;
  }

  if (!process.env[FRANCHISE_STATUS_TEMPLATE_ENV_KEY[status]]) {
    console.warn(
      `[solapi] 가맹 상태(${status}) 알림톡 템플릿 미설정 — 발송 스킵 (상태 변경은 정상 반영됨)`,
    );
    return false;
  }
  const ko = kakaoOptions(FRANCHISE_STATUS_TEMPLATE_ENV_KEY[status], variables);
  if (!ko) return false;
  await solapiSend({
    to: phone,
    from: process.env.SOLAPI_SENDER!,
    text,
    kakaoOptions: ko,
  });
  return true;
}

const INSTALL_STATUS_TEMPLATE: Record<string, string> = {
  scheduled: "SOLAPI_KAKAO_TEMPLATE_INSTALL_SCHEDULED",
  completed: "SOLAPI_KAKAO_TEMPLATE_INSTALL_COMPLETED",
  delivery_sent: "SOLAPI_KAKAO_TEMPLATE_INSTALL_DELIVERY_SENT",
};

const INSTALL_STATUS_TEXT: Record<string, string> = {
  preparing: "제품 준비가 시작되었습니다. 곧 배송 또는 설치 일정을 안내드리겠습니다.",
  scheduled: "설치 일정이 확정되었습니다.",
  in_transit: "기사님이 이동 중입니다. 잠시 후 방문 예정입니다.",
  completed: "설치가 완료되었습니다. 이용해 주셔서 감사합니다.",
  delivery_sent:
    "제품이 발송되었습니다. 영업일 기준 1~3일 내 도착 예정입니다.\n배송조회: https://www.ilogen.com/web/personal/tkSearch\n포스기 토스프론트 연결 방법: https://www.youtube.com/watch?v=fXNyqMBNEcI\n태블릿 토스프론트 설치 방법: https://www.youtube.com/watch?v=Hib-gY38TQg\n다른 문의사항 영상보기: https://www.youtube.com/@posmos",
};

const INSTALL_IN_TRANSIT_ETA_TEMPLATE_ENV = "SOLAPI_KAKAO_TEMPLATE_INSTALL_IN_TRANSIT_ETA";

const INSTALL_PREPARING_SCHEDULE_TEMPLATE_ENV = "SOLAPI_KAKAO_TEMPLATE_INSTALL_PREPARING_SCHEDULE";

export async function sendInstallStatusUpdate({
  phone,
  customerName,
  status,
  eta,
  statusToken,
  scheduledDate,
  scheduledTime,
  trackingNumber,
}: {
  phone: string;
  customerName: string;
  status: string;
  eta?: string;
  statusToken?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  trackingNumber?: string;
}) {
  if (!phone || !INSTALL_STATUS_TEXT[status]) return false;
  const etaNote = status === "in_transit" && eta ? ` (도착 예정 시각: ${eta})` : "";
  const scheduleNote =
    status === "scheduled" && (scheduledDate || scheduledTime)
      ? ` (${[scheduledDate, scheduledTime].filter(Boolean).join(" ")})`
      : "";
  const text = `[설치/배송 안내]\n${customerName}님, ${INSTALL_STATUS_TEXT[status]}${etaNote}${scheduleNote}`;

  let ko;
  if (status === "in_transit") {
    if (!eta) {
      console.warn("[solapi] 이동중 알림톡: 예정시각 없이는 발송하지 않음");
      return false;
    }
    ko = kakaoOptions(INSTALL_IN_TRANSIT_ETA_TEMPLATE_ENV, {
      "#{고객명}": customerName,
      "#{예정시각}": eta,
    });
  } else if (status === "preparing") {
    if (!statusToken) {
      console.warn("[solapi] 제품준비 알림톡: statusToken 없이는 발송하지 않음");
      return false;
    }

    const linkNoProtocol = `${origin().replace(/^https?:\/\//, "")}/install-status/${statusToken}`;
    ko = kakaoOptions(INSTALL_PREPARING_SCHEDULE_TEMPLATE_ENV, {
      "#{고객명}": customerName,
      "#{링크}": linkNoProtocol,
    });
  } else if (status === "scheduled") {
    if (!process.env[INSTALL_STATUS_TEMPLATE.scheduled]) {
      console.warn(
        "[solapi] 설치 일정확정 알림톡 템플릿 미설정 — 발송 스킵 (상태 변경은 정상 반영됨)",
      );
      return false;
    }

    ko = kakaoOptions(INSTALL_STATUS_TEMPLATE.scheduled, {
      "#{고객명}": customerName,
      "#{예정일}": scheduledDate || "",
      "#{예정시각}": scheduledTime || "",
    });
  } else if (status === "delivery_sent") {
    ko = kakaoOptions(INSTALL_STATUS_TEMPLATE.delivery_sent, {
      "#{고객명}": customerName,
      "#{송장번호}": trackingNumber || "",
    });
  } else {
    ko = kakaoOptions(INSTALL_STATUS_TEMPLATE[status], { "#{고객명}": customerName });
  }
  if (!ko) return false;
  const result = await solapiSend({
    to: phone,
    from: process.env.SOLAPI_SENDER!,
    text,
    kakaoOptions: ko,
  });
  return result.groupInfo.groupId;
}

export async function sendSignComplete({
  signerPhone,
  signerName,
  contractTitle,
}: {
  signerPhone: string;
  signerName: string;
  contractTitle: string;
}) {
  if (!signerPhone) return;
  const text = `[서명 완료]\n${signerName}님, "${contractTitle}" 계약서 서명이 완료되었습니다.`;
  const ko = kakaoOptions("SOLAPI_KAKAO_TEMPLATE_SIGN_COMPLETE", {
    "#{고객명}": signerName,
    "#{계약서명}": contractTitle,
  });
  if (!ko) return;
  await solapiSend({
    to: signerPhone,
    from: process.env.SOLAPI_SENDER!,
    text,
    kakaoOptions: ko,
  });
}
