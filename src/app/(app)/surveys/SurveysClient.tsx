"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPhone } from "@/lib/format";
import {
  SURVEY_ITEMS,
  SURVEY_ITEM_KEYS,
  surveyStageOf,
  type FranchiseSurvey,
  type SurveyItemKey,
} from "@/lib/survey";
import { markSurveyContacted } from "../franchise/surveyActions";

export type SurveyListRow = FranchiseSurvey & {
  franchise: {
    id: string;
    business_name: string | null;
    owner_name: string | null;
    phone: string | null;
  } | null;
};

type TabKey = "submitted" | "contacted" | "opened" | "sent" | "all";

const TABS: { key: TabKey; label: string }[] = [
  { key: "submitted", label: "응답(미연락)" },
  { key: "contacted", label: "연락완료" },
  { key: "opened", label: "열람만" },
  { key: "sent", label: "발송만" },
  { key: "all", label: "전체" },
];

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function SurveysClient({
  rows,
  unavailable,
}: {
  rows: SurveyListRow[];
  unavailable: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("submitted");
  const [itemFilter, setItemFilter] = useState<SurveyItemKey | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const staged = useMemo(() => rows.map((row) => ({ row, stage: surveyStageOf(row) })), [rows]);

  const tabCounts = useMemo(() => {
    const counts: Record<TabKey, number> = {
      submitted: 0,
      contacted: 0,
      opened: 0,
      sent: 0,
      all: staged.length,
    };
    for (const { stage } of staged) {
      if (stage in counts) counts[stage as TabKey] += 1;
    }
    return counts;
  }, [staged]);

  const inTab = useMemo(
    () => staged.filter(({ stage }) => tab === "all" || stage === tab),
    [staged, tab],
  );

  const hasItem = (row: SurveyListRow, key: SurveyItemKey) => (row.picks ?? []).includes(key);

  const itemCounts = useMemo(() => {
    const counts = {} as Record<SurveyItemKey, number>;
    for (const key of SURVEY_ITEM_KEYS) {
      counts[key] = inTab.filter(({ row }) => (row.picks ?? []).includes(key)).length;
    }
    return counts;
  }, [inTab]);

  const visible = itemFilter ? inTab.filter(({ row }) => hasItem(row, itemFilter)) : inTab;

  async function toggleContacted(row: SurveyListRow) {
    setBusyId(row.id);
    setError(null);
    const result = await markSurveyContacted(row.id, !row.contacted_at);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-foreground text-xl font-bold">리서치 응답</h1>
        <p className="mt-1 text-sm text-slate-500">
          알림톡 설문에 응답한 가맹점입니다. 연락 후 &apos;연락완료&apos;로 표시하세요.
        </p>
      </div>

      {unavailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          리서치 기능 준비 중 (DB 157 마이그레이션 실행 필요)
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold ${active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
            >
              {t.label}
              <span
                className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] ${active ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {tabCounts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {SURVEY_ITEM_KEYS.map((key) => {
          const active = itemFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setItemFilter(active ? null : key)}
              className={`h-8 rounded-full border px-3.5 text-xs font-semibold ${active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
            >
              {SURVEY_ITEMS[key].short} {itemCounts[key]}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">상호명 · 대표자</th>
              <th className="px-4 py-3 font-semibold">연락처</th>
              <th className="px-4 py-3 font-semibold">선택 항목</th>
              <th className="px-4 py-3 font-semibold">응답 시각</th>
              <th className="px-4 py-3 font-semibold">발송</th>
              <th className="px-4 py-3 font-semibold">연락 처리</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  해당하는 응답이 없습니다.
                </td>
              </tr>
            ) : (
              visible.map(({ row }) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-3">
                    {row.franchise ? (
                      <Link
                        href={`/franchise?id=${row.franchise.id}`}
                        className="font-semibold text-slate-900 hover:text-blue-600 hover:underline"
                      >
                        {row.franchise.business_name ?? "-"}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-900">-</span>
                    )}
                    <div className="text-xs text-slate-500">{row.franchise?.owner_name ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                    {row.franchise?.phone ? formatPhone(row.franchise.phone) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(row.picks ?? []).map((key) => (
                        <span
                          key={key}
                          className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-blue-700"
                        >
                          {SURVEY_ITEMS[key]?.short ?? key}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">
                    {formatDateTime(row.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">
                    <div>{row.sent_by_name ?? "-"}</div>
                    <div>{formatDateTime(row.sent_at)}</div>
                  </td>
                  <td className="px-4 py-3">
                    {row.submitted_at ? (
                      <button
                        type="button"
                        onClick={() => toggleContacted(row)}
                        disabled={busyId === row.id}
                        className={`h-8 rounded-lg border px-3 text-xs font-semibold whitespace-nowrap disabled:opacity-50 ${row.contacted_at ? "border-slate-300 bg-white text-slate-600 hover:bg-slate-50" : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"}`}
                      >
                        {row.contacted_at ? "연락완료 취소" : "연락완료"}
                      </button>
                    ) : null}
                    {row.contacted_at && (
                      <div className="mt-1 text-[11px] text-slate-500">{row.contacted_by_name}</div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
