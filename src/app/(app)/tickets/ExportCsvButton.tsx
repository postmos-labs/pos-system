"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { downloadCsv, todayStamp } from "@/lib/csv";
import { fetchExportTargets } from "./exportActions";

// 인입내역 상단에서 문제상황/해결절차 CSV를 바로 받는다.
// 챗봇 데이터는 인입내역에서만 관리한다(별도 화면 폐기). 미달 건도 내려주되 품질 열로 표시한다.
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
    // 전부 내려주고 세 번째 열에 판정을 적는다. 통과 건만 주면 왜 빠졌는지 파일에서 알 수 없다.
    // 통과가 위, 미달이 아래로 오게 해 챗봇에 넣을 때 위쪽만 잘라 쓰면 된다.
    const labelsById = new Map(
      result.quality.map((q) => [q.id, q.issues.map((issue) => issue.label).join(" · ")]),
    );
    const rows = result.rows
      .map((row) => ({ row, verdict: labelsById.get(row.id) || "통과" }))
      .sort((a, b) => (a.verdict === "통과" ? 0 : 1) - (b.verdict === "통과" ? 0 : 1));
    if (rows.length === 0) {
      toast.error("받을 수 있는 해결 절차가 없습니다.");
      return;
    }
    const passedCount = rows.filter((entry) => entry.verdict === "통과").length;
    downloadCsv(
      `인입내역_문제상황_해결절차_${todayStamp()}.csv`,
      ["문제상황", "해결절차", "품질"],
      rows.map(({ row, verdict }) => [row.inquiry, row.steps, verdict]),
    );
    toast.success(
      `${rows.length}건을 받았습니다. 통과 ${passedCount}건, 미달 ${rows.length - passedCount}건.`,
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
