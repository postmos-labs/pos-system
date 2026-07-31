"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, Copy, ExternalLink, Trash2, FileText, PenLine, Search } from "lucide-react";
import type { Profile } from "@/types";
import { useToast } from "@/components/ui/Toast";
import FormModal from "@/components/ui/FormModal";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<string, string> = {
  pending: "서명 대기",
  signed: "서명 완료",
  expired: "만료",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
  signed: "bg-green-50 text-green-700 border-green-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
};

interface Contract {
  id: string;
  title: string;
  pdf_url: string;
  signed_pdf_url?: string;
  status: string;
  signer_name: string;
  signer_email?: string;
  signer_phone?: string;
  sign_token: string;
  token_expires_at: string;
  created_at: string;
  creator?: { name: string } | null;
  signature_zones?: unknown[] | null;
}

interface Props {
  profile: Profile;
  initialContracts: Contract[];
}

export default function ContractsClient({ profile, initialContracts }: Props) {
  const router = useRouter();
  const toast = useToast();
  const canEdit = profile.role === "cs" || profile.role === "admin" || profile.role === "master";
  const [contracts, setContracts] = useState<Contract[]>(initialContracts);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "",
    signerName: "",
    signerEmail: "",
    signerPhone: "",
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const supabase = createClient();

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (term && !c.signer_name?.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [contracts, search, statusFilter]);

  const filterKey = `${search}|${statusFilter}`;
  const [pageResetKey, setPageResetKey] = useState(filterKey);
  if (filterKey !== pageResetKey) {
    setPageResetKey(filterKey);
    setPage(1);
  }
  const totalPages = Math.max(1, Math.ceil(filteredContracts.length / PAGE_SIZE));
  const pagedContracts = filteredContracts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pdfFile) {
      alert("PDF 파일을 선택해주세요.");
      return;
    }
    setSubmitting(true);
    setUploading(true);

    const fd = new FormData();
    fd.append("file", pdfFile);
    fd.append("title", form.title);
    fd.append("signerName", form.signerName);
    fd.append("signerEmail", form.signerEmail);
    fd.append("signerPhone", form.signerPhone);
    fd.append("createdBy", profile.id);

    const res = await fetch("/api/contracts/create", { method: "POST", body: fd });
    const json = await res.json();

    setUploading(false);
    setSubmitting(false);
    if (!res.ok || json.error) {
      alert(json.error ?? "등록 실패");
      return;
    }

    setForm({ title: "", signerName: "", signerEmail: "", signerPhone: "" });
    setPdfFile(null);
    setShowForm(false);

    router.push(`/contracts/${json.id}`);
  }

  async function handleDelete(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    const contract = contracts.find((c) => c.id === id);
    const { error } = await supabase.from("contracts").delete().eq("id", id);
    if (error) {
      toast.error("삭제 실패: " + error.message);
      return;
    }

    if (contract?.pdf_url) {
      const path = contract.pdf_url.split("/contracts/")[1];
      if (path) await supabase.storage.from("contracts").remove([path]);
      else console.warn("삭제할 storage 경로를 pdf_url에서 파싱하지 못했습니다:", contract.pdf_url);
    }
    if (contract?.signed_pdf_url) {
      const path = contract.signed_pdf_url.split("/contracts/")[1];
      if (path) await supabase.storage.from("contracts").remove([path]);
      else
        console.warn(
          "삭제할 storage 경로를 signed_pdf_url에서 파싱하지 못했습니다:",
          contract.signed_pdf_url,
        );
    }
    setContracts((prev) => prev.filter((c) => c.id !== id));
  }

  function copySignLink(contract: Contract) {
    if (!contract.signature_zones || contract.signature_zones.length === 0) {
      toast.error("서명 위치를 1개 이상 지정한 뒤 링크를 공유할 수 있습니다.");
      return;
    }
    const url = `${window.location.origin}/sign/${contract.sign_token}`;
    navigator.clipboard.writeText(url);
    toast.success("서명 링크가 복사됐습니다.");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">계약서 / 서명</h1>
          <p className="text-slate-500 text-sm mt-1">총 {filteredContracts.length}건</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 bg-blue-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-blue-700 font-semibold"
          >
            <Plus size={16} />새 계약서
          </button>
        )}
      </div>

      {}
      {canEdit && showForm && (
        <FormModal
          title="새 계약서 등록"
          onClose={() => setShowForm(false)}
          maxWidthClassName="max-w-3xl"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">계약서 제목 *</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className={INPUT}
                  placeholder="예: 포스기 설치 계약서"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">서명자 성함 *</label>
                <input
                  required
                  value={form.signerName}
                  onChange={(e) => setForm((f) => ({ ...f, signerName: e.target.value }))}
                  className={INPUT}
                  placeholder="홍길동"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">서명자 연락처</label>
                <input
                  value={form.signerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, signerPhone: e.target.value }))}
                  className={INPUT}
                  placeholder="01012345678"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">서명자 이메일</label>
                <input
                  type="email"
                  value={form.signerEmail}
                  onChange={(e) => setForm((f) => ({ ...f, signerEmail: e.target.value }))}
                  className={INPUT}
                  placeholder="example@email.com"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">PDF 파일 *</label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-600 file:text-xs file:font-medium"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-600"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {uploading ? "PDF 업로드 중..." : submitting ? "등록 중..." : "등록"}
              </button>
            </div>
          </form>
        </FormModal>
      )}

      {}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="서명자 성함으로 검색"
            className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filteredContracts.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">계약서가 없습니다</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pagedContracts.map((c) => (
              <div key={c.id} className="px-5 py-5 flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm break-words">{c.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>{c.signer_name}</span>
                    {c.signer_phone && <span>{c.signer_phone}</span>}
                    <span>{format(new Date(c.created_at), "M/d", { locale: ko })}</span>
                    <span>만료 {format(new Date(c.token_expires_at), "M/d", { locale: ko })}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${STATUS_COLORS[c.status]}`}
                  >
                    {STATUS_LABELS[c.status] ?? c.status}
                  </span>
                  {c.status === "pending" &&
                    (!c.signature_zones || c.signature_zones.length === 0) && (
                      <span className="text-xs px-2.5 py-1 rounded-full font-semibold border bg-orange-50 text-orange-600 border-orange-200">
                        위치 미지정
                      </span>
                    )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {canEdit && (
                    <a
                      href={`/contracts/${c.id}`}
                      className="flex items-center gap-1 text-xs text-purple-600 border border-purple-200 px-2.5 py-1.5 rounded-lg hover:bg-purple-50"
                    >
                      <PenLine size={12} />
                      위치 지정
                    </a>
                  )}
                  <button
                    onClick={() => copySignLink(c)}
                    disabled={!c.signature_zones || c.signature_zones.length === 0}
                    title={
                      !c.signature_zones || c.signature_zones.length === 0
                        ? "서명 위치를 먼저 지정해주세요"
                        : undefined
                    }
                    className="flex items-center gap-1 text-xs text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed"
                  >
                    <Copy size={12} />
                    서명 링크
                  </button>
                  <a
                    href={c.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-50"
                  >
                    <ExternalLink size={12} />
                    PDF
                  </a>
                  {c.signed_pdf_url && (
                    <a
                      href={c.signed_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-green-600 border border-green-200 px-2.5 py-1.5 rounded-lg hover:bg-green-50"
                    >
                      <ExternalLink size={12} />
                      서명본
                    </a>
                  )}
                  {(profile.role === "admin" || profile.role === "master") && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-xs text-red-400 border border-red-100 px-2.5 py-1.5 rounded-lg hover:bg-red-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            이전
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 disabled:opacity-40 hover:bg-slate-50"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

const INPUT =
  "w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white";
