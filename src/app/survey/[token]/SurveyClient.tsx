"use client";

import { useState } from "react";
import { SURVEY_ITEMS, SURVEY_ITEM_KEYS, type SurveyItemKey } from "@/lib/survey";

interface Props {
  token: string;
  businessName: string;
  ownerName: string;
  initialItem: SurveyItemKey | null;
  submittedPicks: SurveyItemKey[] | null;
  expired: boolean;
  expiresAt: string | null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-screen max-w-md bg-white px-5 py-8">{children}</div>;
}

function Done({ title, picks }: { title: string; picks: SurveyItemKey[] }) {
  return (
    <Shell>
      <p className="text-xs font-semibold text-slate-400">포스모스</p>
      <h1 className="mt-6 text-xl font-bold text-slate-900">{title}</h1>
      {picks.length > 0 && (
        <ul className="mt-5 space-y-2">
          {picks.map((k) => (
            <li
              key={k}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
            >
              {SURVEY_ITEMS[k].title}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 text-sm text-slate-600">담당자가 곧 연락드리겠습니다.</p>
    </Shell>
  );
}

export default function SurveyClient({
  token,
  businessName,
  ownerName,
  initialItem,
  submittedPicks,
  expired,
  expiresAt,
}: Props) {
  const [selected, setSelected] = useState<SurveyItemKey[]>(initialItem ? [initialItem] : []);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [doneState, setDoneState] = useState<"submitted" | "already" | null>(null);

  if (submittedPicks) return <Done title="이미 응답하셨습니다" picks={submittedPicks} />;
  if (doneState) {
    return (
      <Done
        title={doneState === "submitted" ? "응답이 접수되었습니다" : "이미 응답하셨습니다"}
        picks={doneState === "submitted" ? selected : []}
      />
    );
  }
  if (expired) {
    return (
      <Shell>
        <p className="text-xs font-semibold text-slate-400">포스모스</p>
        <h1 className="mt-6 text-xl font-bold text-slate-900">참여 기한이 지났습니다</h1>
      </Shell>
    );
  }

  function toggle(key: SurveyItemKey) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function submit() {
    if (!selected.length || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, picks: selected }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        setDoneState("submitted");
      } else if (res.status === 409) {
        setDoneState("already");
      } else {
        setError(json.error || "전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch {
      setError("전송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  const deadline = expiresAt ? expiresAt.slice(0, 10) : "";

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white px-5 pt-8 pb-64">
      <p className="text-xs font-semibold text-slate-400">포스모스</p>
      <h1 className="mt-3 text-xl font-bold text-slate-900">
        오픈 전, 고정비 줄일 방법 확인하세요
      </h1>
      <p className="mt-1 text-sm font-semibold text-blue-600">
        {businessName || ownerName} 사장님 전용
      </p>
      <p className="mt-3 text-sm text-slate-600">
        필요한 항목을 모두 골라 주세요. 담당자가 매장 기준으로 알아보고 먼저 연락드립니다.
      </p>

      <div className="mt-6 space-y-3">
        {SURVEY_ITEM_KEYS.map((key) => {
          const on = selected.includes(key);
          const item = SURVEY_ITEMS[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left transition ${
                on ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                  on
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-slate-300 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className="mb-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  [{item.tag}]
                </span>
                <span className="block text-base font-bold text-slate-900">{item.title}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white px-5 py-4">
        <div className="mx-auto max-w-md">
          {error && <p className="mb-2 text-sm font-semibold text-red-600">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={selected.length === 0 || submitting}
            className="w-full rounded-xl bg-blue-600 py-3.5 text-base font-bold text-white disabled:bg-slate-300"
          >
            {submitting ? "보내는 중..." : `선택한 항목 보내기 (${selected.length})`}
          </button>
          <p className="mt-3 text-xs text-slate-500">
            ▶ 참여 기한: {deadline}까지 (한 번만 응답 가능)
          </p>
          <p className="mt-1 text-xs text-slate-500">
            ※ 선택은 자유이며, 가입·결제로 이어지지 않고 가맹 진행에도 영향이 없습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
