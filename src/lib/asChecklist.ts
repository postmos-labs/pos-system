// POSMOS 직원 업무 체크리스트 (AS/CS 응대 원칙)
// 설치 완료 이후 가맹점에서 들어오는 AS 문의를 처리할 때 확인하는 5단계 체크리스트.

export interface AsChecklistItem {
  id: string;
  label: string;
}

export interface AsChecklistSection {
  id: string;
  title: string;
  items: AsChecklistItem[];
}

export const AS_CHECKLIST_SECTIONS: AsChecklistSection[] = [
  {
    id: "intake",
    title: "1. 요청 접수 체크리스트",
    items: [
      { id: "intake_classify", label: "요청이 실제 장애인지, 단순 사용법 문의인지 먼저 분류했다." },
      {
        id: "intake_self_service",
        label: "점주가 가이드에 따라 직접 처리할 수 있는 업무인지 확인했다.",
      },
      {
        id: "intake_no_proxy",
        label: "메뉴/가격/품절/영업시간/매출조회 등 셀프처리 가능 업무를 대신 처리하지 않았다.",
      },
      { id: "intake_explain", label: "점주에게 “직접 하실 수 있는 기능”이라고 명확히 안내했다." },
      { id: "intake_record", label: "상담 내용과 처리 결과를 CRM 또는 업무시스템에 기록했다." },
    ],
  },
  {
    id: "method",
    title: "2. 지원 방식 결정 체크리스트",
    items: [
      { id: "method_phone", label: "전화 안내로 해결 가능한지 먼저 확인했다." },
      { id: "method_guide", label: "매뉴얼 또는 이미지/영상 가이드를 우선 전달했다." },
      { id: "method_remote", label: "원격지원으로 해결 가능한 문제인지 확인했다." },
      { id: "method_onsite", label: "현장출동이 필요한 실제 장비/시스템 장애인지 확인했다." },
      {
        id: "method_approval",
        label: "현장출동 또는 예외지원은 책임자 승인 기준에 맞게 진행했다.",
      },
    ],
  },
  {
    id: "resolve",
    title: "3. 포스모스 직접 해결 대상",
    items: [
      {
        id: "resolve_payment",
        label: "카드승인 불가, VAN 통신장애, TID 관련 문제 등 결제 장애를 확인했다.",
      },
      {
        id: "resolve_system",
        label: "POS 프로그램 실행 불가, DB 오류, 부팅 불가 등 시스템 장애를 확인했다.",
      },
      { id: "resolve_device", label: "프린터/단말기/키오스크 등 장비 고장을 확인했다." },
      {
        id: "resolve_install_error",
        label: "설치 오류 또는 회사 작업으로 발생한 문제인지 확인했다.",
      },
      { id: "resolve_owned", label: "포스모스 책임영역은 끝까지 해결했다." },
    ],
  },
  {
    id: "improve",
    title: "4. 업무 종료 후 개선 체크리스트",
    items: [
      { id: "improve_repeat", label: "같은 문의가 반복될 가능성이 있는지 확인했다." },
      {
        id: "improve_manual",
        label: "반복 문의라면 매뉴얼 개선 또는 신규 가이드 제작이 필요한지 기록했다.",
      },
      {
        id: "improve_automation",
        label: "자동화 또는 셀프서비스로 전환 가능한 업무인지 검토했다.",
      },
      {
        id: "improve_guide_again",
        label: "점주가 다음에는 직접 처리할 수 있도록 마지막에 다시 안내했다.",
      },
      {
        id: "improve_scale",
        label: "업무 처리 후 “5만 개 가맹점에도 가능한 방식인가?”를 검토했다.",
      },
    ],
  },
  {
    id: "prohibited",
    title: "5. 금지 행동 체크리스트",
    items: [
      { id: "prohibited_do_forever", label: "“제가 계속 해드릴게요”라고 말하지 않았다." },
      {
        id: "prohibited_personal",
        label: "개인 휴대폰 또는 개인 약속으로 서비스를 제공하지 않았다.",
      },
      { id: "prohibited_inconsistent", label: "직원별로 다른 서비스 기준을 만들지 않았다." },
      {
        id: "prohibited_onsite_for_usage",
        label: "단순 사용법 또는 점주 업무대행으로 현장출동하지 않았다.",
      },
      { id: "prohibited_routine", label: "반복되는 점주 업무를 직원의 정기 업무로 만들지 않았다." },
    ],
  },
];

export const AS_CHECKLIST_ITEM_IDS: string[] = AS_CHECKLIST_SECTIONS.flatMap((section) =>
  section.items.map((item) => item.id),
);

export function isAsChecklistComplete(
  checklist: Record<string, boolean> | null | undefined,
): boolean {
  if (!checklist) return false;
  return AS_CHECKLIST_ITEM_IDS.every((id) => checklist[id] === true);
}

export type MerchantMemoEntryType = "as" | "claim" | "general" | "etc";

export const MERCHANT_MEMO_ENTRY_TYPE_LABEL: Record<MerchantMemoEntryType, string> = {
  as: "AS",
  claim: "클레임",
  general: "일반 문의",
  etc: "기타",
};
