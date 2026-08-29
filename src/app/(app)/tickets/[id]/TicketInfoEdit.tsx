"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Ticket } from "@/types";
import { AppSelect } from "@/components/ui/AppSelect";
import {
  MEMO_ISSUE_CATEGORIES,
  MEMO_ISSUE_CATEGORY_LABEL,
  MEMO_RESOLUTIONS,
  MEMO_RESOLUTION_LABEL,
} from "@/app/(app)/merchants/merchant360";
import { DatePickerField } from "@/components/ui/DatePickerField";

const RECEPTION_CHANNELS = ["채널톡", "유선", "전화", "카카오톡", "문자", "방문", "온라인", "기타"];
const DOCUMENT_STATUSES = ["미접수", "일부접수", "완료"];
const VAN_COMPANIES = ["KIS", "NICE", "KCP", "KSNET", "한국정보통신", "스마트로", "JTNET", "기타"];
const SIMPLE_PAYMENTS = [
  "카카오페이",
  "네이버페이",
  "페이코",
  "삼성페이",
  "SSG페이",
  "L페이",
  "기타",
  "없음",
];

interface Props {
  ticket: Ticket;
  canEdit: boolean;
}

export default function TicketInfoEdit({ ticket, canEdit }: Props) {
  const [form, setForm] = useState({
    business_type: ticket.business_type ?? "개인",
    reception_channel: ticket.reception_channel ?? "",
    issue_category: ticket.issue_category ?? "",
    resolution: ticket.resolution ?? "",
    is_repeat: ticket.is_repeat == null ? "" : ticket.is_repeat ? "repeat" : "first",
    progress_note: ticket.progress_note ?? "",
    document_status: ticket.document_status ?? "미접수",
    internet: ticket.internet ?? "",
    product: ticket.product ?? "",
    card_apply_date: ticket.card_apply_date ?? "",
    van_company: ticket.van_company ?? "",
    baemin_apply: ticket.baemin_apply ?? false,
    simple_payment: ticket.simple_payment ?? "",
    memo: ticket.memo ?? "",
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (key: string, value: string | boolean) => {
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
    },
    [ticket.id],
  );

  function handleChange(key: string, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleBlur(key: string) {
    save(key, form[key as keyof typeof form] as string);
  }

  const INPUT = `w-full border-0 border-b border-slate-200 bg-transparent px-0 py-1 text-sm text-slate-900 focus:outline-none focus:border-blue-400 transition-colors ${canEdit ? "" : "pointer-events-none"}`;

  function StatusDot({ field }: { field: string }) {
    if (saving === field) return <span className="text-[10px] text-slate-400 ml-1">저장중...</span>;
    if (saveError === field)
      return <span className="text-[10px] text-red-500 ml-1">✗ 저장 실패</span>;
    if (saved === field) return <span className="text-[10px] text-blue-500 ml-1">✓ 저장됨</span>;
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">영업 / CS 정보</h2>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            사업자 구분 <StatusDot field="business_type" />
          </p>
          <AppSelect
            value={form.business_type}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("business_type", value);
              save("business_type", value);
            }}
            aria-label="사업자 구분"
            options={[
              { value: "개인", label: "개인사업자" },
              { value: "법인", label: "법인사업자" },
            ]}
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            접수 채널 <StatusDot field="reception_channel" />
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
            문제 유형 <StatusDot field="issue_category" />
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
            해결 방식 <StatusDot field="resolution" />
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
            반복 여부 <StatusDot field="is_repeat" />
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

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            서류 접수 상태 <StatusDot field="document_status" />
          </p>
          <AppSelect
            value={form.document_status}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("document_status", value);
              save("document_status", value);
            }}
            aria-label="서류 접수 상태"
            options={DOCUMENT_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            상품 <StatusDot field="product" />
          </p>
          <input
            value={form.product}
            disabled={!canEdit}
            onChange={(e) => handleChange("product", e.target.value)}
            onBlur={() => handleBlur("product")}
            className={INPUT}
            placeholder="예: 포스 단말기"
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            VAN사 <StatusDot field="van_company" />
          </p>
          <AppSelect
            value={form.van_company}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("van_company", value);
              save("van_company", value);
            }}
            aria-label="VAN사"
            options={[
              { value: "", label: "선택" },
              ...VAN_COMPANIES.map((v) => ({ value: v, label: v })),
            ]}
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            인터넷 <StatusDot field="internet" />
          </p>
          <input
            value={form.internet}
            disabled={!canEdit}
            onChange={(e) => handleChange("internet", e.target.value)}
            onBlur={() => handleBlur("internet")}
            className={INPUT}
            placeholder="예: KT, SKT"
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            카드가맹 접수일 <StatusDot field="card_apply_date" />
          </p>
          <DatePickerField
            value={form.card_apply_date}
            disabled={!canEdit}
            onChange={(value) => {
              handleChange("card_apply_date", value);
              save("card_apply_date", value);
            }}
            ariaLabel="카드가맹 접수일"
          />
        </div>

        {}
        <div>
          <p className="text-xs text-gray-400 mb-1">
            간편결제 <StatusDot field="simple_payment" />
          </p>
          <AppSelect
            value={form.simple_payment}
            disabled={!canEdit}
            onValueChange={(value) => {
              handleChange("simple_payment", value);
              save("simple_payment", value);
            }}
            aria-label="간편결제"
            options={[
              { value: "", label: "선택" },
              ...SIMPLE_PAYMENTS.map((p) => ({ value: p, label: p })),
            ]}
          />
        </div>

        {}
        <div className="col-span-2">
          <p className="text-xs text-gray-400 mb-1">
            배민접수 <StatusDot field="baemin_apply" />
          </p>
          <label
            className={`flex items-center gap-2 mt-1 ${canEdit ? "cursor-pointer" : "pointer-events-none"}`}
          >
            <input
              type="checkbox"
              checked={form.baemin_apply}
              disabled={!canEdit}
              onChange={(e) => {
                handleChange("baemin_apply", e.target.checked);
                save("baemin_apply", e.target.checked);
              }}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-gray-700">배민 접수됨</span>
          </label>
        </div>
      </div>

      {}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-1">
          답변내용 <StatusDot field="progress_note" />
        </p>
        <textarea
          value={form.progress_note}
          disabled={!canEdit}
          rows={2}
          onChange={(e) => handleChange("progress_note", e.target.value)}
          onBlur={() => handleBlur("progress_note")}
          className="w-full border-0 border-b border-slate-200 bg-transparent px-0 py-1 text-sm text-slate-900 focus:outline-none focus:border-blue-400 transition-colors resize-none"
          placeholder="답변내용"
        />
      </div>

      {}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-1">
          비고 <StatusDot field="memo" />
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
