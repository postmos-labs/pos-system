"use client";

import { X } from "lucide-react";
import type { DevRequest, DevRequestStatus } from "./DevRequestsClient";
import { AppSelect } from "@/components/ui/AppSelect";

const STATUS_STYLE: Record<DevRequestStatus, string> = {
  확인중: "bg-amber-100 text-amber-700",
  미승인: "bg-red-100 text-red-700",
  승인: "bg-emerald-100 text-emerald-700",
  처리완료: "bg-blue-100 text-blue-700",
};

const STATUS_OPTIONS: DevRequestStatus[] = ["확인중", "미승인", "승인", "처리완료"];

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </div>
  );
}

interface Props {
  row: DevRequest;
  onClose: () => void;
  onStatusChange: (status: DevRequestStatus) => void | Promise<void>;
}

export default function DevRequestDetailDrawer({ row, onClose, onStatusChange }: Props) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-request-detail-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white text-slate-900 absolute inset-y-0 right-0 flex h-dvh w-[520px] max-w-[calc(100vw-32px)] flex-col shadow-2xl"
      >
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div id="dev-request-detail-title" className="text-lg font-bold text-slate-900">
                {row.title}
              </div>
              <div className="mt-1 text-[13.5px] text-slate-500">
                요청자 {row.requester_name ?? "-"}
              </div>
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
          <div className="mt-3.5 flex items-center gap-2.5">
            <AppSelect
              aria-label="상태"
              value={row.status}
              onValueChange={(value) => onStatusChange(value as DevRequestStatus)}
              className={`h-auto rounded-md border-none px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[row.status]}`}
              options={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
            />
            <span className="text-sm text-slate-500">
              요청일시 {formatDateTime(row.created_at)}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            <Field label="내용">
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 min-h-[80px]">
                {row.content || "-"}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3.5">
              <Field label="요청자">
                <div className="text-sm text-slate-700">{row.requester_name ?? "-"}</div>
              </Field>
              <Field label="요청일시">
                <div className="text-sm text-slate-700">{formatDateTime(row.created_at)}</div>
              </Field>
              <Field label="승인자">
                <div className="text-sm text-slate-700">{row.approver_name ?? "-"}</div>
              </Field>
              <Field label="승인/완료일시">
                <div className="text-sm text-slate-700">{formatDateTime(row.approved_at)}</div>
              </Field>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
