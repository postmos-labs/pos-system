import { AS_CHECKLIST_SECTIONS, AS_CHECKLIST_ITEM_IDS } from "@/lib/asChecklist";

// 등록 때 확인한 AS 응대 원칙 체크리스트. 기술지원 건에서만 보이며 수정하지 않는다 —
// 응대 당시 무엇을 확인했는지가 기록이기 때문이다.
export default function TicketAsChecklist({
  checklist,
}: {
  checklist: Record<string, boolean> | null | undefined;
}) {
  if (!checklist) return null;
  const checked = AS_CHECKLIST_ITEM_IDS.filter((id) => checklist[id] === true).length;
  const total = AS_CHECKLIST_ITEM_IDS.length;
  const complete = checked === total;

  return (
    <details className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">AS 응대 원칙 체크리스트</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            complete ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
          }`}
        >
          {checked}/{total} 확인
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        {AS_CHECKLIST_SECTIONS.map((section) => (
          <div key={section.id}>
            <p className="mb-1 text-xs font-bold text-slate-700">{section.title}</p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-xs text-slate-700">
                  <span
                    className={`mt-0.5 shrink-0 ${
                      checklist[item.id] === true ? "text-green-600" : "text-slate-300"
                    }`}
                    aria-label={checklist[item.id] === true ? "확인함" : "확인 안 함"}
                  >
                    {checklist[item.id] === true ? "✓" : "○"}
                  </span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
