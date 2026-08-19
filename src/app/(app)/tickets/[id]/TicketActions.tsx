"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Ticket, Profile } from "@/types";
import { STATUS_LABEL } from "@/types";
import { ArrowRight, UserCheck, Calendar, CheckCircle } from "lucide-react";
import { NotificationHistory } from "@/components/ui/NotificationHistory";
import { useToast } from "@/components/ui/Toast";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";
import { AppSelect } from "@/components/ui/AppSelect";

interface Props {
  ticket: Ticket & { merchant: any; sales: any; cs: any; tech: any };
  profile: Profile;
  techUsers: { id: string; name: string; phone?: string }[];
  csUsers: { id: string; name: string }[];
}

export default function TicketActions({ ticket, profile, techUsers, csUsers }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completePhotos, setCompletePhotos] = useState<File[]>([]);
  const [completeNote, setCompleteNote] = useState("");
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [csPick, setCsPick] = useState("");
  const [techPick, setTechPick] = useState("");

  async function notifyTargets(newStatus: string, logMessage: string) {
    const supabase = createClient();
    const targets: string[] = [];
    if (newStatus === "cs_pending" && ticket.cs_id) targets.push(ticket.cs_id);
    if (newStatus === "tech_pending" && ticket.tech_id) targets.push(ticket.tech_id);
    if (newStatus === "done" && ticket.sales_id) targets.push(ticket.sales_id);
    if (newStatus === "sales" && ticket.status === "cs_pending" && ticket.sales_id)
      targets.push(ticket.sales_id);
    if (
      newStatus === "cs_pending" &&
      (ticket.status === "tech_pending" || ticket.status === "scheduled") &&
      ticket.cs_id
    )
      targets.push(ticket.cs_id);

    for (const uid of targets) {
      const isRejected =
        (newStatus === "sales" && ticket.status === "cs_pending") ||
        (newStatus === "cs_pending" &&
          (ticket.status === "tech_pending" || ticket.status === "scheduled"));
      await supabase.from("notifications").insert({
        user_id: uid,
        ticket_id: ticket.id,
        type: newStatus,
        title: isRejected
          ? `[${ticket.merchant?.business_name}] 반려`
          : `[${ticket.merchant?.business_name}] 상태 변경`,
        body: isRejected
          ? `${ticket.title} - 반려됨${logMessage ? ": " + logMessage : ""}`
          : `${ticket.title} → ${STATUS_LABEL[newStatus as keyof typeof STATUS_LABEL] ?? newStatus}`,
      });
    }
  }

  async function updateStatus(newStatus: string, extra?: Record<string, unknown>) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: statusError } = await supabase
      .from("tickets")
      .update({ status: newStatus, ...extra })
      .eq("id", ticket.id);
    if (statusError) {
      toast.error("상태 변경 실패: " + statusError.message);
      setLoading(false);
      return;
    }

    const { error: logError } = await supabase.from("ticket_logs").insert({
      ticket_id: ticket.id,
      user_id: user?.id,
      from_status: ticket.status,
      to_status: newStatus,
      message: message || null,
    });
    if (logError) {
      toast.error("상태는 변경되었지만 이력 기록에 실패했습니다: " + logError.message);
    }

    await notifyTargets(newStatus, message);

    setMessage("");
    setLoading(false);
    router.refresh();
  }

  async function submitCompletion() {
    if (completePhotos.length === 0) {
      alert("설치완료사진을 최소 1장 첨부해주세요.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const photoUrls: string[] = [];
    for (const [i, file] of completePhotos.entries()) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${ticket.id}/${Date.now()}-${i}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("ticket-photos")
        .upload(path, file);
      if (uploadError) {
        alert("사진 업로드 실패: " + uploadError.message);
        setLoading(false);
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from("ticket-photos").getPublicUrl(path);
      photoUrls.push(publicUrl);
    }

    const { error: statusError } = await supabase
      .from("tickets")
      .update({ status: "done" })
      .eq("id", ticket.id);
    if (statusError) {
      toast.error("완료 처리 실패: " + statusError.message);
      setLoading(false);
      return;
    }

    const { error: logError } = await supabase.from("ticket_logs").insert({
      ticket_id: ticket.id,
      user_id: user?.id,
      from_status: ticket.status,
      to_status: "done",
      message: completeNote || null,
      photo_urls: photoUrls,
    });
    if (logError) {
      toast.error("완료 처리는 되었지만 이력 기록에 실패했습니다: " + logError.message);
    }

    await notifyTargets("done", completeNote);

    setCompleteOpen(false);
    setCompletePhotos([]);
    setCompleteNote("");
    setLoading(false);
    router.refresh();
  }

  async function assignUser(field: "cs_id" | "tech_id", userId: string) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("tickets")
      .update({ [field]: userId })
      .eq("id", ticket.id);
    if (updateError) {
      toast.error("배정 실패: " + updateError.message);
      setLoading(false);
      return;
    }
    const { error: logError } = await supabase.from("ticket_logs").insert({
      ticket_id: ticket.id,
      user_id: user?.id,
      message: `${field === "cs_id" ? "CS" : "기사"} 배정`,
    });
    if (logError) {
      toast.error("배정은 되었지만 이력 기록에 실패했습니다: " + logError.message);
    }
    setLoading(false);
    router.refresh();
  }

  async function setSchedule(datetime: string) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: updateError } = await supabase
      .from("tickets")
      .update({ scheduled_at: datetime, status: "scheduled" })
      .eq("id", ticket.id);
    if (updateError) {
      toast.error("일정 확정 실패: " + updateError.message);
      setLoading(false);
      return;
    }
    const { error: logError } = await supabase.from("ticket_logs").insert({
      ticket_id: ticket.id,
      user_id: user?.id,
      from_status: ticket.status,
      to_status: "scheduled",
      message: `일정 확정: ${datetime}`,
    });
    if (logError) {
      toast.error("일정은 확정되었지만 이력 기록에 실패했습니다: " + logError.message);
    }
    setLoading(false);
    router.refresh();
  }

  function requestCancel() {
    setCancelConfirmOpen(true);
  }

  async function confirmCancel() {
    setCancelConfirmOpen(false);
    await updateStatus("canceled");
  }

  const { status, role } = { status: ticket.status, role: profile.role };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">작업 액션</h2>

      {}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="이관 메모 (선택사항)"
        rows={2}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <div className="flex flex-wrap gap-2">
        {}
        {status === "sales" && (role === "sales" || role === "admin" || role === "master") && (
          <>
            <AppSelect
              value={csPick}
              onValueChange={(value) => {
                setCsPick(value);
                if (value) assignUser("cs_id", value);
              }}
              aria-label="CS 담당자 선택"
              options={[
                { value: "", label: "CS 담당자 선택" },
                ...csUsers.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <button
              onClick={() => updateStatus("cs_pending")}
              disabled={loading || !ticket.cs_id}
              className="flex items-center gap-1.5 bg-yellow-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 font-medium"
            >
              <ArrowRight size={15} />
              CS팀으로 이관
            </button>
          </>
        )}

        {}
        {status === "cs_pending" && (role === "cs" || role === "admin" || role === "master") && (
          <button
            onClick={() => updateStatus("sales")}
            disabled={loading}
            className="flex items-center gap-1.5 bg-red-100 text-red-600 border border-red-200 text-sm px-4 py-2 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50 font-medium"
          >
            ↩ 이관 거부 (반려)
          </button>
        )}

        {}
        {(status === "cs_pending" || status === "cs_progress") &&
          (role === "cs" || role === "admin" || role === "master") && (
            <>
              <AppSelect
                value={techPick}
                onValueChange={(value) => {
                  setTechPick(value);
                  if (value) assignUser("tech_id", value);
                }}
                aria-label="기사 선택"
                options={[
                  { value: "", label: "기사 선택" },
                  ...techUsers.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
              <button
                onClick={() => updateStatus("tech_pending")}
                disabled={loading || !ticket.tech_id}
                className="flex items-center gap-1.5 bg-orange-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 font-medium"
              >
                <UserCheck size={15} />
                기사 배정 완료
              </button>
            </>
          )}

        {}
        {(status === "cs_pending" || status === "cs_progress" || status === "tech_pending") &&
          (role === "cs" || role === "admin" || role === "master") && (
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                onChange={(e) => e.target.value && setSchedule(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Calendar size={13} /> 일정
              </span>
            </div>
          )}

        {}
        {(status === "tech_pending" || status === "scheduled") &&
          (role === "tech" || role === "admin" || role === "master") && (
            <button
              onClick={() => updateStatus("cs_pending")}
              disabled={loading}
              className="flex items-center gap-1.5 bg-red-100 text-red-600 border border-red-200 text-sm px-4 py-2 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50 font-medium"
            >
              ↩ 반려 (CS로 반환)
            </button>
          )}

        {}
        {(status === "scheduled" || status === "tech_pending") &&
          (role === "tech" || role === "admin" || role === "master") && (
            <button
              onClick={() => updateStatus("in_progress")}
              disabled={loading}
              className="flex items-center gap-1.5 bg-purple-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 font-medium"
            >
              <ArrowRight size={15} />
              작업 시작
            </button>
          )}

        {}
        {status === "in_progress" && (role === "tech" || role === "admin" || role === "master") && (
          <button
            onClick={() => setCompleteOpen(true)}
            disabled={loading}
            className="flex items-center gap-1.5 bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
          >
            <CheckCircle size={15} />
            완료 처리
          </button>
        )}

        {}
        {status !== "done" &&
          status !== "canceled" &&
          (role === "cs" || role === "admin" || role === "master") && (
            <button
              onClick={requestCancel}
              disabled={loading}
              className="text-sm text-red-600 border border-red-200 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors font-medium"
            >
              취소
            </button>
          )}
      </div>

      <div className="pt-2 border-t border-gray-100">
        <NotificationHistory
          entityType="ticket"
          entityId={ticket.id}
          labelMap={STATUS_LABEL as Record<string, string>}
        />
      </div>

      {completeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 w-80 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-gray-800">설치 완료 처리</h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">설치완료사진 (필수, 여러 장 가능)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setCompletePhotos(Array.from(e.target.files ?? []))}
                className="w-full text-sm text-slate-600 rounded-lg border border-blue-200 bg-blue-50 file:mr-3 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium file:cursor-pointer"
              />
              {completePhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {completePhotos.map((file, i) => (
                    <div key={i} className="relative">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-14 h-14 object-cover rounded-lg border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setCompletePhotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none flex items-center justify-center"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">비고 (선택)</label>
              <textarea
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
                placeholder="현장 비고를 남겨주세요"
                rows={3}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={submitCompletion}
                disabled={loading || completePhotos.length === 0}
                className="w-full py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "처리 중..." : "완료 처리"}
              </button>
              <button
                onClick={() => {
                  setCompleteOpen(false);
                  setCompletePhotos([]);
                  setCompleteNote("");
                }}
                disabled={loading}
                className="w-full py-2 rounded-lg text-slate-400 text-sm hover:text-slate-600"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <BulkConfirmDialog
        open={cancelConfirmOpen}
        title="작업 취소"
        busy={loading}
        confirmText="취소 처리"
        confirmColor="red"
        items={[{ id: ticket.id, label: ticket.title }]}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
