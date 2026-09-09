"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AS_CHECKLIST_SECTIONS, AS_CHECKLIST_ITEM_IDS } from "@/lib/asChecklist";

// 등록 때 확인한 AS 응대 원칙 체크리스트. 상세에서 항목을 눌러 바로 고칠 수 있다.
// 등록 당시 체크리스트가 없던 옛 건도 여기서 채울 수 있게 빈 상태로 보여준다.
export default function TicketAsChecklist({
  ticketId,
  checklist,
  canEdit,
}: {
  ticketId: string;
  checklist: Record<string, boolean> | null | undefined;
  canEdit: boolean;
}) {
  const [values, setValues] = useState<Record<string, boolean>>(checklist ?? {});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const checked = AS_CHECKLIST_ITEM_IDS.filter((id) => values[id] === true).length;
  const total = AS_CHECKLIST_ITEM_IDS.length;
  const complete = checked === total;

  async function toggle(id: string) {
    if (!canEdit || saving) return;
    const next = { ...values, [id]: !values[id] };
    setValues(next);
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("tickets")
      .update({ as_checklist: next })
      .eq("id", ticketId);
    setSaving(false);
    if (error) {
      setValues(values);
      setSaveError(error.message);
    }
  }

  return (
    <details className="bg-white rounded-xl border border-gray-200 p-4 mb-4" open={!checklist}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">
          AS 응대 원칙 체크리스트
          {saving && <span className="ml-2 text-[10px] text-slate-400">저장중...</span>}
          {saveError && (
            <span className="ml-2 text-[10px] text-red-500">저장 실패: {saveError}</span>
          )}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            complete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {checked}/{total} 확인
        </span>
      </summary>
      {!checklist && (
        <p className="mt-2 text-xs text-slate-400">
          등록 때 체크리스트가 없던 건입니다. 항목을 누르면 바로 저장됩니다.
        </p>
      )}
      <div className="mt-3 space-y-3">
        {AS_CHECKLIST_SECTIONS.map((section) => (
          <div key={section.id}>
            <p className="mb-1 text-xs font-bold text-slate-700">{section.title}</p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.id}>
                  <label
                    className={`flex items-start gap-2 text-xs text-slate-700 ${
                      canEdit ? "cursor-pointer" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={values[item.id] === true}
                      onChange={() => toggle(item.id)}
                      disabled={!canEdit || saving}
                      className="mt-0.5 size-3.5 shrink-0"
                    />
                    <span>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
