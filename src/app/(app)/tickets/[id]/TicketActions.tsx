"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Ticket, Profile } from "@/types";
import { STATUS_LABEL } from "@/types";
import { CheckCircle } from "lucide-react";
import { NotificationHistory } from "@/components/ui/NotificationHistory";
import { useToast } from "@/components/ui/Toast";
import BulkConfirmDialog from "@/components/ui/BulkConfirmDialog";

interface Props {
  ticket: Ticket & { merchant: { business_name?: string } | null };
  profile: Profile;
}

export default function TicketActions({ ticket, profile }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  async function updateStatus(newStatus: string) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: statusError } = await supabase
      .from("tickets")
      .update({ status: newStatus })
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
      message: null,
    });
    if (logError) {
      toast.error("상태는 변경되었지만 이력 기록에 실패했습니다: " + logError.message);
    }

    // 완료 전환 시 등록한 영업 담당자에게 알림 (기존 워크플로의 done 알림과 동일)
    if (newStatus === "done" && ticket.sales_id) {
      await supabase.from("notifications").insert({
        user_id: ticket.sales_id,
        ticket_id: ticket.id,
        type: newStatus,
        title: `[${ticket.merchant?.business_name}] 상태 변경`,
        body: `${ticket.title} → ${STATUS_LABEL[newStatus as keyof typeof STATUS_LABEL] ?? newStatus}`,
      });
    }

    setLoading(false);
    router.refresh();
  }

  const { status } = ticket;
  const { role } = profile;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700">상태</h2>

      <div className="flex flex-wrap gap-2">
        {}
        {status === "done" && (
          <button
            onClick={() => updateStatus("in_progress")}
            disabled={loading}
            className="flex items-center gap-1.5 bg-purple-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors disabled:opacity-50 font-medium"
          >
            후속 필요로 전환
          </button>
        )}

        {}
        {status !== "done" && status !== "canceled" && (
          <button
            onClick={() => updateStatus("done")}
            disabled={loading}
            className="flex items-center gap-1.5 bg-green-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 font-medium"
          >
            <CheckCircle size={15} />
            완료로 전환
          </button>
        )}

        {}
        {status !== "canceled" && (role === "cs" || role === "admin" || role === "master") && (
          <button
            onClick={() => setCancelConfirmOpen(true)}
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

      <BulkConfirmDialog
        open={cancelConfirmOpen}
        title="인입내역 취소"
        busy={loading}
        confirmText="취소 처리"
        confirmColor="red"
        items={[{ id: ticket.id, label: ticket.title }]}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={async () => {
          setCancelConfirmOpen(false);
          await updateStatus("canceled");
        }}
      />
    </div>
  );
}
