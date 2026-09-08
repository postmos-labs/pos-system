"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { downloadCsv, todayStamp } from "@/lib/csv";
import { fetchExportTargets } from "@/app/(app)/chatbot-data/actions";

// 인입내역 상단에서 문제상황/해결절차 CSV를 바로 받는다.
// 같은 데이터가 챗봇 데이터 화면의 내보내기 모달에도 있지만, 사용자는 인입내역 관련 기능을
// 인입내역 탭에서 찾는다. 품질 미달 건은 뺀다 — 챗봇에 넣을 사본이라 미달이 섞이면 안 된다.
export default function ExportCsvButton() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    const result = await fetchExportTargets(true);
    setLoading(false);
    if (result.error) {
      toast.error(`불러오기 실패: ${result.error}`);
      return;
    }
    const flagged = new Set(result.quality.filter((q) => q.issues.length > 0).map((q) => q.id));
    const passed = result.rows.filter((row) => !flagged.has(row.id));
    if (passed.length === 0) {
      toast.error("받을 수 있는 해결 절차가 없습니다.");
      return;
    }
    downloadCsv(
      `인입내역_문제상황_해결절차_${todayStamp()}.csv`,
      ["문제상황", "해결절차"],
      passed.map((row) => [row.inquiry, row.steps]),
    );
    toast.success(
      flagged.size > 0
        ? `${passed.length}건을 받았습니다. 품질 미달 ${flagged.size}건은 뺐습니다.`
        : `${passed.length}건을 받았습니다.`,
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className="flex items-center gap-1.5 text-sm text-slate-500 px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-colors font-medium disabled:opacity-50"
    >
      <Download size={14} />
      {loading ? "준비 중..." : "CSV 다운로드"}
    </button>
  );
}
