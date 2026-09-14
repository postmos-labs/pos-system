"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { kstWallClock } from "@/lib/date";
import { RotateCcw, Trash2 } from "lucide-react";
import { restoreTickets, purgeTickets } from "../actions";
import { STATUS_LABEL, STATUS_COLOR, type TicketStatus } from "@/types";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import { useToast } from "@/components/ui/Toast";

interface TrashTicket {
  id: string;
  title: string;
  status: string;
  deleted_at: string;
  merchant?: { business_name: string; phone: string } | null;
  deleted_by_profile?: { name: string } | null;
}

export default function TrashClient({
  tickets,
  isAdmin,
}: {
  tickets: TrashTicket[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [restoring, setRestoring] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleRestore() {
    if (selected.size === 0) return;
    setRestoring(true);
    const { error } = await restoreTickets([...selected]);
    setRestoring(false);
    if (error) {
      toast.error("복구 실패: " + error);
      return;
    }
    toast.success(`${selected.size}건 복구되었습니다`);
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  async function confirmPurge() {
    setPurging(true);
    const { error } = await purgeTickets([...selected]);
    setPurging(false);
    setPurgeConfirmOpen(false);
    if (error) {
      toast.error("완전 삭제 실패: " + error);
      return;
    }
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-slate-200 shadow-lg rounded-xl px-5 py-3">
          <span className="text-sm text-blue-700 font-medium">{selected.size}건 선택</span>
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
          >
            <RotateCcw size={14} />
            {restoring ? "복구 중..." : "복구"}
          </button>
          {isAdmin && (
            <button
              onClick={() => setPurgeConfirmOpen(true)}
              disabled={purging}
              className="flex items-center gap-1.5 text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 px-3 py-1.5 rounded-lg"
            >
              <Trash2 size={14} />
              완전 삭제
            </button>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-slate-400 hover:text-slate-600"
          >
            취소
          </button>
        </div>
      )}

      {tickets.length === 0 && <EmptyState message="휴지통이 비어 있습니다" />}

      <div className="divide-y divide-slate-50">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.has(ticket.id)}
              onChange={() => toggleOne(ticket.id)}
              className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
            />
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge colorClass={STATUS_COLOR[ticket.status as TicketStatus]}>
                  {STATUS_LABEL[ticket.status as TicketStatus]}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-slate-900 break-words">{ticket.title}</p>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-medium">
                  {ticket.merchant?.business_name || <span className="text-slate-400">-</span>}
                </span>
                <span>
                  {format(kstWallClock(ticket.deleted_at), "M/d HH:mm", { locale: ko })} 삭제
                  {ticket.deleted_by_profile?.name && ` · ${ticket.deleted_by_profile.name}`}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <BulkConfirmDialog
        open={purgeConfirmOpen}
        title="완전 삭제 (복구 불가)"
        busy={purging}
        confirmText="완전 삭제"
        confirmColor="red"
        items={tickets.filter((t) => selected.has(t.id)).map((t) => ({ id: t.id, label: t.title }))}
        onCancel={() => setPurgeConfirmOpen(false)}
        onConfirm={confirmPurge}
      />
    </div>
  );
}
