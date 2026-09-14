"use client";

import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Search,
  Users,
  ClipboardList,
  PhoneOff,
  FileText,
  ClipboardCheck,
  PauseCircle,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import BulkDeleteActions from "@/components/ui/BulkDeleteActions";
import { AppSelect } from "@/components/ui/AppSelect";
import { DatePickerField } from "@/components/ui/DatePickerField";
import KpiCard from "@/components/ui/KpiCard";
import LeadForm from "./LeadForm";
import { createLead, updateLeadField, closeLead, reopenLead, deleteLeads } from "./actions";
import {
  LEAD_SOURCES,
  CONTACT_STATUSES,
  CONTACT_STATUS_STYLE,
  DOC_STATUSES,
  DOC_STATUS_STYLE,
  DECISIONS,
  DECISION_STYLE,
  DECISION_GUIDE,
  isLeadClosed,
  leadAgeDays,
  LEAD_FLAG_LABELS,
  leadFlags,
  leadKpiCounts,
  matchesLeadKpi,
  type OwnLead,
  type OwnLeadInput,
  type LeadEditableField,
  type LeadKpiKey,
} from "./lead";
import type { Profile } from "@/types";

interface Props {
  rows: OwnLead[];
  profile: Profile;
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  today: string;
  schemaMissing?: boolean;
  initialHighlightId?: string;
}

function formatMD(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type SaveFn = (row: OwnLead, field: LeadEditableField, value: string) => Promise<boolean>;

interface EditableTextProps {
  row: OwnLead;
  field: LeadEditableField;
  onSave: SaveFn;
  disabled?: boolean;
}
const EditableText = memo(function EditableText({
  row,
  field,
  onSave,
  disabled,
}: EditableTextProps) {
  const original = (row[field] as string) ?? "";
  const [value, setValue] = useState(original);
  const commit = useCallback(async () => {
    if (value === original) return;
    const ok = await onSave(row, field, value);
    if (!ok) setValue(original);
  }, [value, original, onSave, row, field]);
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      disabled={disabled}
      className="w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-1 -mx-1 text-sm disabled:opacity-60"
    />
  );
});

interface SelectFieldProps {
  row: OwnLead;
  field: LeadEditableField;
  options: string[];
  onSave: SaveFn;
  pill?: boolean;
  pillStyle?: Record<string, string>;
  title?: string;
  disabled?: boolean;
}
const DEFAULT_PILL = "bg-slate-100 text-slate-600 border-slate-200";
const SelectField = memo(function SelectField({
  row,
  field,
  options,
  onSave,
  pill,
  pillStyle,
  title,
  disabled,
}: SelectFieldProps) {
  const value = (row[field] as string) ?? "";
  const pillClass = pillStyle ? (pillStyle[value] ?? DEFAULT_PILL) : DEFAULT_PILL;
  return (
    <span onClick={(e) => e.stopPropagation()} title={title} className={pill ? "" : "block w-full"}>
      <AppSelect
        value={value}
        onValueChange={(v) => onSave(row, field, v)}
        aria-label={field}
        disabled={disabled}
        className={
          pill
            ? `h-auto rounded-full border-0 pl-2.5 pr-1.5 py-1 text-xs font-medium ${pillClass}`
            : "h-auto w-full border-0 bg-transparent px-1 -mx-1 text-sm"
        }
        options={options.map((o) => ({ value: o, label: o }))}
      />
    </span>
  );
});

interface AssigneeFieldProps {
  row: OwnLead;
  onSave: SaveFn;
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  disabled?: boolean;
}
const AssigneeField = memo(function AssigneeField({
  row,
  onSave,
  csProfiles,
  disabled,
}: AssigneeFieldProps) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="block w-full">
      <AppSelect
        value={row.assignee_id ?? ""}
        onValueChange={(v) => onSave(row, "assignee_id", v)}
        aria-label="담당자"
        disabled={disabled}
        className="h-auto w-full border-0 bg-transparent px-1 -mx-1 text-sm"
        options={[
          { value: "", label: "-" },
          ...csProfiles.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />
    </span>
  );
});

interface DateFieldProps {
  row: OwnLead;
  field: LeadEditableField;
  onSave: SaveFn;
  disabled?: boolean;
}
const DateField = memo(function DateField({ row, field, onSave, disabled }: DateFieldProps) {
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <DatePickerField
        value={(row[field] as string) ?? ""}
        onChange={(v) => onSave(row, field, v)}
        ariaLabel="다음 조치일"
        disabled={disabled}
        className="h-auto border-0 bg-transparent px-1"
      />
    </span>
  );
});

export default function LeadsClient({
  rows,
  profile,
  csProfiles,
  today,
  schemaMissing,
  initialHighlightId,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const isAdminRole = profile.role === "admin" || profile.role === "master";
  const [localRows, setLocalRows] = useState(rows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [kpiFilter, setKpiFilter] = useState<LeadKpiKey>("all");
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (initialHighlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveField = useCallback<SaveFn>(
    async (row, field, value) => {
      const { row: updated, error } = await updateLeadField(row.id, field, value);
      if (error || !updated) {
        toast.error(error ?? "수정 실패");
        return false;
      }
      setLocalRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      return true;
    },
    [toast],
  );

  const handleClose = useCallback(
    async (row: OwnLead) => {
      const reason = prompt("종결 사유를 입력하세요");
      if (reason === null) return;
      if (!reason.trim()) {
        toast.error("종결 사유를 입력하세요.");
        return;
      }
      const { row: updated, error } = await closeLead(row.id, reason.trim());
      if (error || !updated) {
        toast.error(error ?? "종결 실패");
        return;
      }
      setLocalRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("종결했습니다.");
    },
    [toast],
  );

  const handleReopen = useCallback(
    async (row: OwnLead) => {
      const { row: updated, error } = await reopenLead(row.id);
      if (error || !updated) {
        toast.error(error ?? "다시 열기 실패");
        return;
      }
      setLocalRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("다시 열었습니다.");
    },
    [toast],
  );

  const handleCreate = useCallback(
    async (input: OwnLeadInput) => {
      setSubmitting(true);
      const { row, error } = await createLead(input);
      setSubmitting(false);
      if (error || !row) {
        toast.error("등록 실패: " + (error ?? "알 수 없는 오류"));
        return;
      }
      setLocalRows((prev) => [row, ...prev]);
      setShowForm(false);
      toast.success("등록했습니다");
    },
    [toast],
  );

  const isSelectable = useCallback(
    (row: OwnLead) => isAdminRole || row.created_by === profile.id,
    [isAdminRole, profile.id],
  );

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return;
    if (!confirm(`선택한 ${selected.size}건을 삭제하시겠습니까?`)) return;
    setDeleting(true);
    const { deleted, error } = await deleteLeads([...selected]);
    setDeleting(false);
    if (error) {
      toast.error("삭제 실패: " + error);
      return;
    }
    setLocalRows((prev) => prev.filter((r) => !selected.has(r.id)));
    if (deleted < selected.size) {
      toast.warning(`${deleted}건 삭제, 나머지는 권한이 없어 건너뛰었습니다.`);
    }
    setSelected(new Set());
  }, [selected, toast]);

  const kpiCounts = useMemo(() => leadKpiCounts(localRows, today), [localRows, today]);

  const handleKpiClick = useCallback((key: LeadKpiKey) => {
    setKpiFilter((prev) => (prev === key ? "all" : key));
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return localRows
      .filter((r) => matchesLeadKpi(r, kpiFilter, today))
      .filter((r) => {
        if (assigneeFilter === "all") return true;
        if (assigneeFilter === "mine") return r.assignee_id === profile.id;
        return r.assignee_id === assigneeFilter;
      })
      .filter((r) => (flaggedOnly ? leadFlags(r, today).length > 0 : true))
      .filter((r) => {
        if (!term) return true;
        const haystack =
          `${r.business_name} ${r.owner_name ?? ""} ${r.phone ?? ""} ${r.assignee_name ?? ""}`.toLowerCase();
        return haystack.includes(term);
      });
  }, [localRows, kpiFilter, today, assigneeFilter, profile.id, flaggedOnly, search]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const flagDiff = leadFlags(b, today).length - leadFlags(a, today).length;
      if (flagDiff !== 0) return flagDiff;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [filteredRows, today]);

  const selectableRows = useMemo(() => sortedRows.filter(isSelectable), [sortedRows, isSelectable]);
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

  const defaultAssigneeId = profile.role === "cs" ? profile.id : "";

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8 mb-3">
        <KpiCard
          label="전체"
          value={kpiCounts.all}
          icon={Users}
          tone="blue"
          active={kpiFilter === "all"}
          onClick={() => handleKpiClick("all")}
        />
        <KpiCard
          label="확인 전"
          value={kpiCounts.pending}
          icon={ClipboardList}
          tone="amber"
          active={kpiFilter === "pending"}
          onClick={() => handleKpiClick("pending")}
        />
        <KpiCard
          label="미연락"
          value={kpiCounts.uncontacted}
          icon={PhoneOff}
          tone="red"
          active={kpiFilter === "uncontacted"}
          onClick={() => handleKpiClick("uncontacted")}
        />
        <KpiCard
          label="서류 확인중"
          value={kpiCounts.doc_requested}
          icon={FileText}
          tone="amber"
          active={kpiFilter === "doc_requested"}
          onClick={() => handleKpiClick("doc_requested")}
        />
        <KpiCard
          label="접수대상"
          value={kpiCounts.target}
          icon={ClipboardCheck}
          tone="blue"
          active={kpiFilter === "target"}
          onClick={() => handleKpiClick("target")}
        />
        <KpiCard
          label="보류"
          value={kpiCounts.hold}
          icon={PauseCircle}
          tone="amber"
          active={kpiFilter === "hold"}
          onClick={() => handleKpiClick("hold")}
        />
        <KpiCard
          label="확인 필요"
          value={kpiCounts.flagged}
          icon={AlertTriangle}
          tone="red"
          active={kpiFilter === "flagged"}
          onClick={() => handleKpiClick("flagged")}
        />
        <KpiCard
          label="종결"
          value={kpiCounts.closed}
          icon={CheckCircle2}
          tone="green"
          active={kpiFilter === "closed"}
          onClick={() => handleKpiClick("closed")}
        />
      </div>
      <p className="mb-3 text-xs text-slate-500">
        가장 먼저 볼 숫자는 <strong className="font-semibold text-slate-700">확인 전</strong>
        입니다. 고객 확인이 안 돼 접수건인지 판단되지 않은 건이 쌓이지 않게 관리합니다.{" "}
        <strong className="font-semibold text-slate-700">접수대상</strong>은 가맹접수로 전환되지
        않고 남으면 누락이므로 따로 표시됩니다.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="상호명, 대표자, 연락처, 담당자..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={assigneeFilter}
          onValueChange={setAssigneeFilter}
          aria-label="담당자 필터"
          options={[
            { value: "all", label: "전체" },
            { value: "mine", label: "내 담당" },
            ...csProfiles.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />
        <button
          onClick={() => setFlaggedOnly((v) => !v)}
          className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
            flaggedOnly
              ? "bg-red-600 border-red-600 text-white"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          확인 필요만
        </button>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-slate-500">전체 {sortedRows.length.toLocaleString()}건</div>
          <button
            onClick={() => setShowForm(true)}
            disabled={schemaMissing}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={14} />
            자체리드 등록
          </button>
        </div>
      </div>

      {schemaMissing ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          자체리드 표가 아직 없습니다. supabase/149_own_leads.sql을 실행하면 이 화면이 열립니다.
        </div>
      ) : (
        <>
          {selected.size > 0 && (
            <BulkDeleteActions
              count={selected.size}
              deleting={deleting}
              onDelete={handleDelete}
              onCancel={() => setSelected(new Set())}
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
                    상호명
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    등록일
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    유입경로
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    담당자
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    연락상태
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    서류상태
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    접수판단
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    다음 조치일
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    경과일
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    확인 필요
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 min-w-[160px]">
                    비고
                  </th>
                  <th className="text-left px-3 py-3 font-semibold text-slate-700 border-b border-slate-200 whitespace-nowrap">
                    조치
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => {
                  const closed = isLeadClosed(row);
                  const flags = leadFlags(row, today);
                  const rowBg = closed
                    ? "opacity-60 bg-slate-50"
                    : flags.length > 0
                      ? "bg-red-50 hover:bg-red-100"
                      : row.decision === "접수대상" && !row.converted_franchise_id
                        ? "bg-blue-50 hover:bg-blue-100"
                        : "hover:bg-slate-50";
                  const highlighted = initialHighlightId === row.id;
                  const sourceOptions = LEAD_SOURCES.includes(
                    row.source as (typeof LEAD_SOURCES)[number],
                  )
                    ? [...LEAD_SOURCES]
                    : [...LEAD_SOURCES, row.source];
                  return (
                    <tr
                      key={row.id}
                      ref={highlighted ? highlightRef : undefined}
                      className={`border-b border-slate-100 transition-colors ${rowBg} ${
                        highlighted ? "ring-2 ring-blue-400" : ""
                      }`}
                      title={
                        closed && row.close_reason ? `종결 사유: ${row.close_reason}` : undefined
                      }
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
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{row.business_name}</div>
                        <div className="text-xs text-slate-400">
                          {row.owner_name || "-"} · {row.phone || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                        {formatMD(row.created_at)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap min-w-[110px]">
                        <SelectField
                          row={row}
                          field="source"
                          options={sourceOptions}
                          onSave={saveField}
                          disabled={closed}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap min-w-[110px]">
                        <AssigneeField
                          row={row}
                          onSave={saveField}
                          csProfiles={csProfiles}
                          disabled={closed}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <SelectField
                          row={row}
                          field="contact_status"
                          options={[...CONTACT_STATUSES]}
                          onSave={saveField}
                          pill
                          pillStyle={CONTACT_STATUS_STYLE as Record<string, string>}
                          disabled={closed}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <SelectField
                          row={row}
                          field="doc_status"
                          options={[...DOC_STATUSES]}
                          onSave={saveField}
                          pill
                          pillStyle={DOC_STATUS_STYLE as Record<string, string>}
                          disabled={closed}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <SelectField
                          row={row}
                          field="decision"
                          options={[...DECISIONS]}
                          onSave={saveField}
                          pill
                          pillStyle={DECISION_STYLE as Record<string, string>}
                          title={DECISION_GUIDE[row.decision]}
                          disabled={closed}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <DateField
                          row={row}
                          field="next_action_date"
                          onSave={saveField}
                          disabled={closed}
                        />
                      </td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                        D+{leadAgeDays(row, today)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {flags.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700 whitespace-nowrap"
                            >
                              {LEAD_FLAG_LABELS[f]}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 min-w-[160px]">
                        <EditableText
                          key={row.note ?? ""}
                          row={row}
                          field="note"
                          onSave={saveField}
                          disabled={closed}
                        />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {closed ? (
                          row.converted_franchise_id ? (
                            <Link
                              href={`/franchise?highlight=${row.converted_franchise_id}`}
                              className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              가맹접수 보기
                            </Link>
                          ) : (
                            <div className="flex items-center">
                              {row.close_reason && (
                                <span
                                  className="text-[11px] text-slate-400 mr-1.5 truncate max-w-32"
                                  title={row.close_reason}
                                >
                                  {row.close_reason}
                                </span>
                              )}
                              <button
                                onClick={() => handleReopen(row)}
                                className="text-xs font-semibold text-slate-600 hover:text-slate-800 hover:underline"
                              >
                                다시 열기
                              </button>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {row.decision === "접수대상" && (
                              <button
                                onClick={() => router.push(`/franchise?lead=${row.id}`)}
                                className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md transition-colors"
                              >
                                가맹접수 전환
                              </button>
                            )}
                            <button
                              onClick={() => handleClose(row)}
                              className="text-xs font-medium text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors"
                            >
                              종결
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sortedRows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="text-center text-slate-400 py-10">
                      데이터가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showForm && (
        <LeadForm
          csProfiles={csProfiles}
          defaultAssigneeId={defaultAssigneeId}
          onSubmit={handleCreate}
          submitting={submitting}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
