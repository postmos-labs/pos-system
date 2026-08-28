import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  FRANCHISE_STATUS_LABEL,
  FRANCHISE_STATUS_COLOR,
  type FranchiseStatus,
  type Profile,
  type VanGroup,
} from "@/types";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  FileEdit,
  Clock4,
  CheckCircle2,
  Flag,
  AlertTriangle,
  UserX,
  CalendarClock,
  ArrowRight,
} from "lucide-react";
import ExcelDownloadButton from "./ExcelDownloadButton";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import VanGroupTabs from "./VanGroupTabs";

type VanFilter = VanGroup | "";

interface VanFilterable<T> {
  ilike(column: string, pattern: string): T;
  not(column: string, operator: string, value: unknown): T;
}

function applyVanFilter<T extends VanFilterable<T>>(query: T, van: VanFilter): T {
  if (van === "kicc") return query.ilike("van_company", "%KICC%");
  if (van === "toss") {
    return query.not("van_company", "is", null).not("van_company", "ilike", "%KICC%");
  }
  return query;
}

interface Props {
  searchParams: Promise<{ van?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const van: VanFilter = params.van === "toss" || params.van === "kicc" ? params.van : "";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const userId = user.id;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (!profile) redirect("/login");

  const p = profile as Profile;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

  let franchiseQuery = applyVanFilter(
    supabase
      .from("franchise_applications")
      .select(
        "*, sales:profiles!franchise_applications_sales_id_fkey(name), cs:profiles!franchise_applications_cs_id_fkey(name)",
      )
      .order("updated_at", { ascending: false }),
    van,
  );
  if (p.role === "sales") franchiseQuery = franchiseQuery.eq("sales_id", userId);
  if (p.role === "cs") franchiseQuery = franchiseQuery.eq("cs_id", userId);

  const countStatuses: FranchiseStatus[] = [
    "doc_waiting",
    "doc_incomplete",
    "card_apply_done",
    "toss_review_done",
  ];
  function buildCountQuery(status: FranchiseStatus) {
    let q = applyVanFilter(
      supabase
        .from("franchise_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", status),
      van,
    );
    if (p.role === "sales") q = q.eq("sales_id", userId);
    if (p.role === "cs") q = q.eq("cs_id", userId);
    return q;
  }

  const unassignedFranchiseQuery = applyVanFilter(
    supabase
      .from("franchise_applications")
      .select("id", { count: "exact", head: true })
      .is("cs_id", null)
      // 크론(franchise-alerts)의 NOT_STALE_STATUSES와 동일한 목록. toss_review_done(심사완료)은
      // 이관 요청이 남아 있을 수 있어 제외하지 않는다.
      .not("status", "in", "(card_done,internet_done,completed,canceled,hold,persistent_absence)"),
    van,
  );

  const unassignedInstallQuery = supabase
    .from("installations")
    .select("id", { count: "exact", head: true })
    .is("assigned_to", null)
    .not("status", "in", "(completed,rejected)");

  const todayInstallsQuery =
    p.role === "tech"
      ? supabase
          .from("installations")
          .select("*, franchise_application_id")
          .eq("assigned_to", userId)
          .not("status", "in", "(completed,rejected)")
          .order("created_at")
      : null;

  const todayFranchiseQuery =
    p.role === "tech"
      ? applyVanFilter(
          supabase
            .from("franchise_applications")
            .select("id, business_name, owner_name, address")
            .eq("install_date", today),
          van,
        )
      : null;

  const staleDate = new Date(Date.now() - 7 * 86400000).toISOString();
  let staleQuery = applyVanFilter(
    supabase
      .from("franchise_applications")
      .select("id", { count: "exact", head: true })
      .lt("updated_at", staleDate)
      // 크론(franchise-alerts)의 NOT_STALE_STATUSES와 동일한 목록. toss_review_done(심사완료)은
      // 이관 요청이 남아 있을 수 있어 제외하지 않는다.
      .not("status", "in", "(card_done,internet_done,completed,canceled,hold,persistent_absence)"),
    van,
  );
  if (p.role === "sales") staleQuery = staleQuery.eq("sales_id", userId);
  if (p.role === "cs") staleQuery = staleQuery.eq("cs_id", userId);

  function buildVanGroupCountQuery(vanGroup: VanFilter) {
    let q = applyVanFilter(
      supabase.from("franchise_applications").select("id", { count: "exact", head: true }),
      vanGroup,
    );
    if (p.role === "sales") q = q.eq("sales_id", userId);
    if (p.role === "cs") q = q.eq("cs_id", userId);
    return q;
  }

  const [{ data: applications }, ...countResults] = await Promise.all([
    franchiseQuery.limit(8),
    ...countStatuses.map(buildCountQuery),
  ]);

  const [{ count: vanAllCount }, { count: vanTossCount }, { count: vanKiccCount }] =
    await Promise.all([
      buildVanGroupCountQuery(""),
      buildVanGroupCountQuery("toss"),
      buildVanGroupCountQuery("kicc"),
    ]);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const monthlyFranchiseQuery = applyVanFilter(
    supabase
      .from("franchise_applications")
      .select("created_at, status")
      .gte("created_at", sixMonthsAgo.toISOString()),
    van,
  );

  const avgDaysQuery = supabase
    .from("installations")
    .select("created_at, updated_at")
    .eq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(30);

  const [
    { count: unassignedFranchise },
    { count: unassignedInstall },
    { count: staleCount },
    todayInstallsResult,
    todayFranchiseResult,
    { data: monthlyFranchise },
    { data: completedInstalls },
  ] = await Promise.all([
    p.role === "admin" || p.role === "master"
      ? unassignedFranchiseQuery
      : Promise.resolve({ count: 0 }),
    p.role === "admin" || p.role === "master"
      ? unassignedInstallQuery
      : Promise.resolve({ count: 0 }),
    staleQuery,
    todayInstallsQuery ?? Promise.resolve({ data: [] }),
    todayFranchiseQuery ?? Promise.resolve({ data: [] }),
    p.role !== "tech" ? monthlyFranchiseQuery : Promise.resolve({ data: [] as any[] }),
    avgDaysQuery,
  ]);

  const monthlyStats: { label: string; total: number; done: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    d.setDate(1);
    const ym = d.toISOString().slice(0, 7);
    const monthRows = (monthlyFranchise ?? []).filter((r: any) => r.created_at.startsWith(ym));
    monthlyStats.push({
      label: `${d.getMonth() + 1}월`,
      total: monthRows.length,
      done: monthRows.filter((r: any) => r.status === "card_done" || r.status === "internet_done")
        .length,
    });
  }

  const avgDays =
    completedInstalls && completedInstalls.length > 0
      ? Math.round(
          completedInstalls.reduce(
            (sum: number, i: any) =>
              sum +
              (new Date(i.updated_at).getTime() - new Date(i.created_at).getTime()) / 86400000,
            0,
          ) / completedInstalls.length,
        )
      : null;

  const counts: Record<string, number> = {};
  countStatuses.forEach((status, i) => {
    counts[status] = countResults[i].count ?? 0;
  });

  const summaryCards = [
    {
      label: FRANCHISE_STATUS_LABEL.doc_waiting,
      status: "doc_waiting",
      icon: Clock4,
      color: "bg-amber-50 text-amber-600",
      border: "border-amber-100",
    },
    {
      label: FRANCHISE_STATUS_LABEL.doc_incomplete,
      status: "doc_incomplete",
      icon: FileEdit,
      color: "bg-red-50 text-red-600",
      border: "border-red-100",
    },
    {
      label: FRANCHISE_STATUS_LABEL.card_apply_done,
      status: "card_apply_done",
      icon: CheckCircle2,
      color: "bg-indigo-50 text-indigo-600",
      border: "border-indigo-100",
    },
    {
      label: FRANCHISE_STATUS_LABEL.toss_review_done,
      status: "toss_review_done",
      icon: Flag,
      color: "bg-emerald-50 text-emerald-600",
      border: "border-emerald-100",
    },
  ];

  const todayInstalls = (todayInstallsResult.data ?? []) as any[];
  const todayFranchise = (todayFranchiseResult.data ?? []) as any[];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">안녕하세요, {p.name}님</h1>
          <p className="text-slate-500 mt-1">
            {format(new Date(), "yyyy년 M월 d일 (EEE)", { locale: ko })}
          </p>
        </div>
        {(p.role === "admin" || p.role === "master" || p.role === "cs") && <ExcelDownloadButton />}
      </div>

      {}
      <VanGroupTabs
        van={van}
        counts={{
          all: vanAllCount ?? 0,
          toss: vanTossCount ?? 0,
          kicc: vanKiccCount ?? 0,
        }}
      />

      {}
      {(p.role === "admin" || p.role === "master") &&
        ((unassignedFranchise ?? 0) > 0 ||
          (unassignedInstall ?? 0) > 0 ||
          (staleCount ?? 0) > 0) && (
          <div className="flex flex-wrap gap-3">
            {(unassignedFranchise ?? 0) > 0 && (
              <Link
                href="/franchise"
                className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-red-100 transition-colors"
              >
                <UserX size={15} />
                담당자 미배정 가맹 {unassignedFranchise}건
              </Link>
            )}
            {(unassignedInstall ?? 0) > 0 && (
              <Link
                href="/installs"
                className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-orange-100 transition-colors"
              >
                <UserX size={15} />
                기사 미배정 설치 {unassignedInstall}건
              </Link>
            )}
            {(staleCount ?? 0) > 0 && (
              <Link
                href="/franchise"
                className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors"
              >
                <AlertTriangle size={15} />
                7일 이상 미처리 {staleCount}건
              </Link>
            )}
          </div>
        )}

      {}
      {(p.role === "cs" || p.role === "sales") && (staleCount ?? 0) > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium px-4 py-2.5 rounded-xl">
          <AlertTriangle size={15} />내 담당 건 중 <strong>{staleCount}건</strong>이 7일 이상 상태
          변화가 없습니다.
          <Link href="/franchise" className="underline ml-1 hover:text-amber-900">
            확인하기
          </Link>
        </div>
      )}

      {}
      {p.role === "tech" && (
        <div className="space-y-3">
          {todayInstalls.length === 0 && todayFranchise.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-sm text-slate-500">
              오늘 배정된 설치 일정이 없습니다.
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
              <div className="flex items-center gap-2 font-semibold text-blue-800 mb-3">
                <CalendarClock size={16} />
                오늘 내 설치 일정 {todayInstalls.length + todayFranchise.length}건
              </div>
              <div className="space-y-2">
                {todayInstalls.map((i: any) => (
                  <a
                    key={i.id}
                    href={`/installs/mine?id=${i.id}`}
                    className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="font-medium text-slate-900">{i.customer_name}</span>
                    {i.address && (
                      <span className="text-slate-400 text-xs truncate" title={i.address}>
                        {i.address}
                      </span>
                    )}
                  </a>
                ))}
                {todayFranchise.map((f: any) => (
                  <Link
                    key={f.id}
                    href="/franchise"
                    className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                  >
                    <span className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0" />
                    <span className="font-medium text-slate-900">
                      {f.business_name || f.owner_name || "미입력"}
                    </span>
                    {f.address && (
                      <span className="text-slate-400 text-xs truncate" title={f.address}>
                        {f.address}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {}
      {p.role !== "tech" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryCards.map(({ label, status, icon: Icon, color, border }) => (
            <Link
              key={status}
              href={`/franchise?status=${status}`}
              className={`bg-white rounded-2xl border ${border} p-5 hover:shadow-md transition-all`}
            >
              <div
                className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center mb-3`}
              >
                <Icon size={20} />
              </div>
              <p className="text-3xl font-bold text-slate-900">{counts[status] ?? 0}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </Link>
          ))}
        </div>
      )}

      {}
      {p.role !== "tech" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-sm font-bold text-slate-700 mb-4">월별 가맹접수 추이 (최근 6개월)</p>
            <div className="flex items-end gap-2 h-24">
              {monthlyStats.map((m) => {
                const maxTotal = Math.max(...monthlyStats.map((s) => s.total), 1);
                return (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-400">{m.total}</span>
                    <div
                      className="w-full relative rounded-t-sm overflow-hidden"
                      style={{
                        height: `${Math.round((m.total / maxTotal) * 64)}px`,
                        minHeight: "4px",
                      }}
                    >
                      <div
                        className="absolute bottom-0 w-full bg-blue-100 rounded-t-sm"
                        style={{ height: "100%" }}
                      />
                      <div
                        className="absolute bottom-0 w-full bg-blue-500 rounded-t-sm"
                        style={{
                          height: `${m.total > 0 ? Math.round((m.done / m.total) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-slate-500">{m.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-blue-500" />
                <span className="text-xs text-slate-500">완료</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-blue-100" />
                <span className="text-xs text-slate-500">전체 접수</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-center items-center text-center">
            <p className="text-xs text-slate-400 mb-2">설치 평균 소요일</p>
            {avgDays !== null ? (
              <>
                <p className="text-4xl font-bold text-slate-900">{avgDays}</p>
                <p className="text-sm text-slate-500 mt-1">일 (최근 30건)</p>
              </>
            ) : (
              <p className="text-slate-400 text-sm">데이터 없음</p>
            )}
          </div>
        </div>
      )}

      {}
      {p.role !== "tech" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900">
              {p.role === "admin" || p.role === "master" ? "최근 가맹 접수" : "내 담당 가맹 접수"}
            </h2>
            <Link
              href="/franchise"
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              전체보기 <ArrowRight size={14} />
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {applications?.length === 0 && <EmptyState message="등록된 가맹 접수가 없습니다" />}
            {applications?.map((app) => (
              <Link
                key={app.id}
                href="/franchise"
                className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <Badge colorClass={FRANCHISE_STATUS_COLOR[app.status as FranchiseStatus]}>
                  {FRANCHISE_STATUS_LABEL[app.status as FranchiseStatus]}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold text-slate-900 truncate"
                    title={app.business_name || "상호명 미입력"}
                  >
                    {app.business_name || "상호명 미입력"}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(app as any).cs?.name ?? (app as any).sales?.name ?? ""}
                  </p>
                </div>
                <p className="text-xs text-slate-400 whitespace-nowrap">
                  {format(new Date(app.updated_at), "M/d", { locale: ko })}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
