// franchise_applications가 참조하는 공통코드(codes 테이블) 값.
// codes 테이블 자체를 fetch하는 대신, 다른 옵션 리스트(RECEPTION_CHANNELS 등)와 동일하게
// 프론트에 상수로 고정한다 (090 마이그레이션 시드 데이터와 반드시 일치해야 함).

export const VAN_COMPANY_OPTIONS = [
  { code: "KOCES2", label: "코세스2" },
  { code: "KOCES1", label: "코세스1" },
  { code: "KOVEN", label: "코벤" },
  { code: "GIGA_FRANCHISE", label: "기가맹" },
] as const;

export type VanCompanyCode = (typeof VAN_COMPANY_OPTIONS)[number]["code"];

export const VAN_COMPANY_LABEL: Record<VanCompanyCode, string> = Object.fromEntries(
  VAN_COMPANY_OPTIONS.map((option) => [option.code, option.label]),
) as Record<VanCompanyCode, string>;

export const RECEPTION_CHANNEL_OPTIONS = [
  { code: "DIRECT_SALES", label: "직접 영업" },
  { code: "TOSS_LEAD", label: "토스 리드" },
] as const;

export type ReceptionChannelCode = (typeof RECEPTION_CHANNEL_OPTIONS)[number]["code"];

export const RECEPTION_CHANNEL_LABEL: Record<ReceptionChannelCode, string> = Object.fromEntries(
  RECEPTION_CHANNEL_OPTIONS.map((option) => [option.code, option.label]),
) as Record<ReceptionChannelCode, string>;

export const FRANCHISE_OPTION_OPTIONS = [
  { code: "RENTAL", label: "렌탈" },
  { code: "INSTALLMENT", label: "할부" },
] as const;

export type FranchiseOptionCode = (typeof FRANCHISE_OPTION_OPTIONS)[number]["code"];

export const FRANCHISE_OPTION_LABEL: Record<FranchiseOptionCode, string> = Object.fromEntries(
  FRANCHISE_OPTION_OPTIONS.map((option) => [option.code, option.label]),
) as Record<FranchiseOptionCode, string>;
