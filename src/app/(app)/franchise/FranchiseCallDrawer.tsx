"use client";

import { useEffect, useState } from "react";
import { Ban, PhoneCall, PhoneMissed, RotateCcw, Settings, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatKst } from "@/lib/date";
import {
  resolveFranchiseCallAlertRecipients,
  type FranchiseCallAlertConfig,
  type FranchiseCallAlertEvent,
} from "@/lib/franchiseCallAlerts";
import type { FranchiseApplication } from "@/types";
import { APPLICANT_TYPE_LABEL } from "@/types";
import { getFranchiseCallAlertSettings } from "./callAlertActions";
import FranchiseCallAlertSettings from "./FranchiseCallAlertSettings";

interface CallLogEntry {
  id: string;
  call_type: "missed" | "completed" | "reconsult";
  created_at: string;
  user_name: string | null;
  note: string | null;
}

interface Props {
  row: FranchiseApplication;
  currentUserName: string;
  currentUserId: string;
  onClose: () => void;
  onRecordMissed: (
    row: FranchiseApplication,
    note?: string,
    cancelReason?: string,
  ) => boolean | Promise<boolean>;
  onRecordCompleted: (row: FranchiseApplication, note?: string) => boolean | Promise<boolean>;
  onReconsult: (row: FranchiseApplication, note: string) => boolean | Promise<boolean>;
  onCancel: (row: FranchiseApplication, reason: string) => void | Promise<void>;
}

function formatEntryDate(value: string) {
  return formatKst(value);
}

export default function FranchiseCallDrawer({
  row,
  currentUserName,
  currentUserId,
  onClose,
  onRecordMissed,
  onRecordCompleted,
  onReconsult,
  onCancel,
}: Props) {
  const [logs, setLogs] = useState<CallLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState("");
  const [alertConfig, setAlertConfig] = useState<FranchiseCallAlertConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reconsultOpen, setReconsultOpen] = useState(false);
  const [reconsultNote, setReconsultNote] = useState("");
  const missedCount = row.missed_call_count ?? 0;
  const aboutToCancel = missedCount === 2;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("franchise_application_call_logs")
        .select("id, call_type, created_at, note, user:profiles(name)")
        .eq("franchise_application_id", row.id)
        .order("created_at", { ascending: false });
      if (!active) return;
      setLogs(
        (
          (data ?? []) as unknown as Array<{
            id: string;
            call_type: "missed" | "completed" | "reconsult";
            created_at: string;
            note: string | null;
            user: { name: string | null } | { name: string | null }[] | null;
          }>
        ).map((entry) => ({
          id: entry.id,
          call_type: entry.call_type,
          created_at: entry.created_at,
          note: entry.note,
          user_name: Array.isArray(entry.user)
            ? (entry.user[0]?.name ?? null)
            : (entry.user?.name ?? null),
        })),
      );
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [row.id]);

  useEffect(() => {
    let active = true;
    getFranchiseCallAlertSettings()
      .then((config) => {
        if (active) setAlertConfig(config);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  function recipientSummary(event: FranchiseCallAlertEvent) {
    if (!alertConfig) return "불러오는 중…";
    const ids = resolveFranchiseCallAlertRecipients(
      alertConfig.settings[event],
      row,
      currentUserId,
    );
    if (ids.length === 0) return "알림 받을 사람 없음 (⚙ 알림 설정에서 지정)";
    return ids
      .map((id) => alertConfig.candidates.find((c) => c.id === id)?.name ?? "알 수 없음")
      .join(", ");
  }

  async function handleMissed() {
    setSubmitting(true);
    try {
      const trimmedNote = note.trim() || undefined;
      let ok: boolean;
      if (aboutToCancel) {
        const reason = window.prompt(
          "이번 통화 부재로 3회가 되어 접수가 자동으로 취소됩니다. 취소 사유를 입력해주세요 (선택).",
        );
        if (reason === null) return;
        ok = await onRecordMissed(row, trimmedNote, reason || undefined);
      } else {
        if (!confirm("통화 부재를 기록하시겠습니까?")) return;
        ok = await onRecordMissed(row, trimmedNote);
      }
      if (!ok) return;
      setLogs((prev) => [
        {
          id: `local-${Date.now()}`,
          call_type: "missed",
          created_at: new Date().toISOString(),
          user_name: currentUserName,
          note: trimmedNote ?? null,
        },
        ...prev,
      ]);
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleted() {
    if (!confirm("통화 완료를 기록하시겠습니까?")) return;
    setSubmitting(true);
    try {
      const trimmedNote = note.trim() || undefined;
      const ok = await onRecordCompleted(row, trimmedNote);
      if (!ok) return;
      setLogs((prev) => [
        {
          id: `local-${Date.now()}`,
          call_type: "completed",
          created_at: new Date().toISOString(),
          user_name: currentUserName,
          note: trimmedNote ?? null,
        },
        ...prev,
      ]);
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReconsult() {
    const trimmedNote = reconsultNote.trim();
    if (!trimmedNote) {
      alert("재상담 비고를 입력해주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await onReconsult(row, trimmedNote);
      if (!ok) return;
      setLogs((prev) => [
        {
          id: `local-${Date.now()}`,
          call_type: "reconsult",
          created_at: new Date().toISOString(),
          user_name: currentUserName,
          note: trimmedNote,
        },
        ...prev,
      ]);
      setReconsultNote("");
      setNote("");
      setReconsultOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      alert("취소 사유를 통화 메모에 입력해주세요.");
      return;
    }
    if (!confirm(`이 접수를 취소 처리하시겠습니까?\n알림: ${recipientSummary("cancel")}`)) return;
    setSubmitting(true);
    try {
      await onCancel(row, trimmedNote);
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[32rem] max-w-[calc(100vw-3rem)] h-[75vh] max-h-[75vh] flex flex-col bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
        <p className="flex items-center gap-2 text-base font-semibold min-w-0">
          <PhoneCall size={20} className="shrink-0 text-blue-300" />
          <span className="truncate">
            통화기록 · {row.business_name || row.owner_name || "-"}
            <span className="text-slate-400 font-normal text-sm ml-2">
              {row.owner_name || "-"} · {APPLICANT_TYPE_LABEL[row.applicant_type]} ·{" "}
              {row.phone || "-"}
            </span>
          </span>
        </p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors shrink-0"
            aria-label="알림 설정"
            title="재상담·취소 알림 받을 사람 설정"
          >
            <Settings size={18} />
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors shrink-0"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <FranchiseCallAlertSettings
          config={alertConfig}
          onSaved={(s) =>
            setAlertConfig((prev) =>
              prev ? { ...prev, settings: { ...prev.settings, [s.event]: s } } : prev,
            )
          }
          onClose={() => setSettingsOpen(false)}
        />
      ) : (
        <>
          <div className="px-5 py-4 border-b border-slate-700 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>
                부재 <span className="font-semibold text-red-300">{missedCount}/3</span> · 완료{" "}
                <span className="font-semibold text-green-300">
                  {row.completed_call_count ?? 0}
                </span>
                회
              </span>
              {row.status === "canceled" && row.cancel_reason && (
                <span className="text-xs text-slate-400">취소사유: {row.cancel_reason}</span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              부재중 통화가 3회 누적되면 접수가 자동으로 취소 상태로 전환됩니다.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="통화 메모 (선택) — 부재/완료 기록에 저장되며, 취소처리 시 비고 메모에 저장됩니다"
              rows={2}
              disabled={row.status === "canceled"}
              className="w-full bg-slate-800 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm resize-y text-white placeholder:text-slate-500 disabled:opacity-40"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleMissed}
                disabled={submitting || row.status === "canceled"}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 border border-red-400/30 text-red-300 hover:bg-red-500/20 px-3 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PhoneMissed size={14} /> 통화 부재
              </button>
              <button
                onClick={handleCompleted}
                disabled={submitting || row.status === "canceled"}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500/10 border border-green-400/30 text-green-300 hover:bg-green-500/20 px-3 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PhoneCall size={14} /> 통화완료
              </button>
              <button
                onClick={() => {
                  if (reconsultOpen) {
                    setReconsultOpen(false);
                    return;
                  }
                  setReconsultNote(note);
                  setReconsultOpen(true);
                }}
                disabled={submitting || row.status === "canceled"}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-300 hover:bg-amber-500/20 px-3 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw size={14} /> 재상담
              </button>
              <button
                onClick={handleCancel}
                disabled={submitting || row.status === "canceled"}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-500/10 border border-slate-400/30 text-slate-200 hover:bg-slate-500/20 px-3 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Ban size={14} /> 취소처리
              </button>
            </div>
            {reconsultOpen && row.status !== "canceled" && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 space-y-2">
                <p className="text-xs font-semibold text-amber-300">재상담 비고</p>
                <textarea
                  autoFocus
                  value={reconsultNote}
                  onChange={(e) => setReconsultNote(e.target.value)}
                  placeholder="다시 상담해야 하는 이유나 안내할 내용을 적어주세요 (필수)"
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm resize-y text-white placeholder:text-slate-500 disabled:opacity-40"
                />
                <p className="text-xs text-slate-400">알림: {recipientSummary("reconsult")}</p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setReconsultOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    닫기
                  </button>
                  <button
                    onClick={handleReconsult}
                    disabled={submitting || !reconsultNote.trim()}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    재상담 등록
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
            <p className="text-xs font-semibold text-slate-400 mb-2">통화 이력</p>
            {loading ? (
              <p className="text-sm text-slate-400">불러오는 중...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-slate-400">통화 이력이 없습니다.</p>
            ) : (
              <ul className="space-y-2.5">
                {logs.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      {entry.call_type === "missed" ? (
                        <PhoneMissed size={14} className="text-red-300 shrink-0" />
                      ) : entry.call_type === "reconsult" ? (
                        <RotateCcw size={14} className="text-amber-300 shrink-0" />
                      ) : (
                        <PhoneCall size={14} className="text-green-300 shrink-0" />
                      )}
                      <span className="text-slate-300">
                        {entry.call_type === "missed"
                          ? "부재"
                          : entry.call_type === "reconsult"
                            ? "재상담"
                            : "완료"}
                      </span>
                      <span className="text-slate-500">{formatEntryDate(entry.created_at)}</span>
                      {entry.user_name && (
                        <span className="text-blue-300 font-semibold">{entry.user_name}</span>
                      )}
                    </div>
                    {entry.note && (
                      <p className="mt-1 ml-6 whitespace-pre-wrap break-words text-slate-300">
                        {entry.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
