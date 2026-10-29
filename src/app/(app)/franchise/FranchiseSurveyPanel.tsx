"use client";

import { useEffect, useState } from "react";
import {
  SURVEY_ITEMS,
  SURVEY_STAGE_LABEL,
  isSurveyExpired,
  surveyStageOf,
  type FranchiseSurvey,
  type SurveyStage,
} from "@/lib/survey";
import {
  getFranchiseSurvey,
  markSurveyContacted,
  sendFranchiseSurveyAction,
} from "./surveyActions";

const STAGE_BADGE: Record<SurveyStage, string> = {
  submitted: "bg-blue-100 text-blue-700",
  contacted: "bg-emerald-100 text-emerald-700",
  opened: "bg-amber-100 text-amber-700",
  sent: "bg-slate-200 text-slate-600",
  not_sent: "border border-slate-300 bg-white text-slate-500",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function FranchiseSurveyPanel({
  franchiseId,
  hasPhone,
}: {
  franchiseId: string;
  hasPhone: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<FranchiseSurvey | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFranchiseSurvey(franchiseId).then((result) => {
      if (cancelled) return;
      setSurvey(result.survey);
      setUnavailable(result.unavailable);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [franchiseId]);

  if (loading) return <div className="text-xs text-slate-400">리서치 설문 불러오는 중...</div>;

  if (unavailable) {
    return (
      <div className="text-xs text-slate-400">
        리서치 기능 준비 중 (DB 157 마이그레이션 실행 필요)
      </div>
    );
  }

  const stage = surveyStageOf(survey);
  const sent = !!survey?.sent_at;
  const submitted = !!survey?.submitted_at;

  async function handleSend() {
    if (
      !window.confirm(
        "상담 중 고객이 오픈 준비 상품 안내를 직접 요청했나요?\n\n요청한 고객에게만 보낼 수 있습니다. 요청받았으면 확인을 눌러 보내세요.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    const result = await sendFranchiseSurveyAction(franchiseId);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.survey) setSurvey(result.survey);
  }

  async function handleContacted(contacted: boolean) {
    if (!survey) return;
    setBusy(true);
    setError(null);
    const result = await markSurveyContacted(survey.id, contacted);
    if (result.error) {
      setError(result.error);
    } else {
      const reloaded = await getFranchiseSurvey(franchiseId);
      setSurvey(reloaded.survey);
      setUnavailable(reloaded.unavailable);
    }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="text-foreground text-[13px] font-bold">리서치 설문</div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STAGE_BADGE[stage]}`}>
          {SURVEY_STAGE_LABEL[stage]}
        </span>
      </div>

      {survey && survey.sent_at && (
        <div className="space-y-1 text-xs text-slate-600">
          <div>
            {survey.sent_by_name ?? "-"} · {formatDateTime(survey.sent_at)} 발송 (
            {survey.send_count}
            회)
          </div>
          {survey.expires_at && (
            <div>
              {isSurveyExpired(survey) ? (
                <span className="font-semibold text-red-600">기한 지남</span>
              ) : (
                <>기한 {formatDate(survey.expires_at)}</>
              )}
            </div>
          )}
          {survey.submitted_at && (
            <div className="space-y-1.5 pt-1">
              <div className="flex flex-wrap gap-1.5">
                {(survey.picks ?? []).map((key) => (
                  <span
                    key={key}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700"
                  >
                    [{SURVEY_ITEMS[key]?.tag ?? ""}] {SURVEY_ITEMS[key]?.title ?? key}
                  </span>
                ))}
              </div>
              <div>응답 {formatDateTime(survey.submitted_at)}</div>
            </div>
          )}
          {survey.contacted_at && <div>{survey.contacted_by_name ?? "-"} 연락완료</div>}
        </div>
      )}

      {error && <div className="mt-2 text-xs font-semibold text-red-600">{error}</div>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!submitted && (
          <button
            type="button"
            onClick={handleSend}
            disabled={busy || !hasPhone}
            className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? "발송 중..." : sent ? "재발송" : "리서치 발송"}
          </button>
        )}
        {!submitted && !hasPhone && <span className="text-xs text-slate-400">연락처 없음</span>}
        {submitted && survey && (
          <button
            type="button"
            onClick={() => handleContacted(!survey.contacted_at)}
            disabled={busy}
            className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {survey.contacted_at ? "연락완료 취소" : "연락완료 처리"}
          </button>
        )}
      </div>
    </div>
  );
}
