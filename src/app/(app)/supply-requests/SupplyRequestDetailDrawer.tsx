"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Profile } from "@/types";
import {
  SUPPLY_STATUS_STYLE,
  isEditableByRequester,
  type SupplyRequest,
  type SupplyRequestStatus,
} from "./supplyRequest";

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
  row: SupplyRequest;
  profile: Profile;
  canDecide: boolean;
  onClose: () => void;
  onDecide: (status: SupplyRequestStatus, note: string) => Promise<void>;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  busy: boolean;
}

export default function SupplyRequestDetailDrawer({
  row,
  profile,
  canDecide,
  onClose,
  onDecide,
  onEdit,
  onDelete,
  busy,
}: Props) {
  const [note, setNote] = useState(row.approver_note ?? "");

  const isRequesterEditable = row.requester_id === profile.id && isEditableByRequester(row.status);
  const isAdminRole = profile.role === "admin" || profile.role === "master";
  const showEdit = isRequesterEditable;
  const showDelete = isRequesterEditable || isAdminRole;
  const isSelfApproved = !!row.approver_id && row.approver_id === row.requester_id;

  async function handleDelete() {
    if (!confirm("이 요청을 삭제하시겠습니까?")) return;
    await onDelete();
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/35" onMouseDown={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="supply-request-detail-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white text-slate-900 absolute inset-y-0 right-0 flex h-dvh w-[520px] max-w-[calc(100vw-32px)] flex-col shadow-2xl"
      >
        <div className="flex-shrink-0 border-b border-slate-200 px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <div
                id="supply-request-detail-title"
                className="flex items-center gap-1.5 text-lg font-bold text-slate-900"
              >
                {row.is_urgent && (
                  <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                    긴급
                  </span>
                )}
                {row.item_name}
              </div>
              <div className="mt-1 text-[13.5px] text-slate-500">
                수량 {row.quantity}
                {row.unit ? ` ${row.unit}` : ""} · 요청자 {row.requester_name ?? "-"}
                {row.requester_team ? `(${row.requester_team})` : ""}
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
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${SUPPLY_STATUS_STYLE[row.status]}`}
            >
              {row.status}
            </span>
            <span className="text-sm text-slate-500">
              요청일시 {formatDateTime(row.created_at)}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">
            <Field label="설명·용도">
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 min-h-[80px]">
                {row.description || "-"}
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3.5">
              <Field label="필요 시기">
                <div className="text-sm text-slate-700">{row.needed_by || "-"}</div>
              </Field>
              <Field label="요청자">
                <div className="text-sm text-slate-700">{row.requester_name ?? "-"}</div>
              </Field>
              <Field label="요청일시">
                <div className="text-sm text-slate-700">{formatDateTime(row.created_at)}</div>
              </Field>
              <Field label="처리자">
                <div className="flex items-center gap-1.5 text-sm text-slate-700">
                  {row.approver_name ?? "-"}
                  {isSelfApproved && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      본인 승인
                    </span>
                  )}
                </div>
              </Field>
              <Field label="처리일시">
                <div className="text-sm text-slate-700">{formatDateTime(row.approved_at)}</div>
              </Field>
            </div>

            <Field label="처리 메모">
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700 min-h-[60px]">
                {row.approver_note || "-"}
              </div>
            </Field>

            {canDecide && row.status !== "수령완료" && (
              <div className="flex flex-col gap-2.5 rounded-lg border border-slate-200 p-3.5">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="반려 사유 또는 안내 (반려는 필수)"
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="flex flex-wrap gap-2">
                  {row.status === "요청" && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDecide("승인", note)}
                        className="text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        disabled={busy || !note.trim()}
                        onClick={() => onDecide("반려", note)}
                        className="text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        반려
                      </button>
                    </>
                  )}
                  {row.status === "승인" && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDecide("구매중", note)}
                        className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        구매중
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDecide("수령완료", note)}
                        className="text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        수령완료
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onDecide("요청", note)}
                        className="text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        요청으로 되돌리기
                      </button>
                    </>
                  )}
                  {row.status === "구매중" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDecide("수령완료", note)}
                      className="text-sm font-semibold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      수령완료
                    </button>
                  )}
                  {row.status === "반려" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onDecide("요청", note)}
                      className="text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      요청으로 되돌리기
                    </button>
                  )}
                </div>
              </div>
            )}

            {(showEdit || showDelete) && (
              <div className="flex gap-2">
                {showEdit && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onEdit}
                    className="text-sm font-semibold text-slate-600 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    수정
                  </button>
                )}
                {showDelete && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDelete}
                    className="text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    삭제
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
