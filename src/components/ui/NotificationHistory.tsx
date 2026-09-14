"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatKst } from "@/lib/date";

type NotificationLog = {
  id: string;
  template_key: string;
  status: string;
  error: string | null;
  created_at: string;
  user_name: string | null;
  recipient_masked: string | null;
  provider_message_id: string | null;
  user: { name: string } | null;
};

export function NotificationHistory({
  entityType,
  entityId,
  labelMap,
}: {
  entityType: string;
  entityId: string;
  labelMap?: Record<string, string>;
}) {
  const [logs, setLogs] = useState<NotificationLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("notification_logs")
      .select(
        "id, template_key, status, error, created_at, user_name, recipient_masked, provider_message_id, user:profiles(name)",
      )
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setLogs((data as unknown as NotificationLog[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 mb-1.5">알림톡 발송이력</p>
      {logs === null ? (
        <p className="text-xs text-slate-400">불러오는 중...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-slate-400">발송 이력이 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {logs.map((log) => (
            <li
              key={log.id}
              className={`text-xs ${log.status === "failed" ? "text-red-500" : "text-blue-500"}`}
            >
              {formatKst(log.created_at)} · {log.user_name ?? log.user?.name ?? "알수없음"} ·{" "}
              {labelMap?.[log.template_key] ?? log.template_key}
              {log.recipient_masked ? ` · ${log.recipient_masked}` : ""}
              {log.provider_message_id ? ` · Solapi ${log.provider_message_id}` : ""}
              {log.status === "failed" ? ` (실패${log.error ? `: ${log.error}` : ""})` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function logNotification({
  entityType,
  entityId,
  templateKey,
  status = "sent",
  error,
}: {
  entityType: string;
  entityId: string;
  templateKey: string;
  status?: "sent" | "failed";
  error?: string;
}) {
  const supabase = createClient();
  await supabase.from("notification_logs").insert({
    entity_type: entityType,
    entity_id: entityId,
    template_key: templateKey,
    status,
    error: error ?? null,
    user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
  });
}
