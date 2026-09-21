"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parseApprovalNotes, type ApprovalNote } from "@/lib/approvalNotes";

/** 이관 승인 비고를 히스토리 창에 끼워 넣기 위해 읽어 온다. 표가 한 건당 한 행이라 maybeSingle로 받는다. */
export function useApprovalNoteHistory(franchiseApplicationId?: string): ApprovalNote[] {
  const [notes, setNotes] = useState<ApprovalNote[]>([]);

  useEffect(() => {
    if (!franchiseApplicationId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("franchise_transfer_approvals")
      .select("approval_notes")
      .eq("franchise_application_id", franchiseApplicationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setNotes(parseApprovalNotes(data?.approval_notes));
      });
    return () => {
      cancelled = true;
    };
  }, [franchiseApplicationId]);

  return notes;
}
