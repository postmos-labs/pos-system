"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { VAN_GROUP_LABEL, type VanGroup } from "@/types";
import { AppSelect } from "@/components/ui/AppSelect";
import {
  MEMO_ISSUE_CATEGORY_LABEL,
  MEMO_RESOLUTION_LABEL,
} from "@/app/(app)/merchants/merchant360";
import type { CsReportMetrics } from "@/lib/csReport";

interface Props {
  month: string;
  van: string;
  schemaReady: boolean;
  /** 조회 자체가 실패했는지. 실패한 걸 0으로 보여주면 "장애 0건"으로 오해해 잘못 보고하게 된다. */
  loadFailed: boolean;
  managedMerchantCount: number;
  replacementEquipmentCount: number;
  /** 이번 달 수치에 합산된 인입내역 기술지원 AS 건수 */
  inboundAsCount: number;
  metrics: CsReportMetrics;
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${value.toFixed(1)}%`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split("-").map(Number);
  const total = year * 12 + (monthNum - 1) + delta;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return `${newYear}-${String(newMonth).padStart(2, "0")}`;
}

function MetricCard({
  label,
  value,
  valueClassName = "text-slate-900",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <p className="text-xs font-semibold text-slate-400">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${valueClassName}`}>{value}</p>
    </div>
  );
}

function BarList({ items }: { items: { key: string; label: string; count: number }[] }) {
  const max = Math.max(...items.map((row) => row.count), 1);
  return (
    <ul className="space-y-2.5">
      {items.map((row) => (
        <li key={row.key} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-sm text-slate-600">{row.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500"
              style={{ width: `${Math.round((row.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-semibold text-slate-700">
            {row.count}건
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function CsReportClient({
  month,
  van,
  schemaReady,
  loadFailed,
  managedMerchantCount,
  replacementEquipmentCount,
  inboundAsCount,
  metrics,
}: Props) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  function pushQuery(nextMonth: string, nextVan: string) {
    const query = new URLSearchParams();
    query.set("month", nextMonth);
    if (nextVan) query.set("van", nextVan);
    router.push(`/cs-report?${query.toString()}`);
  }

  const deltaClassName =
    metrics.prevMonthDelta === null
      ? "text-slate-900"
      : metrics.prevMonthDelta < 0
        ? "text-emerald-600"
        : metrics.prevMonthDelta > 0
          ? "text-red-600"
          : "text-slate-900";
  const deltaValue =
    metrics.prevMonthDelta === null
      ? "-"
      : `${metrics.prevMonthDelta > 0 ? "+" : ""}${metrics.prevMonthDelta.toFixed(1)}%`;

  async function handleDownload() {
    setDownloading(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const summaryData = [
        { 항목: "대상 기간", 값: month },
        { 항목: "VAN사", 값: VAN_GROUP_LABEL[van as VanGroup] ?? van },
        { 항목: "관리 가맹점", 값: `${managedMerchantCount}개` },
        { 항목: "총 CS", 값: `${metrics.csTotal}건` },
        { 항목: "원격 해결", 값: formatPercent(metrics.remoteRate) },
        { 항목: "출장", 값: `${metrics.onsiteCount}건` },
        { 항목: "전월 대비 장애", 값: deltaValue },
        { 항목: "교체 필요 장비", 값: `${replacementEquipmentCount}건` },
        { 항목: "인입내역 AS 포함", 값: `${inboundAsCount}건` },
        { 항목: "분류 미입력", 값: `${metrics.missingCount}건` },
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "요약");

      const topRepeatData =
        metrics.topRepeatIssues.length > 0
          ? metrics.topRepeatIssues.map((entry) => ({
              유형: MEMO_ISSUE_CATEGORY_LABEL[entry.category],
              건수: entry.count,
            }))
          : [{ 유형: "해당 없음", 건수: "" }];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(topRepeatData), "반복 장애 상위");

      const byIssueCategoryData = metrics.byIssueCategory.map((entry) => ({
        유형: MEMO_ISSUE_CATEGORY_LABEL[entry.category],
        건수: entry.count,
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(byIssueCategoryData),
        "장애 유형별",
      );

      const byResolutionData = metrics.byResolution.map((entry) => ({
        방식: MEMO_RESOLUTION_LABEL[entry.resolution],
        건수: entry.count,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byResolutionData), "해결 방식별");

      XLSX.writeFile(wb, `CS리포트_${month}_${VAN_GROUP_LABEL[van as VanGroup] ?? van}.xlsx`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">CS 리포트</h1>
        <p className="mt-1 text-sm text-slate-500">KICC 제출용 월간 CS 운영 집계입니다.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 py-1.5">
          <button
            type="button"
            onClick={() => pushQuery(shiftMonth(month, -1), van)}
            aria-label="이전 달"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <ChevronLeft size={16} />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && pushQuery(e.target.value, van)}
            className="border-0 bg-transparent px-1 text-sm font-medium text-slate-700 outline-none"
          />
          <button
            type="button"
            onClick={() => pushQuery(shiftMonth(month, 1), van)}
            aria-label="다음 달"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <AppSelect
          value={van}
          onValueChange={(value) => pushQuery(month, value)}
          aria-label="VAN사"
          className="w-40"
          options={[
            { value: "toss", label: VAN_GROUP_LABEL.toss },
            { value: "kicc", label: VAN_GROUP_LABEL.kicc },
          ]}
        />

        {schemaReady && !loadFailed && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Download size={15} />
            {downloading ? "내려받는 중..." : "엑셀 내려받기"}
          </button>
        )}
      </div>

      {loadFailed && (
        <div className="rounded-2xl border border-red-300 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700">
          데이터를 불러오지 못했습니다. 아래 수치는 실제 값이 아니니 보고에 사용하지 마세요.
          새로고침해도 같으면 개발팀에 알려주세요.
        </div>
      )}

      {!schemaReady && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
          아직 집계 준비가 끝나지 않았습니다. VAN사·장애 유형·해결 방식 등 신규 항목이
          데이터베이스에 반영되면 정확한 수치가 표시됩니다.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="관리 가맹점" value={`${managedMerchantCount}개`} />
        <MetricCard label="총 CS" value={`${metrics.csTotal}건`} />
        <MetricCard label="원격 해결 %" value={formatPercent(metrics.remoteRate)} />
        <MetricCard label="출장" value={`${metrics.onsiteCount}건`} />
        <MetricCard label="전월 대비" value={deltaValue} valueClassName={deltaClassName} />
        <MetricCard label="교체 필요 장비" value={`${replacementEquipmentCount}건`} />
      </div>

      {inboundAsCount > 0 && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-700">
          이번 달 수치에 인입내역의 기술지원 AS <strong>{inboundAsCount}건</strong>이 포함되어
          있습니다. VAN사가 확인되지 않은 인입 건은 토스계열 리포트에만 합산됩니다.
        </div>
      )}

      {metrics.missingCount > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <p>
            <strong>{metrics.missingCount}건</strong>이 장애 유형·해결 방식·반복 여부 중 하나 이상
            분류되지 않아 위 숫자에 반영되지 않았습니다.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">반복 장애 상위 5종</h2>
          <div className="mt-4">
            {metrics.topRepeatIssues.length === 0 ? (
              <p className="text-sm text-slate-400">반복 장애로 표시된 건이 없습니다.</p>
            ) : (
              <BarList
                items={metrics.topRepeatIssues.map((entry) => ({
                  key: entry.category,
                  label: MEMO_ISSUE_CATEGORY_LABEL[entry.category],
                  count: entry.count,
                }))}
              />
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">해결 방식 분포</h2>
          <div className="mt-4">
            <BarList
              items={metrics.byResolution.map((entry) => ({
                key: entry.resolution,
                label: MEMO_RESOLUTION_LABEL[entry.resolution],
                count: entry.count,
              }))}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">장애 유형 분포</h2>
          <div className="mt-4">
            <BarList
              items={metrics.byIssueCategory.map((entry) => ({
                key: entry.category,
                label: MEMO_ISSUE_CATEGORY_LABEL[entry.category],
                count: entry.count,
              }))}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">개선 필요 브랜드</h2>
          <p className="mt-1 text-xs text-slate-400">반복 장애가 2건 이상 발생한 브랜드입니다.</p>
          <div className="mt-4">
            {metrics.improvableBrands.count === 0 ? (
              <p className="text-sm text-slate-400">해당하는 브랜드가 없습니다.</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-900">
                  {metrics.improvableBrands.count}개
                </p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {metrics.improvableBrands.brands.map((brand) => (
                    <li
                      key={brand}
                      className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600"
                    >
                      {brand}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
