"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatKst } from "@/lib/date";

type ActivityLog = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  created_at: string;
  user_name: string;
  details: Record<string, string | undefined>;
  user: { name: string } | null;
  from_assignee: { name: string } | null;
  to_assignee: { name: string } | null;
};

const ACTION_LABEL: Record<string, string> = {
  created: "설치건 등록",
  status_changed: "상태 변경",
  assignment_changed: "담당자 변경",
  completion_requested: "완료 승인요청",
  completion_approved: "완료 승인",
  completion_rejected: "완료 반려",
  step_approval_requested: "단계 승인요청",
  step_responsible_approved: "기술지원책임 1차 승인",
  step_final_approved: "팀장 최종 승인",
  step_approval_rejected: "단계 승인 반려",
};

export default function InstallationActivityHistory({
  installationId,
  statusLabels,
}: {
  installationId: string;
  statusLabels: Record<string, string>;
}) {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("installation_activity_logs")
      .select(
        "id, action, from_status, to_status, created_at, user_name, details, user:profiles!installation_activity_logs_user_id_fkey(name), from_assignee:profiles!installation_activity_logs_from_assigned_to_fkey(name), to_assignee:profiles!installation_activity_logs_to_assigned_to_fkey(name)",
      )
      .eq("installation_id", installationId)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!cancelled) setLogs((data as unknown as ActivityLog[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-1.5">작업 이력</p>
      {logs === null ? (
        <p className="text-xs text-slate-400">불러오는 중...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-slate-400">작업 이력이 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((log) => {
            const statusChange =
              log.from_status || log.to_status
                ? ` · ${log.from_status ? (statusLabels[log.from_status] ?? log.from_status) : "-"} → ${log.to_status ? (statusLabels[log.to_status] ?? log.to_status) : "-"}`
                : "";
            const assignmentChange =
              log.action === "assignment_changed"
                ? ` · ${log.from_assignee?.name ?? "미배정"} → ${log.to_assignee?.name ?? "미배정"}`
                : "";
            const detail = log.details?.scheduled_date
              ? ` · ${log.details.scheduled_date} ${log.details.scheduled_time ?? ""}`
              : log.details?.eta
                ? ` · 도착예정 ${log.details.eta}`
                : log.details?.reason
                  ? ` · ${log.details.reason}`
                  : "";
            return (
              <li key={log.id} className="text-xs text-slate-500">
                {formatKst(log.created_at)} · {log.user_name ?? log.user?.name ?? "알수없음"} ·{" "}
                {ACTION_LABEL[log.action] ?? log.action}
                {statusChange}
                {assignmentChange}
                {detail}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
