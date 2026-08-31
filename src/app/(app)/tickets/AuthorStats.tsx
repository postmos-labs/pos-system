import Link from "next/link";

export interface AuthorStatRow {
  name: string;
  cs: number;
  tech: number;
  total: number;
}

const RANGES = [
  { key: "month", label: "이번 달" },
  { key: "prev", label: "지난 달" },
  { key: "all", label: "전체" },
] as const;

export type AuthorStatRange = (typeof RANGES)[number]["key"];

/**
 * 누가 인입내역을 몇 건 남겼는지 보는 표. 마스터만 본다.
 *
 * 담당자(sales_id / cs_id / tech_id) 기준으로 센다. 등록하면 등록자가 자기 팀 담당으로
 * 들어가므로 사실상 작성자 집계다. 나중에 담당을 옮기면 옮겨간 사람 쪽으로 잡힌다.
 */
export default function AuthorStats({
  rows,
  range,
  truncated,
}: {
  rows: AuthorStatRow[];
  range: AuthorStatRange;
  truncated: boolean;
}) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <details className="mb-4 rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        작성 현황
        <span className="ml-2 text-xs font-medium text-slate-400">
          마스터 전용 · {RANGES.find((item) => item.key === range)?.label} {total}건
        </span>
      </summary>

      <div className="border-t border-slate-100 px-4 py-3">
        <div className="mb-3 flex w-fit gap-1 rounded-lg bg-slate-100 p-1">
          {RANGES.map((item) => (
            <Link
              key={item.key}
              href={`/tickets?stat=${item.key}`}
              scroll={false}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                range === item.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">기록이 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-400">
                <th className="py-1.5 text-left font-medium">담당자</th>
                <th className="py-1.5 text-right font-medium">CS팀</th>
                <th className="py-1.5 text-right font-medium">기술지원</th>
                <th className="py-1.5 text-right font-medium">합계</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((row) => (
                <tr key={row.name} className="border-b border-slate-50 last:border-0">
                  <td className="py-1.5 text-slate-700">{row.name}</td>
                  <td className="py-1.5 text-right text-slate-500">{row.cs || "-"}</td>
                  <td className="py-1.5 text-right text-slate-500">{row.tech || "-"}</td>
                  <td className="py-1.5 text-right font-semibold text-slate-900">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {truncated && (
          <p className="mt-2 text-[11px] text-amber-600">
            건수가 많아 일부만 집계했습니다. 기간을 좁혀서 봐주세요.
          </p>
        )}
      </div>
    </details>
  );
}
