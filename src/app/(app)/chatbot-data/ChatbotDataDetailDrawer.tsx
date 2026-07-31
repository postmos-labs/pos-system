"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";
import type { ChatbotDataRow } from "./ChatbotDataClient";

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

interface Props {
  row: ChatbotDataRow;
  onClose: () => void;
  onSave: (
    value: Pick<ChatbotDataRow, "problem_situation" | "solution" | "company_name" | "phone">,
  ) => Promise<boolean>;
}

export default function ChatbotDataDetailDrawer({ row, onClose, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problemSituation, setProblemSituation] = useState(row.problem_situation);
  const [solution, setSolution] = useState(row.solution);
  const [companyName, setCompanyName] = useState(row.company_name ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const canSave = problemSituation.trim() && solution.trim();

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const saved = await onSave({
      problem_situation: problemSituation.trim(),
      solution: solution.trim(),
      company_name: companyName.trim() || null,
      phone: phone.trim() || null,
    });
    setSaving(false);
    if (saved) setEditing(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="chatbot-data-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="absolute inset-y-0 right-0 flex h-dvh w-[560px] max-w-[calc(100vw-32px)] flex-col bg-white text-slate-900 shadow-2xl"
      >
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="chatbot-data-detail-title" className="text-lg font-bold text-slate-900">
                상세정보
              </h2>
              <p className="mt-1 text-[13.5px] text-slate-500">등록자 {row.registrant_name}</p>
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="inline-flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
          <div className="mt-3 text-sm text-slate-500">
            등록 {formatDateTime(row.created_at)} · 수정 {formatDateTime(row.updated_at)}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
              상호명
              {editing ? (
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {row.company_name ?? "-"}
                </div>
              )}
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
              연락처
              {editing ? (
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {row.phone ?? "-"}
                </div>
              )}
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            문제상황
            {editing ? (
              <textarea
                rows={8}
                value={problemSituation}
                onChange={(event) => setProblemSituation(event.target.value)}
                className="resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <div className="min-h-[120px] whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-normal leading-6 text-slate-700">
                {row.problem_situation}
              </div>
            )}
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-500">
            해결방법
            {editing ? (
              <textarea
                rows={10}
                value={solution}
                onChange={(event) => setSolution(event.target.value)}
                className="resize-none rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <div className="min-h-[160px] whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2.5 text-sm font-normal leading-6 text-slate-700">
                {row.solution}
              </div>
            )}
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setProblemSituation(row.problem_situation);
                  setSolution(row.solution);
                  setCompanyName(row.company_name ?? "");
                  setPhone(row.phone ?? "");
                  setEditing(false);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={saving || !canSave}
                onClick={() => void handleSave()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Pencil size={14} />
              수정
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
