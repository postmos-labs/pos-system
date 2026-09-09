"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus, Search } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import { AppSelect } from "@/components/ui/AppSelect";
import SupplyRequestForm from "./SupplyRequestForm";
import SupplyRequestDetailDrawer from "./SupplyRequestDetailDrawer";
import {
  SUPPLY_REQUEST_STATUSES,
  SUPPLY_STATUS_STYLE,
  canDecideSupplyRequest,
  isEditableByRequester,
  type SupplyRequest,
  type SupplyRequestInput,
  type SupplyRequestStatus,
} from "./supplyRequest";
import {
  createSupplyRequest,
  updateSupplyRequest,
  decideSupplyRequest,
  deleteSupplyRequests,
} from "./actions";
import type { Profile } from "@/types";

function formatDateTime(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

/** 새 요청을 긴급 건들 뒤(비긴급) 또는 맨 앞(긴급)에 끼워 넣는다. */
function insertRow(rows: SupplyRequest[], row: SupplyRequest) {
  if (row.is_urgent) return [row, ...rows];
  const firstNonUrgentIndex = rows.findIndex((r) => !r.is_urgent);
  if (firstNonUrgentIndex === -1) return [...rows, row];
  return [...rows.slice(0, firstNonUrgentIndex), row, ...rows.slice(firstNonUrgentIndex)];
}

interface Props {
  rows: SupplyRequest[];
  profile: Profile;
  schemaMissing?: boolean;
}

export default function SupplyRequestsClient({ rows, profile, schemaMissing }: Props) {
  const toast = useToast();
  const canDecide = canDecideSupplyRequest(profile);
  const isAdminRole = profile.role === "admin" || profile.role === "master";
  const [localRows, setLocalRows] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SupplyRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SupplyRequestStatus>("all");
  const [myOnly, setMyOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSelectable = useCallback(
    (row: SupplyRequest) =>
      isAdminRole || (row.requester_id === profile.id && isEditableByRequester(row.status)),
    [isAdminRole, profile.id],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return localRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (myOnly && row.requester_id !== profile.id) return false;
      if (term) {
        const haystack =
          `${row.item_name} ${row.description ?? ""} ${row.requester_name ?? ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [localRows, search, statusFilter, myOnly, profile.id]);

  const selectableRows = useMemo(
    () => filteredRows.filter(isSelectable),
    [filteredRows, isSelectable],
  );
  const allChecked = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        selectableRows.forEach((r) => next.delete(r.id));
        return next;
      }
      return new Set([...prev, ...selectableRows.map((r) => r.id)]);
    });
  }, [allChecked, selectableRows]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    const { deleted, deletedIds, error } = await deleteSupplyRequests([...selected]);
    setDeleting(false);
    if (error) {
      toast.error("삭제 실패: " + error);
      return;
    }
    const deletedSet = new Set(deletedIds);
    setLocalRows((prev) => prev.filter((r) => !deletedSet.has(r.id)));
    setSelected(new Set());
    if (deleted < selected.size) {
      toast.warning(`${deleted}건 삭제, 나머지는 권한이 없어 건너뛰었습니다.`);
    }
  }, [selected, toast]);

  const handleCreate = useCallback(
    async (input: SupplyRequestInput) => {
      setSubmitting(true);
      const { row, error } = await createSupplyRequest(input);
      setSubmitting(false);
      if (error || !row) {
        toast.error("등록 실패: " + (error ?? "알 수 없는 오류"));
        return;
      }
      setLocalRows((prev) => insertRow(prev, row));
      setShowForm(false);
      toast.success("물품요청을 등록했습니다.");
    },
    [toast],
  );

  const handleUpdate = useCallback(
    async (input: SupplyRequestInput) => {
      if (!editing) return;
      setSubmitting(true);
      const { row, error } = await updateSupplyRequest(editing.id, input);
      setSubmitting(false);
      if (error || !row) {
        toast.error("수정 실패: " + (error ?? "알 수 없는 오류"));
        return;
      }
      setLocalRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      setEditing(null);
    },
    [editing, toast],
  );

  const handleDecide = useCallback(
    async (row: SupplyRequest, status: SupplyRequestStatus, note: string) => {
      setBusy(true);
      const { row: updated, error } = await decideSupplyRequest(row.id, status, note);
      setBusy(false);
      if (error || !updated) {
        toast.error("처리 실패: " + (error ?? "알 수 없는 오류"));
        return;
      }
      setLocalRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`${status} 처리했습니다.`);
    },
    [toast],
  );

  const handleDeleteOne = useCallback(
    async (row: SupplyRequest) => {
      setBusy(true);
      const { deleted, error } = await deleteSupplyRequests([row.id]);
      setBusy(false);
      if (error || deleted === 0) {
        toast.error("삭제 실패: " + (error ?? "권한이 없습니다."));
        return;
      }
      setLocalRows((prev) => prev.filter((r) => r.id !== row.id));
      setExpandedId(null);
    },
    [toast],
  );

  return (
    <div className="flex flex-col h-full">
      {schemaMissing && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          물품요청 마이그레이션(supabase/145)이 아직 적용되지 않았습니다.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="물품명, 설명, 요청자..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as "all" | SupplyRequestStatus)}
          aria-label="상태 필터"
          options={[
            { value: "all", label: "전체" },
            ...SUPPLY_REQUEST_STATUSES.map((status) => ({ value: status, label: status })),
          ]}
        />
        <button
          onClick={() => setMyOnly((v) => !v)}
          className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
            myOnly
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          내 요청만
        </button>
        {(search || statusFilter !== "all" || myOnly) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setMyOnly(false);
            }}
            className="text-sm text-slate-400 hover:text-red-500 px-2 py-2 transition-colors"
          >
            초기화
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-slate-500">
            전체 {filteredRows.length.toLocaleString()}건
          </div>
          <button
            onClick={() => setShowForm(true)}
            disabled={schemaMissing}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} />
            등록
          </button>
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

      {showForm && (
        <SupplyRequestForm
          onSubmit={handleCreate}
          submitting={submitting}
          onClose={() => setShowForm(false)}
        />
      )}

      {editing && (
        <SupplyRequestForm
          initial={editing}
          onSubmit={handleUpdate}
          submitting={submitting}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 border-b border-slate-200 w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                  className="w-4 h-4 accent-blue-600 cursor-pointer"
                />
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                물품명
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                수량
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200">
                설명
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                필요 시기
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                요청자
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                상태
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                처리자
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                요청일시
              </th>
              <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                상세
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-slate-100 hover:bg-blue-50 transition-colors"
              >
                <td className="px-3 py-3">
                  {isSelectable(row) && (
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      className="w-4 h-4 accent-blue-600 cursor-pointer"
                    />
                  )}
                </td>
                <td className="px-3 py-3 font-medium text-slate-900 whitespace-nowrap min-w-[140px]">
                  {row.is_urgent && (
                    <span className="mr-1.5 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-600">
                      긴급
                    </span>
                  )}
                  {row.item_name}
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                  {row.quantity}
                  {row.unit ? ` ${row.unit}` : ""}
                </td>
                <td className="px-3 py-3 text-slate-700 min-w-[280px]">
                  <div className="line-clamp-2 whitespace-pre-wrap">{row.description}</div>
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                  {row.needed_by || "-"}
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                  {row.requester_name ?? "-"}
                  {row.requester_team ? ` · ${row.requester_team}` : ""}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${SUPPLY_STATUS_STYLE[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-700 whitespace-nowrap">
                  {row.approver_name ?? "-"}
                  {row.approver_id && row.approver_id === row.requester_id ? " (본인)" : ""}
                </td>
                <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <button
                    onClick={() => setExpandedId(row.id)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    상세보기
                  </button>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-slate-400 py-10">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {expandedId &&
        (() => {
          const row = localRows.find((r) => r.id === expandedId);
          if (!row) return null;
          return (
            <SupplyRequestDetailDrawer
              key={row.id}
              row={row}
              profile={profile}
              canDecide={canDecide}
              onClose={() => setExpandedId(null)}
              onDecide={(status, note) => handleDecide(row, status, note)}
              onEdit={() => {
                setExpandedId(null);
                setEditing(row);
              }}
              onDelete={() => handleDeleteOne(row)}
              busy={busy}
            />
          );
        })()}
    </div>
  );
}
