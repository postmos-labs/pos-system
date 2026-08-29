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

// 옛 작업 관리 시절 값("전화" 등)도 남아 있어 목록에 함께 둔다.
const RECEPTION_CHANNELS = ["채널톡", "유선", "전화", "카카오톡", "문자", "방문", "온라인", "기타"];

interface Props {
  ticket: Ticket;
  canEdit: boolean;
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

export default function TicketInfoEdit({ ticket, canEdit }: Props) {
  const [form, setForm] = useState({
    reception_channel: ticket.reception_channel ?? "",
    issue_category: ticket.issue_category ?? "",
    resolution: ticket.resolution ?? "",
    is_repeat: ticket.is_repeat == null ? "" : ticket.is_repeat ? "repeat" : "first",
    progress_note: ticket.progress_note ?? "",
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
          답변내용{" "}
          <StatusDot field="progress_note" saving={saving} saved={saved} saveError={saveError} />
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
