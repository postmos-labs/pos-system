"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Plus, Trash2, Search, Phone } from "lucide-react";
import { formatPhone } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import FormModal from "@/components/ui/FormModal";
import { AppSelect } from "@/components/ui/AppSelect";

const SPECIALTIES = ["포스기", "키오스크", "네트워크", "카드단말기", "인터넷", "전기", "기타"];

interface ExternalTech {
  id: string;
  name: string;
  phone: string;
  specialty: string[];
  area: string;
  available: boolean;
  notes: string;
  created_at: string;
}

const EMPTY_FORM = {
  name: "",
  phone: "",
  specialty: [] as string[],
  area: "",
  available: true,
  notes: "",
};

export default function ExternalTechsClient({
  initialTechs,
  currentUserRole,
}: {
  initialTechs: ExternalTech[];
  currentUserRole: string;
}) {
  const canEdit = ["admin", "master", "cs"].includes(currentUserRole);
  const toast = useToast();
  const [techs, setTechs] = useState(initialTechs);
  const [search, setSearch] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [areaFilter, setAreaFilter] = useState("");

  const supabase = createClient();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    const fmtPhone = form.phone ? formatPhone(form.phone) : "";
    setSubmitting(true);
    const { data, error } = await supabase
      .from("external_techs")
      .insert({
        name: form.name,
        phone: fmtPhone || null,
        specialty: form.specialty,
        area: form.area || null,
        available: form.available,
        notes: form.notes || null,
      })
      .select("*")
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("등록 실패: " + error.message);
      return;
    }
    setTechs((prev) => [data, ...prev]);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  async function toggleAvailable(tech: ExternalTech) {
    if (tech.available) {
      const { count } = await supabase
        .from("installations")
        .select("*", { count: "exact", head: true })
        .eq("assigned_to", tech.id)
        .not("status", "in", '("completed","rejected")');
      if (
        (count ?? 0) > 0 &&
        !confirm(
          `${tech.name} 기사에게 배정된 진행 중인 설치건이 ${count}건 있습니다. 그래도 비활성화하시겠습니까?`,
        )
      )
        return;
    }
    const { error } = await supabase
      .from("external_techs")
      .update({ available: !tech.available })
      .eq("id", tech.id);
    if (error) {
      toast.error("변경 실패: " + error.message);
      return;
    }
    setTechs((prev) => prev.map((t) => (t.id === tech.id ? { ...t, available: !t.available } : t)));
  }

  async function saveNotes(id: string) {
    const { error } = await supabase
      .from("external_techs")
      .update({ notes: editNotes || null })
      .eq("id", id);
    if (error) {
      toast.error("저장 실패: " + error.message);
      return;
    }
    setTechs((prev) => prev.map((t) => (t.id === id ? { ...t, notes: editNotes } : t)));
    setEditingId(null);
  }

  async function deleteTech(id: string, name: string) {
    const { count, error: countError } = await supabase
      .from("installations")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", id);
    if (countError) {
      toast.error("배정 이력 확인 실패: " + countError.message);
      return;
    }
    const confirmMsg =
      (count ?? 0) > 0
        ? `"${name}" 기사에게 배정된 설치건이 (과거 이력 포함) ${count}건 있습니다. 삭제하면 해당 설치건의 담당기사 표시가 사라집니다. 그래도 삭제하시겠습니까?`
        : `"${name}" 기사를 삭제하시겠습니까?`;
    if (!confirm(confirmMsg)) return;
    const { error } = await supabase.from("external_techs").delete().eq("id", id);
    if (error) {
      toast.error("삭제 실패: " + error.message);
      return;
    }
    setTechs((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleSpecialty(s: string) {
    setForm((prev) => ({
      ...prev,
      specialty: prev.specialty.includes(s)
        ? prev.specialty.filter((x) => x !== s)
        : [...prev.specialty, s],
    }));
  }

  const areas = [...new Set(techs.map((t) => t.area).filter(Boolean))];

  const filtered = techs.filter((t) => {
    if (availableOnly && !t.available) return false;
    if (specialtyFilter && !t.specialty?.includes(specialtyFilter)) return false;
    if (areaFilter && t.area !== areaFilter) return false;
    const term = search.trim().toLowerCase();
    if (term && !`${t.name} ${t.phone} ${t.area}`.toLowerCase().includes(term)) return false;
    return true;
  });

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">외부 기사 관리</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            외부 협력 기사 연락처 및 전문 분야를 관리합니다
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} />
            기사 등록
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <FormModal
          title="기사 등록"
          onClose={() => setShowForm(false)}
          maxWidthClassName="max-w-3xl"
        >
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">이름 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">연락처</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })}
                placeholder="010-0000-0000"
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">담당 지역</label>
              <input
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                placeholder="예: 서울 강남"
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-500">전문 분야</label>
              <div className="flex flex-wrap gap-1.5">
                {SPECIALTIES.map((s) => (
                  <label
                    key={s}
                    className="flex items-center gap-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.specialty.includes(s)}
                      onChange={() => toggleSpecialty(s)}
                      className="accent-blue-600"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-slate-500">비고</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.available}
                  onChange={(e) => setForm({ ...form, available: e.target.checked })}
                  className="w-4 h-4 accent-blue-600"
                />
                활성 기사
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg"
              >
                {submitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        </FormModal>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이름, 연락처, 지역..."
            className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <AppSelect
          value={specialtyFilter}
          onValueChange={setSpecialtyFilter}
          aria-label="전문분야 필터"
          options={[
            { value: "", label: "전문분야 전체" },
            ...SPECIALTIES.map((s) => ({ value: s, label: s })),
          ]}
        />
        {areas.length > 0 && (
          <AppSelect
            value={areaFilter}
            onValueChange={setAreaFilter}
            aria-label="지역 필터"
            options={[
              { value: "", label: "지역 전체" },
              ...areas.map((a) => ({ value: a, label: a })),
            ]}
          />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={availableOnly}
            onChange={(e) => setAvailableOnly(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          활성 기사만
        </label>
        <span className="ml-auto text-sm text-slate-500">{filtered.length}명</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((tech) => (
          <div
            key={tech.id}
            className={`bg-white border rounded-xl p-4 ${tech.available ? "border-slate-200" : "border-slate-100 opacity-60"}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{tech.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${tech.available ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"}`}
                  >
                    {tech.available ? "활성" : "비활성"}
                  </span>
                </div>
                {tech.area && <p className="text-xs text-slate-400 mt-0.5">{tech.area}</p>}
              </div>
              <div className="flex items-center gap-1">
                {canEdit && (
                  <button
                    onClick={() => toggleAvailable(tech)}
                    className="text-xs text-slate-400 hover:text-blue-600 border border-slate-200 hover:border-blue-300 px-2 py-1 rounded-lg transition-colors"
                  >
                    {tech.available ? "비활성화" : "활성화"}
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => deleteTech(tech.id, tech.name)}
                    className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            {tech.phone && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(tech.phone);
                  toast.success(`복사됨: ${tech.phone}`);
                }}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline mb-2"
              >
                <Phone size={13} />
                {tech.phone}
              </button>
            )}
            {tech.specialty?.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {tech.specialty.map((s) => (
                  <span
                    key={s}
                    className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full"
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
            {editingId === tech.id ? (
              <div className="flex gap-2 mt-2">
                <input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={() => saveNotes(tech.id)}
                  className="text-xs text-blue-600 font-medium"
                >
                  저장
                </button>
                <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">
                  취소
                </button>
              </div>
            ) : (
              <p
                className="text-xs text-slate-500 cursor-pointer hover:text-slate-700"
                onClick={() => {
                  if (canEdit) {
                    setEditingId(tech.id);
                    setEditNotes(tech.notes ?? "");
                  }
                }}
              >
                {tech.notes || (canEdit ? "+ 비고 입력" : "-")}
              </p>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-2 text-center text-slate-400 py-12">
            등록된 외부 기사가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
