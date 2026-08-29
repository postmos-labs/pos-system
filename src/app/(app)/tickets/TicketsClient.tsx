"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronRight, Search } from "lucide-react";
import { deleteTickets } from "./actions";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  TYPE_LABEL,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  TEAM_LABEL,
  TEAM_COLOR,
  type TicketStatus,
  type TicketType,
  type Priority,
  type TicketTeam,
} from "@/types";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";

interface Ticket {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  team?: TicketTeam | null;
  scheduled_at?: string;
  created_at: string;
  merchant?: { business_name: string; phone: string } | null;
  tech?: { name: string } | null;
}

export default function TicketsClient({
  tickets,
  initialSearch = "",
}: {
  tickets: Ticket[];
  initialSearch?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [search, setSearch] = useState(initialSearch);

  // 검색은 서버가 전체 범위에서 수행한다(현재 페이지 50건만 걸러지는 문제 방지).
  // 입력 후 400ms 지나면 q 파라미터로 반영하고 1페이지부터 다시 본다.
  useEffect(() => {
    const current = (searchParams.get("q") ?? "").trim();
    if (search.trim() === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      next.delete("page");
      router.replace(`/tickets?${next.toString()}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [search, searchParams, router]);

  const filteredTickets = search.trim()
    ? tickets.filter((t) => {
        const q = search.trim().toLowerCase();
        // 서버(q 파라미터)가 거르는 필드와 같은 범위여야 한다 — 전화번호가 빠지면
        // 서버가 찾아준 행을 여기서 도로 숨긴다.
        return (
          t.title?.toLowerCase().includes(q) ||
          t.merchant?.business_name?.toLowerCase().includes(q) ||
          t.merchant?.phone?.toLowerCase().includes(q) ||
          t.tech?.name?.toLowerCase().includes(q)
        );
      })
    : tickets;

  const allChecked = filteredTickets.length > 0 && filteredTickets.every((t) => selected.has(t.id));

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(filteredTickets.map((t) => t.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDelete() {
    if (selected.size === 0) return;
    setDeleteConfirmOpen(true);
  }

  async function confirmDelete() {
    setDeleting(true);
    const { error } = await deleteTickets([...selected]);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    if (error) {
      alert("삭제 실패: " + error);
      return;
    }
    setSelected(new Set());
    startTransition(() => router.refresh());
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {}
      <div className="px-6 py-3 border-b border-slate-100">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="가맹점명, 제목, 담당 기사로 검색"
            className="w-full text-sm border border-slate-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <BulkDeleteActions
          count={selected.size}
          deleting={deleting}
          onDelete={handleDelete}
          onCancel={() => setSelected(new Set())}
        />
      )}

      {filteredTickets.length === 0 && (
        <EmptyState message={search.trim() ? "검색 결과가 없습니다" : "인입내역이 없습니다"} />
      )}

      <div className="divide-y divide-slate-50">
        {filteredTickets.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-2.5 bg-slate-50 border-b border-slate-100">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
            <span className="text-xs text-slate-400 font-medium">전체 선택</span>
          </div>
        )}
        {filteredTickets.map((ticket) => (
          <div
            key={ticket.id}
            className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50 transition-colors group"
          >
            <input
              type="checkbox"
              checked={selected.has(ticket.id)}
              onChange={() => toggleOne(ticket.id)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
            />
            <Link href={`/tickets/${ticket.id}`} className="flex items-center gap-4 flex-1 min-w-0">
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge colorClass={STATUS_COLOR[ticket.status as TicketStatus]}>
                    {STATUS_LABEL[ticket.status as TicketStatus]}
                  </Badge>
                  <Badge colorClass={PRIORITY_COLOR[ticket.priority as Priority]}>
                    {PRIORITY_LABEL[ticket.priority as Priority]}
                  </Badge>
                  {ticket.team && TEAM_LABEL[ticket.team] && (
                    <Badge colorClass={TEAM_COLOR[ticket.team]}>{TEAM_LABEL[ticket.team]}</Badge>
                  )}
                  <span className="text-xs text-slate-600 font-medium">
                    {TYPE_LABEL[ticket.type as TicketType]}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 break-words">{ticket.title}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="font-medium">
                    {ticket.merchant?.business_name || <span className="text-slate-400">-</span>}
                  </span>
                  {ticket.scheduled_at && (
                    <span>
                      {format(new Date(ticket.scheduled_at), "M/d HH:mm", { locale: ko })}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0 flex items-center gap-2">
                <div>
                  <p className="text-xs text-slate-500">
                    {format(new Date(ticket.created_at), "M/d", { locale: ko })}
                  </p>
                  {ticket.tech?.name && (
                    <p className="text-xs text-slate-600 mt-1 font-medium">{ticket.tech.name}</p>
                  )}
                </div>
                <ChevronRight
                  size={16}
                  className="text-slate-300 group-hover:text-slate-400 transition-colors"
                />
              </div>
            </Link>
          </div>
        ))}
      </div>

      <BulkConfirmDialog
        open={deleteConfirmOpen}
        title="선택 항목 삭제"
        busy={deleting}
        confirmText="삭제"
        confirmColor="red"
        items={tickets.filter((t) => selected.has(t.id)).map((t) => ({ id: t.id, label: t.title }))}
        onCancel={() => setDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
