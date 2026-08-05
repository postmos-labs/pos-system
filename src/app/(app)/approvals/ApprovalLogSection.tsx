import { requireApprovalResponsible } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";

type Relation<T> = T | T[] | null;
function one<T>(relation: Relation<T>) {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

type FranchiseTransferLogRow = {
  id: string;
  to_status: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
  user: Relation<{ name: string }>;
  franchise_application: Relation<{ business_name: string | null; owner_name: string | null }>;
};

type InstallStepLogRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  user_name: string | null;
  user: Relation<{ name: string }>;
  installation: Relation<{ customer_name: string | null }>;
};

type LogResult = "request" | "approve" | "reject";

type LogEntry = {
  id: string;
  source: "transfer" | "install_step";
  subject: string;
  stageLabel: string;
  result: LogResult;
  actorName: string;
  reason: string | null;
  createdAt: string;
};

const TRANSFER_STATUS_META: Record<string, { label: string; result: LogResult }> = {
  transfer_approval_requested: { label: "이관 승인요청", result: "request" },
  transfer_cs_responsible_approved: { label: "CS책임 1차 승인", result: "approve" },
  transfer_cs_responsible_rejected: { label: "CS책임 반려", result: "reject" },
  transfer_team_lead_approved: { label: "팀장 최종 승인", result: "approve" },
  transfer_team_lead_rejected: { label: "팀장 반려", result: "reject" },
};

const INSTALL_STEP_META: Record<string, { label: string; result: LogResult }> = {
  step_approval_requested: { label: "단계 승인요청", result: "request" },
  step_responsible_approved: { label: "책임 1차 승인", result: "approve" },
  step_final_approved: { label: "팀장 최종 승인", result: "approve" },
  step_approval_rejected: { label: "단계 반려", result: "reject" },
};

const RESULT_LABEL: Record<LogResult, string> = {
  request: "요청",
  approve: "승인",
  reject: "반려",
};
const RESULT_BADGE: Record<LogResult, string> = {
  request: "bg-blue-50 text-blue-700 border border-blue-200",
  approve: "bg-green-50 text-green-700 border border-green-200",
  reject: "bg-red-50 text-red-700 border border-red-200",
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function ApprovalLogSection() {
  const authError = await requireApprovalResponsible();
  if (authError) return null;

  const supabase = await createClient();

  const [transferResult, installResult] = await Promise.all([
    supabase
      .from("franchise_application_logs")
      .select(
        "id,to_status,details,created_at,user_name,user:profiles(name),franchise_application:franchise_applications(business_name,owner_name)",
      )
      .in("to_status", Object.keys(TRANSFER_STATUS_META))
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("installation_activity_logs")
      .select(
        "id,action,details,created_at,user_name,user:profiles!installation_activity_logs_user_id_fkey(name),installation:installations(customer_name)",
      )
      .in("action", Object.keys(INSTALL_STEP_META))
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const transferLogs = (transferResult.data ?? []) as unknown as FranchiseTransferLogRow[];
  const installLogs = (installResult.data ?? []) as unknown as InstallStepLogRow[];

  const entries: LogEntry[] = [
    ...transferLogs.map((log) => {
      const meta = TRANSFER_STATUS_META[log.to_status ?? ""];
      const franchise = one(log.franchise_application);
      const details = (log.details ?? {}) as { rejection_reason?: string | null };
      return {
        id: `transfer-${log.id}`,
        source: "transfer" as const,
        subject: franchise?.business_name || franchise?.owner_name || "삭제된 가맹접수",
        stageLabel: meta?.label ?? log.to_status ?? "-",
        result: meta?.result ?? "request",
        actorName: log.user_name ?? one(log.user)?.name ?? "알 수 없음",
        reason: details.rejection_reason || null,
        createdAt: log.created_at,
      };
    }),
    ...installLogs.map((log) => {
      const meta = INSTALL_STEP_META[log.action];
      const details = (log.details ?? {}) as { reason?: string | null };
      return {
        id: `install-${log.id}`,
        source: "install_step" as const,
        subject: one(log.installation)?.customer_name || "삭제된 설치건",
        stageLabel: meta?.label ?? log.action,
        result: meta?.result ?? "request",
        actorName: log.user_name ?? one(log.user)?.name ?? "알 수 없음",
        reason: details.reason || null,
        createdAt: log.created_at,
      };
    }),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 300);

  return (
    <section>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">승인요청/반려 로그</h1>
        <p className="mt-1 text-sm text-slate-500">
          기술지원 이관 승인과 설치 단계 승인의 요청·승인·반려 이력입니다. 최근 300건이며,
          CS책임·기술지원책임·팀장·관리자·마스터만 조회할 수 있습니다.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">시각</th>
              <th className="px-4 py-3">구분</th>
              <th className="px-4 py-3">대상</th>
              <th className="px-4 py-3">단계</th>
              <th className="px-4 py-3">결과</th>
              <th className="px-4 py-3">처리자</th>
              <th className="px-4 py-3">사유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  기록이 없습니다.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {formatTimestamp(entry.createdAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {entry.source === "transfer" ? "기술지원 이관" : "설치 단계"}
                </td>
                <td
                  className="max-w-[160px] truncate px-4 py-3 font-medium text-slate-900"
                  title={entry.subject}
                >
                  {entry.subject}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{entry.stageLabel}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_BADGE[entry.result]}`}
                  >
                    {RESULT_LABEL[entry.result]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{entry.actorName}</td>
                <td
                  className="max-w-[240px] truncate px-4 py-3 text-slate-500"
                  title={entry.reason ?? undefined}
                >
                  {entry.reason ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
