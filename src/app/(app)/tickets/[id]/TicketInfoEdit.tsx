"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Ticket } from "@/types";
import { AppSelect } from "@/components/ui/AppSelect";
import {
  MEMO_ISSUE_CATEGORIES,
  MEMO_ISSUE_CATEGORY_LABEL,
  MEMO_RESOLUTIONS,
  MEMO_RESOLUTION_LABEL,
} from "@/app/(app)/merchants/merchant360";
import { autoResolveTicketRevision, type AutoResolveResult } from "../actions";

// 옛 작업 관리 시절 값("전화" 등)도 남아 있어 목록에 함께 둔다.
const RECEPTION_CHANNELS = ["채널톡", "유선", "전화", "카카오톡", "문자", "방문", "온라인", "기타"];

interface Props {
  ticket: Ticket;
  canEdit: boolean;
  /** 서버가 미리 돌린 지금 판정. 저장 전에도 통과·미달을 보여주기 위한 값 */
  initialQuality?: {
    passed: boolean;
    labels: string[];
    reason?: string | null;
    suggestion?: string | null;
    kind?: "owner" | "staff" | null;
    source?: "ai" | "rule" | null;
  } | null;
}

// 렌더 중 컴포넌트 생성(react-hooks/static-components) 방지를 위해 모듈 레벨에 두고 상태를 props로 받는다.
function StatusDot({
  field,
  saving,
  saved,
  saveError,
}: {
  field: string;
  saving: string | null;
  saved: string | null;
  saveError: string | null;
}) {
  if (saving === field) return <span className="text-[10px] text-slate-400 ml-1">저장중...</span>;
  if (saveError === field)
    return <span className="text-[10px] text-red-500 ml-1">✗ 저장 실패</span>;
  if (saved === field) return <span className="text-[10px] text-blue-500 ml-1">✓ 저장됨</span>;
  return null;
}

export default function TicketInfoEdit({ ticket, canEdit, initialQuality }: Props) {
  const router = useRouter();
  const [qualityNote, setQualityNote] = useState<AutoResolveResult | null>(null);
  // 모델 판정은 몇 초 걸린다. 저장이 끝난 것과 판정을 기다리는 것을 갈라 보여준다.
  const [judging, setJudging] = useState(false);
  // 서버 액션 호출 자체가 실패한 경우(배포 직후 옛 화면 등). 새로고침하면 풀린다.
  const [judgeFailed, setJudgeFailed] = useState(false);
  // 저장하면 그 결과가 우선한다. 저장 전에는 서버가 내려준 판정을 보여준다.
  const shownQuality: {
    passed: boolean;
    labels: string[];
    resolved: boolean;
    hadOpenRequest: boolean;
    reason?: string | null;
    suggestion?: string | null;
    kind?: "owner" | "staff" | null;
    source?: "ai" | "rule" | null;
  } | null =
    qualityNote ??
    (initialQuality ? { ...initialQuality, resolved: false, hadOpenRequest: false } : null);
  const kindPrefix = shownQuality?.kind === "staff" ? "고객센터 처리 건 · " : "";
  // 통과 건도 모델이 봤는지 규칙으로 떨어졌는지 보이게 한다. 키가 없거나 호출이 실패하면 규칙이다.
  const sourceSuffix =
    shownQuality?.source === "ai"
      ? " · 모델 판정"
      : shownQuality?.source === "rule"
        ? " · 규칙 판정"
        : "";
  const [form, setForm] = useState({
    title: ticket.title ?? "",
    reception_channel: ticket.reception_channel ?? "",
    issue_category: ticket.issue_category ?? "",
    resolution: ticket.resolution ?? "",
    is_repeat: ticket.is_repeat == null ? "" : ticket.is_repeat ? "repeat" : "first",
    progress_note: ticket.progress_note ?? "",
    resolution_steps: ticket.resolution_steps ?? "",
    memo: ticket.memo ?? "",
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (key: string, value: string | boolean) => {
      // 문의 내용은 NOT NULL이라 비워서 저장할 수 없다. 빈 값이면 저장하지 않고 오류 표시만 한다.
      if (key === "title" && typeof value === "string" && !value.trim()) {
        setSaveError(key);
        setTimeout(() => setSaveError(null), 3000);
        return;
      }
      setSaving(key);
      setSaved(null);
      setSaveError(null);
      const supabase = createClient();
      const { error } = await supabase
        .from("tickets")
        .update({ [key]: value === "" ? null : value })
        .eq("id", ticket.id);
      setSaving(null);
      if (error) {
        setSaveError(key);
        setTimeout(() => setSaveError(null), 3000);
        return;
      }
      setSaved(key);
      setTimeout(() => setSaved(null), 1500);
      // 문의 내용과 해결 절차는 챗봇 품질 규칙의 대상이다. 저장 직후 서버가 다시 판정해
      // 통과하면 대기 중 수정 요청을 자동으로 닫는다. 결과는 해결 절차 칸 아래에 보여준다.
      if (key === "title" || key === "resolution_steps") {
        setJudging(true);
        setJudgeFailed(false);
        try {
          const result = await autoResolveTicketRevision(ticket.id);
          if (!result.error) setQualityNote(result);
          if (key === "title" || result.resolved) router.refresh();
        } catch {
          // 배포 직후 옛 화면에서 저장하면 서버 액션을 못 찾는다. 저장은 이미 끝났으니 판정만 실패로 알린다.
          setJudgeFailed(true);
        } finally {
          setJudging(false);
        }
      }
    },
    [ticket.id, router],
  );

  function handleChange(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleBlur(key: string) {
    save(key, form[key as keyof typeof form]);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">인입 정보</h2>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="col-span-2">
          <p className="text-xs text-gray-400 mb-1">
            문의 내용{" "}
            <StatusDot field="title" saving={saving} saved={saved} saveError={saveError} />
            <span className="ml-1 text-[10px] font-medium text-blue-600">챗봇 검색에 사용</span>
          </p>
          <input
            type="text"
            value={form.title}
            disabled={!canEdit}
            onChange={(e) => handleChange("title", e.target.value)}
            onBlur={() => handleBlur("title")}
            className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-1 text-sm text-slate-900 focus:outline-none focus:border-blue-400 transition-colors"
            placeholder="무엇이 어떻게 되는지 (예: 카드 결제가 안 됨). 가맹점 이름·전화번호는 쓰지 마세요"
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            접수 채널{" "}
            <StatusDot
              field="reception_channel"
              saving={saving}
              saved={saved}
              saveError={saveError}
            />
          </p>
          <AppSelect
            value={form.reception_channel}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("reception_channel", value);
              save("reception_channel", value);
            }}
            aria-label="접수 채널"
            options={[
              { value: "", label: "선택" },
              ...RECEPTION_CHANNELS.map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            문제 유형{" "}
            <StatusDot field="issue_category" saving={saving} saved={saved} saveError={saveError} />
          </p>
          <AppSelect
            value={form.issue_category}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("issue_category", value);
              save("issue_category", value);
            }}
            aria-label="문제 유형"
            options={[
              { value: "", label: "선택" },
              ...MEMO_ISSUE_CATEGORIES.map((c) => ({
                value: c,
                label: MEMO_ISSUE_CATEGORY_LABEL[c],
              })),
            ]}
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            해결 방식{" "}
            <StatusDot field="resolution" saving={saving} saved={saved} saveError={saveError} />
          </p>
          <AppSelect
            value={form.resolution}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("resolution", value);
              save("resolution", value);
            }}
            aria-label="해결 방식"
            options={[
              { value: "", label: "선택" },
              ...MEMO_RESOLUTIONS.map((r) => ({ value: r, label: MEMO_RESOLUTION_LABEL[r] })),
            ]}
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            반복 여부{" "}
            <StatusDot field="is_repeat" saving={saving} saved={saved} saveError={saveError} />
          </p>
          <AppSelect
            value={form.is_repeat}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("is_repeat", value);
              // 저장 컬럼은 BOOLEAN이라 select 값(first/repeat)을 변환한다. 빈 값은 null 저장.
              save("is_repeat", value === "" ? "" : value === "repeat");
            }}
            aria-label="반복 여부"
            options={[
              { value: "", label: "선택" },
              { value: "first", label: "처음" },
              { value: "repeat", label: "또 그럼" },
            ]}
          />
        </div>
      </div>

      {}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-1">
          {ticket.team === "tech" ? "처리 내용" : "답변내용"}{" "}
          <StatusDot field="progress_note" saving={saving} saved={saved} saveError={saveError} />
        </p>
        <textarea
          value={form.progress_note}
          disabled={!canEdit}
          rows={2}
          onChange={(e) => handleChange("progress_note", e.target.value)}
          onBlur={() => handleBlur("progress_note")}
          className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-1 text-sm text-slate-900 focus:outline-none focus:border-blue-400 transition-colors resize-none"
          placeholder={ticket.team === "tech" ? "이번 건에 무슨 일이 있었는지" : "답변내용"}
        />
      </div>

      {/* 해결 절차는 재사용 가능한 절차만 받는 칸이라 기술지원 건에서만 보인다. */}
      {ticket.team === "tech" && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1">
            해결 절차{" "}
            <StatusDot
              field="resolution_steps"
              saving={saving}
              saved={saved}
              saveError={saveError}
            />
            <span className="ml-1 text-[10px] font-medium text-blue-600">챗봇 학습에 사용</span>
          </p>
          <textarea
            value={form.resolution_steps}
            disabled={!canEdit}
            rows={4}
            onChange={(e) => handleChange("resolution_steps", e.target.value)}
            onBlur={() => handleBlur("resolution_steps")}
            className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-1 text-sm text-slate-900 focus:outline-none focus:border-blue-400 transition-colors resize-none"
            placeholder="같은 문제가 또 왔을 때 따라 할 순서 (가맹점 정보는 쓰지 마세요)"
          />
          {judging && form.resolution_steps.trim() && (
            <p className="mt-1 text-[11px] font-medium text-slate-400">품질 점검 중...</p>
          )}
          {!judging && judgeFailed && (
            <p className="mt-1 text-[11px] font-medium text-red-500">
              품질 점검 실패 · 화면을 새로고침한 뒤 다시 저장해 주세요
            </p>
          )}
          {!judging && shownQuality && form.resolution_steps.trim() && (
            <p
              className={`mt-1 text-[11px] font-medium ${
                shownQuality.passed ? "text-green-700" : "text-amber-700"
              }`}
            >
              {shownQuality.passed
                ? shownQuality.resolved
                  ? `${kindPrefix}품질 점검 통과 · 수정 요청이 완료 처리됐습니다${sourceSuffix}`
                  : `${kindPrefix}품질 점검 통과${sourceSuffix}`
                : `아직 미달: ${shownQuality.labels.join(" · ")}${
                    shownQuality.hadOpenRequest ? " · 수정 요청은 대기로 남습니다" : ""
                  }${sourceSuffix}`}
            </p>
          )}
          {!judging && shownQuality && !shownQuality.passed && form.resolution_steps.trim() && (
            <>
              {shownQuality.reason && (
                <p className="mt-0.5 text-[11px] text-slate-500">{shownQuality.reason}</p>
              )}
              {shownQuality.suggestion && (
                <p className="mt-0.5 text-[11px] font-medium text-blue-600">
                  이렇게 고쳐보세요: {shownQuality.suggestion}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-1">
          비고 <StatusDot field="memo" saving={saving} saved={saved} saveError={saveError} />
        </p>
        <textarea
          value={form.memo}
          disabled={!canEdit}
          rows={2}
          onChange={(e) => handleChange("memo", e.target.value)}
          onBlur={() => handleBlur("memo")}
          className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-1 text-sm text-slate-900 focus:outline-none focus:border-blue-400 transition-colors resize-none"
          placeholder="비고"
        />
      </div>
    </div>
  );
}
