import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { STATUS_LABEL, type TicketStatus, type Profile } from "@/types";
import TicketsClient from "./TicketsClient";
import AuthorStats, { type AuthorStatRange, type AuthorStatRow } from "./AuthorStats";

interface Props {
  searchParams: Promise<{
    status?: string;
    tab?: string;
    page?: string;
    q?: string;
    stat?: string;
  }>;
}

const PAGE_SIZE = 50;

// 상단 팀 탭은 team 컬럼으로 거른다. 123번 마이그레이션(tickets.team)이 아직 적용되지
// 않은 환경에서는 42703이 나므로 아래 상태 기반 매핑으로 폴백한다.
const TAB_STATUSES: Record<string, TicketStatus[]> = {
  cs: ["cs_pending", "cs_progress", "scheduled"],
  tech: ["in_progress"],
};

// 처리 완료 후 기록하는 인입 로그라 파이프라인 단계 대신 결과 3구간만 필터로 쓴다.
const LOG_STATUSES: TicketStatus[] = ["done", "in_progress", "canceled"];

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "")
  );
}

// 42703: 'column tickets.team does not exist' / PGRST204: "Could not find the 'team' column ..."
function missingColumnName(error: { message?: string } | null): string | null {
  const message = error?.message ?? "";
  const match =
    /Could not find the '([^']+)' column/.exec(message) ??
    /column "?([A-Za-z0-9_.]+)"? does not exist/.exec(message);
  return match?.[1]?.split(".").pop() ?? null;
}

// 작성 현황 집계에서 한 번에 읽어올 최대 건수. 넘으면 화면에 잘렸다고 알린다.
const STAT_LIMIT = 5000;

// KST 기준 이번 달/지난 달 경계
function monthRangeKst(offset: number) {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth() + offset;
  const start = new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month + 1, 1) - 9 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default async function TicketsPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = params.tab ?? "all";
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  const p = profile as Profile;
  const userId = user.id;

  // 검색은 서버에서 전체 범위로 수행한다 — 클라이언트에서 현재 페이지 50건만 거르면
  // 다른 페이지의 티켓이 검색되지 않는다. 가맹점명·기사명은 조인 테이블이라 or()에
  // 직접 걸 수 없어, 매칭되는 id를 먼저 뽑아 in 조건으로 합친다.
  const searchTerm = (params.q ?? "").trim().slice(0, 100);
  // .or() 안에서 쉼표·괄호·따옴표·백슬래시는 문법 문자라 그대로 넘기면 쿼리가 깨진다.
  // 가맹점 360(merchants/page.tsx applySearch)에서 검증된 방식 — 문법 문자를 제거하고 비인용 패턴을 쓴다.
  const searchSafe = searchTerm.replace(/[,()"'\\%*_]/g, "");
  const searchPattern = `%${searchSafe}%`;
  let searchMerchantIds: string[] = [];
  let searchTechIds: string[] = [];
  if (searchTerm) {
    const [{ data: merchantRows }, { data: techRows }] = await Promise.all([
      supabase
        .from("merchants")
        .select("id")
        .or(`business_name.ilike.${searchPattern},phone.ilike.${searchPattern}`)
        .limit(200),
      supabase.from("profiles").select("id").ilike("name", searchPattern).limit(50),
    ]);
    searchMerchantIds = (merchantRows ?? []).map((r) => r.id);
    searchTechIds = (techRows ?? []).map((r) => r.id);
  }

  function buildQuery(useTeamFilter: boolean, useSoftDeleteFilter: boolean) {
    let q = supabase
      .from("tickets")
      .select(
        "*, merchant:merchants(business_name, phone), sales:profiles!tickets_sales_id_fkey(name), tech:profiles!tickets_tech_id_fkey(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    // 062 마이그레이션(deleted_at) 미적용 환경에서는 이 필터가 42703을 내므로 뺄 수 있게 한다.
    if (useSoftDeleteFilter) q = q.is("deleted_at", null);

    if (p.role === "sales") q = q.eq("sales_id", userId);
    if (p.role === "cs") q = q.eq("cs_id", userId);
    if (p.role === "tech") q = q.eq("tech_id", userId);

    if (useTeamFilter && (tab === "cs" || tab === "tech")) {
      q = q.eq("team", tab);
      if (params.status) q = q.eq("status", params.status);
    } else if (params.status) {
      q = q.eq("status", params.status);
    } else if (tab !== "all") {
      q = q.in("status", TAB_STATUSES[tab] ?? []);
    }

    if (searchTerm) {
      const orParts = [`title.ilike.${searchPattern}`];
      if (searchMerchantIds.length) orParts.push(`merchant_id.in.(${searchMerchantIds.join(",")})`);
      if (searchTechIds.length) orParts.push(`tech_id.in.(${searchTechIds.join(",")})`);
      q = q.or(orParts.join(","));
    }

    return q;
  }

  let useTeamFilter = tab === "cs" || tab === "tech";
  let useSoftDeleteFilter = true;
  let countRes = await buildQuery(useTeamFilter, useSoftDeleteFilter).range(0, 0);
  // 미적용 마이그레이션 컬럼(team/deleted_at)이 원인이면 해당 필터만 빼고 재시도한다.
  for (let retry = 0; retry < 2 && isMissingColumnError(countRes.error); retry++) {
    const missing = missingColumnName(countRes.error);
    if (missing === "deleted_at" && useSoftDeleteFilter) useSoftDeleteFilter = false;
    else if (missing === "team" && useTeamFilter) useTeamFilter = false;
    else break;
    countRes = await buildQuery(useTeamFilter, useSoftDeleteFilter).range(0, 0);
  }
  const totalCount = countRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const { data: tickets, error: listError } = await buildQuery(
    useTeamFilter,
    useSoftDeleteFilter,
  ).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  // 조회 실패를 "0건"으로 보여주면 원인을 알 수 없다 — cs-report의 loadFailed와 같은 원칙.
  const loadFailed = !!(countRes.error || listError);
  const loadErrorMessage =
    (countRes.error as { message?: string } | null)?.message ??
    (listError as { message?: string } | null)?.message ??
    "";

  const TABS =
    p.role === "tech"
      ? [
          { key: "all", label: "전체" },
          { key: "tech", label: "기술지원" },
        ]
      : [
          { key: "all", label: "전체" },
          { key: "cs", label: "CS팀" },
          { key: "tech", label: "기술지원" },
        ];

  // 탭·상태·페이지 이동 시 검색어가 풀리지 않도록 모든 링크에 q를 유지한다.
  const qParam = searchTerm ? `&q=${encodeURIComponent(searchTerm)}` : "";

  const statusFilters: TicketStatus[] = LOG_STATUSES;

  // 작성 현황은 마스터만 본다. 등록하면 등록자가 자기 팀 담당으로 들어가므로
  // 담당자(sales_id/cs_id/tech_id) 기준 집계가 사실상 작성자 집계다.
  const statRange: AuthorStatRange =
    params.stat === "prev" ? "prev" : params.stat === "all" ? "all" : "month";
  let statRows: AuthorStatRow[] = [];
  let statTruncated = false;
  if (p.role === "master") {
    let statQuery = supabase
      .from("tickets")
      .select("sales_id,cs_id,tech_id,team")
      .limit(STAT_LIMIT);
    if (useSoftDeleteFilter) statQuery = statQuery.is("deleted_at", null);
    if (statRange !== "all") {
      const { start, end } = monthRangeKst(statRange === "prev" ? -1 : 0);
      statQuery = statQuery.gte("created_at", start).lt("created_at", end);
    }
    const { data: statData } = await statQuery;
    const rows = (statData ?? []) as {
      sales_id: string | null;
      cs_id: string | null;
      tech_id: string | null;
      team: string | null;
    }[];
    statTruncated = rows.length >= STAT_LIMIT;

    const ids = [
      ...new Set(
        rows
          .map((row) => row.sales_id ?? row.cs_id ?? row.tech_id)
          .filter((id): id is string => !!id),
      ),
    ];
    const nameById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: people } = await supabase.from("profiles").select("id,name").in("id", ids);
      for (const person of (people ?? []) as { id: string; name: string | null }[]) {
        if (person.name) nameById.set(person.id, person.name);
      }
    }

    const counts = new Map<string, AuthorStatRow>();
    for (const row of rows) {
      const ownerId = row.sales_id ?? row.cs_id ?? row.tech_id;
      const name = ownerId ? (nameById.get(ownerId) ?? "알 수 없음") : "담당자 없음";
      const entry = counts.get(name) ?? { name, cs: 0, tech: 0, total: 0 };
      if (row.team === "tech") entry.tech += 1;
      else if (row.team === "cs") entry.cs += 1;
      entry.total += 1;
      counts.set(name, entry);
    }
    statRows = [...counts.values()].sort((a, b) => b.total - a.total);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">인입내역</h1>
          <p className="text-slate-500 text-sm mt-1">총 {totalCount}건</p>
        </div>
        <div className="flex items-center gap-2">
          {(p.role === "admin" || p.role === "master" || p.role === "cs" || p.can_delete) && (
            <Link
              href="/tickets/trash"
              className="text-sm text-slate-500 px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-colors font-medium"
            >
              휴지통
            </Link>
          )}
          {(p.role === "sales" ||
            p.role === "cs" ||
            p.role === "tech" ||
            p.role === "admin" ||
            p.role === "master") && (
            <Link
              href="/tickets/new"
              className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-sm shadow-blue-200"
            >
              <Plus size={16} />새 인입내역
            </Link>
          )}
        </div>
      </div>

      {p.role === "master" && (
        <AuthorStats rows={statRows} range={statRange} truncated={statTruncated} />
      )}

      {}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl mb-5 w-fit">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/tickets?tab=${t.key}${qParam}`}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-black/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {}
      {statusFilters.length > 0 && (
        <div className="flex gap-1 overflow-x-auto pb-2 mb-5">
          <Link
            href={`/tickets?tab=${tab}${qParam}`}
            className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${!params.status ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
          >
            전체
          </Link>
          {statusFilters.map((s) => (
            <Link
              key={s}
              href={`/tickets?tab=${tab}&status=${s}${qParam}`}
              className={`whitespace-nowrap text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${params.status === s ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
            >
              {STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
      )}

      {loadFailed && (
        <div className="mb-5 rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          목록을 불러오지 못했습니다. 아래는 빈 목록이 아니라 조회 실패입니다.
          {loadErrorMessage && (
            <span className="mt-1 block font-normal text-red-600">{loadErrorMessage}</span>
          )}
        </div>
      )}

      {}
      <TicketsClient tickets={(tickets ?? []) as any} initialSearch={searchTerm} />

      {}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Link
            href={`/tickets?tab=${tab}${params.status ? `&status=${params.status}` : ""}${qParam}&page=${Math.max(1, page - 1)}`}
            className={`text-sm px-3 py-1.5 rounded-lg border border-slate-200 font-medium ${page <= 1 ? "text-slate-300 pointer-events-none" : "text-slate-600 hover:bg-slate-50"}`}
          >
            이전
          </Link>
          <span className="text-sm text-slate-500 font-medium">
            {page} / {totalPages}
          </span>
          <Link
            href={`/tickets?tab=${tab}${params.status ? `&status=${params.status}` : ""}${qParam}&page=${Math.min(totalPages, page + 1)}`}
            className={`text-sm px-3 py-1.5 rounded-lg border border-slate-200 font-medium ${page >= totalPages ? "text-slate-300 pointer-events-none" : "text-slate-600 hover:bg-slate-50"}`}
          >
            다음
          </Link>
        </div>
      )}
    </div>
  );
}
