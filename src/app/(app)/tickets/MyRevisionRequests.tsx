import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export interface MyRevisionRow {
  id: string;
  ticket_id: string;
  ticket_title: string | null;
  message: string;
  requested_by_name: string | null;
  requested_at: string;
}

// KST 기준 M/d HH:mm — revisions/RevisionsClient.tsx의 포맷과 동일하게 맞춘다.
// 서버 컴포넌트는 Vercel에서 UTC로 돌기 때문에 date-fns format 대신 Intl에 timeZone을 직접 준다.
const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(value: string) {
  const parts = DATETIME_FORMATTER.formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour").padStart(2, "0").replace("24", "00");
  return `${get("month")}/${get("day")} ${hour}:${get("minute")}`;
}

export default function MyRevisionRequests({ rows }: { rows: MyRevisionRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 mb-6">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-700" />
        <p className="text-sm font-bold text-amber-900">나에게 온 수정 요청 {rows.length}건</p>
        <span className="text-xs text-amber-700">
          각 건을 열어 내용을 고치면 마스터가 확인 후 닫습니다.
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl bg-white border border-amber-100 px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/tickets/${row.ticket_id}`}
                className="text-sm font-semibold text-slate-900 hover:underline"
              >
                {row.ticket_title ?? "(제목 없음)"}
              </Link>
              <span className="shrink-0 text-xs text-slate-500">
                {row.requested_by_name ?? "마스터"} · {formatDateTime(row.requested_at)}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-slate-700 whitespace-pre-wrap line-clamp-4">
              {row.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
