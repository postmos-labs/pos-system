import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  FRANCHISE_STATUS_LABEL,
  FRANCHISE_STATUS_COLOR,
  type FranchiseStatus,
  type Profile,
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
  ClipboardCheck,
} from "lucide-react";
import ExcelDownloadButton from "./ExcelDownloadButton";
import ApprovalButton from "./ApprovalButton";
import TransferApprovalItem from "./TransferApprovalItem";
import RejectedTransferItem from "./RejectedTransferItem";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import type { ApprovalNote } from "@/lib/approvalNotes";

type CompletionApproval = {
  installation_id: string;
  target_status: string;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  approval_notes: ApprovalNote[];
  installation: { id: string; customer_name: string | null; address: string | null } | null;
};

type TransferApproval = {
  franchise_application_id: string;
  requested_by: string;
  requested_by_name: string;
  requested_at: string;
  cs_approved_by_name: string | null;
  approval_notes: ApprovalNote[];
  franchise: {
    id: string;
    business_name: string | null;
    owner_name: string | null;
    address: string | null;
    phone: string | null;
  } | null;
};

type RejectedTransfer = {
  franchise_application_id: string;
  updated_at: string;
  rejection_reason: string | null;
  approval_notes: ApprovalNote[];
  franchise: {
    id: string;
    business_name: string | null;
    owner_name: string | null;
    address: string | null;
    phone: string | null;
  } | null;
};

const INSTALL_STEP_LABEL: Record<string, string> = {
  preparing: "제품준비",
  scheduled: "일정확정",
  in_transit: "출발",
  delivery_sent: "택배발송",
  completed: "완료",
};

export default async function DashboardPage() {
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

  let franchiseQuery = supabase
    .from("franchise_applications")
    .select(
      "*, sales:profiles!franchise_applications_sales_id_fkey(name), cs:profiles!franchise_applications_cs_id_fkey(name)",
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (p.role === "sales") franchiseQuery = franchiseQuery.eq("sales_id", userId);
  if (p.role === "cs") franchiseQuery = franchiseQuery.eq("cs_id", userId);

  const countStatuses: FranchiseStatus[] = [
    "doc_waiting",
    "doc_incomplete",
    "card_apply_done",
    "toss_review_done",
  ];
  function buildCountQuery(status: FranchiseStatus) {
    let q = supabase
      .from("franchise_applications")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", status);
    if (p.role === "sales") q = q.eq("sales_id", userId);
    if (p.role === "cs") q = q.eq("cs_id", userId);
    return q;
  }

  const unassignedFranchiseQuery = supabase
    .from("franchise_applications")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("cs_id", null)
    .not("status", "in", "(card_done,internet_done)");

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
      ? supabase
          .from("franchise_applications")
          .select("id, business_name, owner_name, address")
          .is("deleted_at", null)
          .eq("install_date", today)
      : null;

  const staleDate = new Date(Date.now() - 7 * 86400000).toISOString();
  let staleQuery = supabase
    .from("franchise_applications")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .lt("updated_at", staleDate)
    .not("status", "in", "(card_done,internet_done)");
  if (p.role === "sales") staleQuery = staleQuery.eq("sales_id", userId);
  if (p.role === "cs") staleQuery = staleQuery.eq("cs_id", userId);

  const [{ data: applications }, ...countResults] = await Promise.all([
    franchiseQuery.limit(8),
    ...countStatuses.map(buildCountQuery),
  ]);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const monthlyFranchiseQuery = supabase
    .from("franchise_applications")
    .select("created_at, status")
    .is("deleted_at", null)
    .gte("created_at", sixMonthsAgo.toISOString());

  const avgDaysQuery = supabase
    .from("installations")
    .select("created_at, updated_at")
    .eq("status", "completed")
    .order("updated_at", { ascending: false })
    .limit(30);

  const completionApprovalQuery =
    p.approval_role === "tech_responsible" || p.approval_role === "team_lead"
      ? supabase
          .from("installation_completion_approvals")
          .select(
            "installation_id, target_status, requested_by, requested_by_name, requested_at, approval_notes, installation:installations(id, customer_name, address)",
          )
          .eq(
            "status",
            p.approval_role === "tech_responsible" ? "requested" : "responsible_approved",
          )
          .neq("requested_by", userId)
          .order("requested_at", { ascending: true })
          .limit(5)
      : null;

  const transferApprovalQuery =
    p.approval_role === "cs_responsible" || p.approval_role === "team_lead"
      ? supabase
          .from("franchise_transfer_approvals")
          .select(
            "franchise_application_id, requested_by, requested_by_name, requested_at, cs_approved_by_name, approval_notes, franchise:franchise_applications(id, business_name, owner_name, address, phone)",
          )
          .eq(
            "status",
            p.approval_role === "cs_responsible" ? "requested" : "cs_responsible_approved",
          )
          .neq("requested_by", userId)
          .order("requested_at", { ascending: true })
          .limit(5)
      : null;

  const rejectedTransferQuery = supabase
    .from("franchise_transfer_approvals")
    .select(
      "franchise_application_id, updated_at, rejection_reason, approval_notes, franchise:franchise_applications(id, business_name, owner_name, address, phone)",
    )
    .eq("status", "rejected")
    .eq("requested_by", userId)
    .order("updated_at", { ascending: false })
    .limit(5);

  const [
    { count: unassignedFranchise },
    { count: unassignedInstall },
    { count: staleCount },
    todayInstallsResult,
    todayFranchiseResult,
    { data: monthlyFranchise },
    { data: completedInstalls },
    completionApprovalsResult,
    transferApprovalsResult,
    rejectedTransfersResult,
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
    completionApprovalQuery ?? Promise.resolve({ data: [] as CompletionApproval[] }),
    transferApprovalQuery ?? Promise.resolve({ data: [] as TransferApproval[] }),
    rejectedTransferQuery,
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
  const completionApprovals = (completionApprovalsResult.data ?? []) as CompletionApproval[];
  const transferApprovals = (transferApprovalsResult.data ?? []) as TransferApproval[];
  const rejectedTransfers = (rejectedTransfersResult.data ?? []) as unknown as RejectedTransfer[];
  const isApprover = ["cs_responsible", "tech_responsible", "team_lead"].includes(
    p.approval_role ?? "",
  );

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

      {isApprover && (
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
            <ClipboardCheck size={18} className="text-blue-600" />
            <div>
              <h2 className="font-bold text-slate-900">승인 대기 항목</h2>
              <p className="text-xs text-slate-500 mt-0.5">내 승인이 필요한 요청입니다.</p>
            </div>
          </div>
          {completionApprovals.length > 0 || transferApprovals.length > 0 ? (
            <>
              {completionApprovals.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {completionApprovals.map((approval) => (
                    <div
                      key={approval.installation_id}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors"
                    >
                      <Link
                        href={`/installs?id=${approval.installation_id}`}
                        className="flex min-w-0 flex-1 items-center gap-4"
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {approval.installation?.customer_name ?? "설치 건"}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {approval.requested_by_name} ·{" "}
                            {INSTALL_STEP_LABEL[approval.target_status] ?? approval.target_status}{" "}
                            {p.approval_role === "team_lead" ? "최종 " : "1차 "}승인요청
                          </p>
                        </div>
                        <ArrowRight size={16} className="text-slate-400" />
                      </Link>
                      <ApprovalButton
                        type={p.approval_role === "team_lead" ? "tech_final" : "completion"}
                        id={approval.installation_id}
                        notes={approval.approval_notes}
                      />
                    </div>
                  ))}
                </div>
              )}
              {transferApprovals.length > 0 && (
                <div className="divide-y divide-slate-100">
                  {transferApprovals.map((approval) => (
                    <div
                      key={approval.franchise_application_id}
                      className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors"
                    >
                      <TransferApprovalItem
                        id={approval.franchise_application_id}
                        businessName={approval.franchise?.business_name ?? null}
                        ownerName={approval.franchise?.owner_name ?? null}
                        address={approval.franchise?.address ?? null}
                        phone={approval.franchise?.phone ?? null}
                        requesterName={approval.requested_by_name}
                        csApproverName={approval.cs_approved_by_name}
                        approvalRole={p.approval_role as "cs_responsible" | "team_lead"}
                        notes={approval.approval_notes}
                      />
                      <ApprovalButton
                        type={p.approval_role === "cs_responsible" ? "cs_transfer" : "transfer"}
                        id={approval.franchise_application_id}
                        notes={approval.approval_notes}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="px-6 py-4 text-sm text-slate-500">승인 대기 중인 요청이 없습니다.</div>
          )}
        </section>
      )}

      {rejectedTransfers.length > 0 && (
        <section className="bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-red-100">
            <AlertTriangle size={18} className="text-red-600" />
            <div>
              <h2 className="font-bold text-slate-900">반려된 이관 요청</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                반려 사유를 확인하고 다시 요청해주세요.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {rejectedTransfers.map((item) => (
              <RejectedTransferItem
                key={item.franchise_application_id}
                id={item.franchise_application_id}
                businessName={item.franchise?.business_name ?? null}
                ownerName={item.franchise?.owner_name ?? null}
                notes={item.approval_notes}
              />
            ))}
          </div>
        </section>
      )}

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
