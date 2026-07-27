"use client";

import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  FRANCHISE_STATUS_LABEL,
  APPLICANT_TYPE_LABEL,
  type FranchiseStatus,
  type ApplicantType,
} from "@/types";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

const BACKUP_TABLES: { label: string; table: string; optional?: boolean }[] = [
  { label: "가맹접수", table: "franchise_applications" },
  { label: "설치관리", table: "installations" },
  { label: "인터넷관리", table: "internet_management" },
  { label: "용지요청", table: "paper_orders" },
  { label: "우국상 관리", table: "woo_customers" },
  { label: "AS티켓", table: "tickets" },
  { label: "가맹점", table: "merchants" },
  { label: "직원정보", table: "profiles" },
  { label: "작업이력", table: "ticket_logs" },
  { label: "고객연락이력", table: "contact_logs" },
  { label: "알림", table: "notifications" },
  { label: "첨부파일", table: "attachments" },
  { label: "변경관리", table: "change_requests" },
  { label: "캘린더일정", table: "calendar_events", optional: true },
  { label: "계약서", table: "contracts" },
  { label: "채팅읽음상태", table: "chat_room_reads", optional: true },
  { label: "가맹접수이력", table: "franchise_application_logs" },
  { label: "전체채팅", table: "messages" },
  { label: "DM방", table: "dm_rooms" },
  { label: "DM메시지", table: "dm_messages" },
  { label: "고객인입(CRM)", table: "crm_inbound" },
  { label: "설계도", table: "install_blueprints" },
  { label: "재고품목", table: "inventory_items" },
  { label: "재고이력", table: "inventory_logs" },
  { label: "알림톡발송이력", table: "notification_logs" },
];

// handleDownload 안에서 별도로 컬럼을 가공하는 7개 테이블을 제외한 나머지는
// 원본 컬럼 그대로 시트로 붙인다.
const CURATED_TABLES = new Set([
  "franchise_applications",
  "installations",
  "tickets",
  "merchants",
  "internet_management",
  "paper_orders",
  "woo_customers",
]);
const RAW_SHEET_TABLES = BACKUP_TABLES.filter((t) => !CURATED_TABLES.has(t.table));

function sanitizeForSheet(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] = value !== null && typeof value === "object" ? JSON.stringify(value) : value;
    }
    return out;
  });
}

async function fetchAllRows(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<{ rows: Record<string, unknown>[]; failed: boolean; missing: boolean }> {
  const pageSize = 1000;
  let from = 0;
  const all: Record<string, unknown>[] = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) {
      // PostgREST가 결과 0건일 때 던지는 "Requested range not satisfiable" (PGRST103)은
      // 실제 조회 실패가 아니라 빈 테이블/빈 결과이므로 실패로 취급하지 않는다.
      if (error.code === "PGRST103") break;
      // 선택 기능용 테이블이 아직 생성되지 않은 경우(PGRST205/42P01)는
      // 다운로드 자체를 실패로 처리하지 않고 빈 시트로 건너뜁니다.
      const missing = error.code === "PGRST205" || error.code === "42P01";
      return { rows: all, failed: true, missing };
    }
    if (!data) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return { rows: all, failed: false, missing: false };
}

function downloadCsv(
  XLSX: typeof import("xlsx"),
  rows: Record<string, unknown>[],
  filename: string,
) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ExcelDownloadButton() {
  const [loading, setLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const toast = useToast();

  async function handleDownload() {
    setLoading(true);
    try {
      const supabase = createClient();
      const queries: { label: string; result: PromiseLike<{ data: any[] | null; error: any }> }[] =
        [
          {
            label: "가맹접수",
            result: supabase
              .from("franchise_applications")
              .select(
                "*, sales:profiles!franchise_applications_sales_id_fkey(name), cs:profiles!franchise_applications_cs_id_fkey(name)",
              )
              .order("created_at", { ascending: false }),
          },
          {
            label: "설치관리",
            result: supabase
              .from("installations")
              .select("*, assignee:profiles!installations_assigned_to_fkey(name)")
              .order("created_at", { ascending: false }),
          },
          {
            label: "AS티켓",
            result: supabase
              .from("tickets")
              .select(
                "*, merchant:merchants(business_name,phone), tech:profiles!tickets_tech_id_fkey(name)",
              )
              .order("created_at", { ascending: false }),
          },
          {
            label: "가맹점",
            result: supabase
              .from("merchants")
              .select("*, sales:profiles!merchants_sales_id_fkey(name)")
              .order("created_at", { ascending: false }),
          },
          {
            label: "인터넷관리",
            result: supabase
              .from("internet_management")
              .select("*")
              .order("created_at", { ascending: false }),
          },
          {
            label: "용지요청",
            result: supabase
              .from("paper_orders")
              .select("*")
              .order("created_at", { ascending: false }),
          },
          {
            label: "우국상 관리",
            result: supabase
              .from("woo_customers")
              .select("*")
              .order("created_at", { ascending: false }),
          },
        ];

      const [
        { data: franchiseRows, error: franchiseError },
        { data: installRows, error: installError },
        { data: ticketRows, error: ticketError },
        { data: merchantRows, error: merchantError },
        { data: internetRows, error: internetError },
        { data: paperOrderRows, error: paperOrderError },
        { data: wooRows, error: wooError },
      ] = await Promise.all(queries.map((q) => q.result));

      const failedLabels = queries
        .map((q, i) => ({
          label: q.label,
          error: [
            franchiseError,
            installError,
            ticketError,
            merchantError,
            internetError,
            paperOrderError,
            wooError,
          ][i],
        }))
        .filter((q) => q.error)
        .map((q) => q.label);

      if (failedLabels.length > 0) {
        toast.error(`일부 시트 조회 실패로 데이터가 누락되었습니다: ${failedLabels.join(", ")}`);
      }

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const franchiseData = (franchiseRows ?? []).map((r: any) => ({
        상호명: r.business_name ?? "",
        대표자: r.owner_name ?? "",
        연락처: r.phone ?? "",
        사업자번호: r.business_number ?? "",
        사업자유형: APPLICANT_TYPE_LABEL[r.applicant_type as ApplicantType] ?? r.applicant_type,
        접수채널: r.reception_channel ?? "",
        상태: FRANCHISE_STATUS_LABEL[r.status as FranchiseStatus] ?? r.status,
        담당영업: r.sales?.name ?? "",
        담당CS: r.cs?.name ?? "",
        주소: r.address ?? "",
        인터넷: r.internet ?? "",
        VAN사: r.van_company ?? "",
        오픈예정일: r.open_date ?? "",
        설치발송일: r.install_date ?? "",
        비고: r.memo ?? "",
        등록일: r.created_at
          ? format(new Date(r.created_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
        최종수정일: r.updated_at
          ? format(new Date(r.updated_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(franchiseData), "가맹접수");

      const STATUS_KO: Record<string, string> = {
        received: "접수",
        preparing: "제품준비",
        scheduled: "일정확정",
        in_transit: "이동중",
        completed: "설치완료",
        rejected: "반려",
      };
      const installData = (installRows ?? []).map((i: any) => ({
        상호명: i.customer_name ?? "",
        고객명: i.contact_name ?? "",
        전화번호: i.customer_phone ?? "",
        제품: (i.items ?? []).map((it: any) => `${it.name} x${it.quantity}`).join(", "),
        상태: STATUS_KO[i.status] ?? i.status,
        담당기사: i.assignee?.name ?? "",
        주소: i.address ?? "",
        비고: i.notes ?? "",
        등록일: i.created_at
          ? format(new Date(i.created_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(installData), "설치관리");

      const ticketData = (ticketRows ?? []).map((t: any) => ({
        제목: t.title ?? "",
        유형: t.type ?? "",
        상태: t.status ?? "",
        우선순위: t.priority ?? "",
        가맹점: t.merchant?.business_name ?? "",
        담당기사: t.tech?.name ?? "",
        예약일: t.scheduled_at
          ? format(new Date(t.scheduled_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
        등록일: t.created_at
          ? format(new Date(t.created_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ticketData), "AS티켓");

      const merchantData = (merchantRows ?? []).map((m: any) => ({
        상호명: m.business_name ?? "",
        대표자: m.owner_name ?? "",
        전화번호: m.phone ?? "",
        주소: m.address ?? "",
        POS모델: m.pos_model ?? "",
        담당영업: m.sales?.name ?? "",
        메모: m.memo ?? "",
        등록일: m.created_at
          ? format(new Date(m.created_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(merchantData), "가맹점");

      const internetData = (internetRows ?? []).map((n: any) => ({
        상호명: n.business_name ?? "",
        대표자: n.owner_name ?? "",
        연락처: n.phone ?? "",
        구분: n.category ?? "",
        통신사: n.carrier ?? "",
        속도: n.speed ?? "",
        추가가입상품: n.addon ?? "",
        사은품: n.gift ?? "",
        지역: n.region ?? "",
        상태: n.status ?? "",
        월요금: n.monthly_fee ?? "",
        설치비: n.install_fee ?? "",
        접수신청일: n.apply_date ?? "",
        개통완료일: n.open_date ?? "",
        비고: n.memo ?? "",
        등록일: n.created_at
          ? format(new Date(n.created_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(internetData), "인터넷관리");

      const paperOrderData = (paperOrderRows ?? []).map((p: any) => ({
        상호명: p.business_name ?? "",
        대표자: p.owner_name ?? "",
        연락처: p.phone ?? "",
        주소: p.address ?? "",
        수량: p.count ?? "",
        규격: p.unit_standard ?? "",
        매출: p.revenue ?? "",
        발송여부: p.shipped ? "발송완료" : "미발송",
        요청일: p.requested_at ?? "",
        발송일: p.shipped_at ?? "",
        배송메모: p.delivery_note ?? "",
        비고: p.memo ?? "",
        등록일: p.created_at
          ? format(new Date(p.created_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paperOrderData), "용지요청");

      const wooData = (wooRows ?? []).map((w: any) => ({
        상호명: w.business_name ?? "",
        대표자: w.owner_name ?? "",
        사업자번호: w.business_number ?? "",
        연락처: w.phone ?? "",
        담당자: w.manager ?? "",
        구분: w.category ?? "",
        접수일: w.received_date ?? "",
        인터넷종류: w.internet_type ?? "",
        인터넷비고: w.internet_note ?? "",
        인터넷개통일: w.internet_open_date ?? "",
        카드가맹신청일: w.card_apply_date ?? "",
        카드가맹여부: w.card_apply_status ?? "",
        간편결제: w.easy_payment ?? "",
        포스설치일: w.pos_install_date ?? "",
        설치일정메모: w.install_schedule_note ?? "",
        세팅: w.setting ?? "",
        개통일: w.open_date ?? "",
        VAN사: w.van_company ?? "",
        POS프로그램: w.pos_program ?? "",
        제품: w.product ?? "",
        주소: w.address ?? "",
        비고: w.memo ?? "",
        등록일: w.created_at
          ? format(new Date(w.created_at), "yyyy-MM-dd HH:mm", { locale: ko })
          : "",
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wooData), "우국상 관리");

      const rawFailed: string[] = [];
      for (const { label, table, optional } of RAW_SHEET_TABLES) {
        const { rows, failed, missing } = await fetchAllRows(supabase, table);
        if (failed && !(optional && missing)) rawFailed.push(label);
        if (rows.length === 0) continue;
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.json_to_sheet(sanitizeForSheet(rows)),
          label.slice(0, 31),
        );
      }
      if (rawFailed.length > 0) {
        toast.error(`일부 시트 조회 실패로 데이터가 누락되었습니다: ${rawFailed.join(", ")}`);
      }

      XLSX.writeFile(wb, `전체현황_${format(new Date(), "yyyyMMdd_HHmm", { locale: ko })}.xlsx`);
    } finally {
      setLoading(false);
    }
  }

  async function handleBackup() {
    setBackingUp(true);
    try {
      const supabase = createClient();
      const XLSX = await import("xlsx");
      const stamp = format(new Date(), "yyyyMMdd_HHmm", { locale: ko });
      const failedTables: string[] = [];
      for (const { label, table, optional } of BACKUP_TABLES) {
        const { rows, failed, missing } = await fetchAllRows(supabase, table);
        if (failed && !(optional && missing)) failedTables.push(label);
        if (rows.length === 0) continue;
        downloadCsv(XLSX, sanitizeForSheet(rows), `${label}_${table}_${stamp}.csv`);

        await new Promise((r) => setTimeout(r, 300));
      }
      if (failedTables.length > 0) {
        toast.error(`일부 테이블 백업 실패(데이터 누락 가능): ${failedTables.join(", ")}`);
      }
    } finally {
      setBackingUp(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDownload}
        disabled={loading}
        className="flex items-center gap-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors"
      >
        <Download size={15} />
        {loading ? "다운로드 중..." : "전체 데이터 엑셀"}
      </button>
      <button
        onClick={handleBackup}
        disabled={backingUp}
        title="전체 탭을 원본 데이터 그대로 탭별 CSV 파일로 저장합니다"
        className="flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors"
      >
        <Download size={15} />
        {backingUp ? "백업 중..." : "전체 백업 (CSV)"}
      </button>
    </div>
  );
}
