// KICC 월간 CS 운영 보고서용 순수 집계 함수.
// DB 접근 없이 "입력 배열 → 지표 객체"만 계산한다. Supabase import 금지 — 서버 로더(cs-report/page.tsx)가
// merchant_memo_entries 조회 결과를 이 파일의 입력 타입으로 매핑해 넘기고, 결과를 그대로 클라이언트에 전달한다.
import {
  MEMO_ISSUE_CATEGORIES,
  MEMO_RESOLUTIONS,
  REMOTE_RESOLUTIONS,
  type MemoIssueCategory,
  type MemoResolution,
} from "@/app/(app)/merchants/merchant360";

export interface CsReportMemoInput {
  entry_type: "as" | "claim" | "general" | "etc";
  issue_category?: MemoIssueCategory | null;
  resolution?: MemoResolution | null;
  is_repeat?: boolean | null;
  // 반복 장애 브랜드 집계용. 메모 자체엔 브랜드가 없어 호출부(cs-report/page.tsx)가
  // merchants.brand를 merchant_id로 조인해 채워 넣는다.
  brand?: string | null;
}

export interface CsReportMetrics {
  /** 집계 대상 건수 (entry_type이 as 또는 claim인 것만) */
  csTotal: number;
  /** 원격 해결률(%). resolution이 입력된 건이 0건이면 null — "0%"와 "아직 모름"을 구분한다 */
  remoteRate: number | null;
  onsiteCount: number;
  /** 전월 대비 증감률(%). 전월 대상 건수가 0이면 null */
  prevMonthDelta: number | null;
  topRepeatIssues: { category: MemoIssueCategory; count: number }[];
  byResolution: { resolution: MemoResolution; count: number }[];
  byIssueCategory: { category: MemoIssueCategory; count: number }[];
  /** 대상 건 중 issue_category/resolution/is_repeat 중 하나라도 비어 있는 건수 */
  missingCount: number;
  improvableBrands: { count: number; brands: string[] };
}

function isCsTarget(memo: CsReportMemoInput): boolean {
  return memo.entry_type === "as" || memo.entry_type === "claim";
}

/**
 * 월간 CS 운영 보고서 지표를 계산한다.
 * @param currentMonthMemos 보고 대상 월의 merchant_memo_entries (van사 필터가 이미 적용된 상태여야 함)
 * @param previousMonthMemos 전월 대비 계산용 전월 merchant_memo_entries (마찬가지로 van사 필터 적용)
 */
export function computeCsReportMetrics(
  currentMonthMemos: CsReportMemoInput[],
  previousMonthMemos: CsReportMemoInput[],
): CsReportMetrics {
  // csTotal — 대상 건수: entry_type이 as/claim인 것만 집계 대상으로 삼고, 아래 모든 지표는
  // 이 "대상 건" 범위 안에서만 계산한다(general/etc 메모는 CS 이력이 아니므로 전부 제외).
  const target = currentMonthMemos.filter(isCsTarget);
  const csTotal = target.length;

  // remoteRate — REMOTE_RESOLUTIONS ÷ resolution이 입력된 건. 분모가 0이면 null.
  const withResolution = target.filter((memo) => memo.resolution != null);
  const remoteCount = withResolution.filter((memo) =>
    REMOTE_RESOLUTIONS.includes(memo.resolution as MemoResolution),
  ).length;
  const remoteRate = withResolution.length > 0 ? (remoteCount / withResolution.length) * 100 : null;

  const onsiteCount = target.filter((memo) => memo.resolution === "onsite").length;

  // prevMonthDelta — 전월 대비 증감률(%). 전월이 0건이면 null.
  const prevCsTotal = previousMonthMemos.filter(isCsTarget).length;
  const prevMonthDelta = prevCsTotal > 0 ? ((csTotal - prevCsTotal) / prevCsTotal) * 100 : null;

  // topRepeatIssues — is_repeat === true인 건을 issue_category로 묶어 상위 5개.
  // MEMO_ISSUE_CATEGORIES 순서로 먼저 나열한 뒤 안정 정렬(Array.sort는 stable)로 건수 내림차순 정렬하면
  // 동점일 때 MEMO_ISSUE_CATEGORIES 순서가 그대로 유지된다.
  const repeatCountByCategory = new Map<MemoIssueCategory, number>();
  for (const memo of target) {
    if (memo.is_repeat !== true || !memo.issue_category) continue;
    repeatCountByCategory.set(
      memo.issue_category,
      (repeatCountByCategory.get(memo.issue_category) ?? 0) + 1,
    );
  }
  const topRepeatIssues = MEMO_ISSUE_CATEGORIES.map((category) => ({
    category,
    count: repeatCountByCategory.get(category) ?? 0,
  }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // byResolution / byIssueCategory — 값별 건수 전체(막대 표시용). 값이 없는 값도 0건으로 채워
  // 항상 전체 항목 목록을 반환한다(그래야 화면에서 "0건"인 항목도 막대로 보여줄 수 있다).
  const resolutionCounts = new Map<MemoResolution, number>();
  const issueCounts = new Map<MemoIssueCategory, number>();
  for (const memo of target) {
    if (memo.resolution) {
      resolutionCounts.set(memo.resolution, (resolutionCounts.get(memo.resolution) ?? 0) + 1);
    }
    if (memo.issue_category) {
      issueCounts.set(memo.issue_category, (issueCounts.get(memo.issue_category) ?? 0) + 1);
    }
  }
  const byResolution = MEMO_RESOLUTIONS.map((resolution) => ({
    resolution,
    count: resolutionCounts.get(resolution) ?? 0,
  }));
  const byIssueCategory = MEMO_ISSUE_CATEGORIES.map((category) => ({
    category,
    count: issueCounts.get(category) ?? 0,
  }));

  // missingCount — 대상 건 중 세 필드 중 하나라도 비어 있는 건수.
  // is_repeat은 false도 유효한 입력이라 null/undefined일 때만 "비어 있음"으로 센다.
  const missingCount = target.filter(
    (memo) => !memo.issue_category || !memo.resolution || memo.is_repeat == null,
  ).length;

  // improvableBrands — 반복 건이 2건 이상인 brand.
  const repeatCountByBrand = new Map<string, number>();
  for (const memo of target) {
    if (memo.is_repeat !== true || !memo.brand) continue;
    repeatCountByBrand.set(memo.brand, (repeatCountByBrand.get(memo.brand) ?? 0) + 1);
  }
  const improvableBrandNames = [...repeatCountByBrand.entries()]
    .filter(([, count]) => count >= 2)
    .map(([brand]) => brand)
    .sort((a, b) => a.localeCompare(b, "ko"));

  return {
    csTotal,
    remoteRate,
    onsiteCount,
    prevMonthDelta,
    topRepeatIssues,
    byResolution,
    byIssueCategory,
    missingCount,
    improvableBrands: { count: improvableBrandNames.length, brands: improvableBrandNames },
  };
}
