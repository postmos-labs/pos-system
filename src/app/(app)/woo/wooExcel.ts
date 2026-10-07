// 우국상 선택 가맹점의 엑셀 시트 데이터(가맹점 정보 / 히스토리)를 만든다.
import type { WooCustomer } from "@/types";
import { parseMemoEntries } from "@/components/ui/MemoHistoryPanel";
import { formatKst, kstDate } from "@/lib/date";

export type WooExportColumn = { key: keyof WooCustomer; label: string };

export function buildWooExport(
  rows: WooCustomer[],
  columns: WooExportColumn[],
): { customers: Record<string, string>[]; history: Record<string, string>[] } {
  const customers = rows.map((row) =>
    Object.fromEntries(columns.map((col) => [col.label, String(row[col.key] ?? "")])),
  );

  const history = rows.flatMap((row) => {
    const base = {
      분류: row.category ?? "",
      상호명: row.business_name ?? "",
      대표자명: row.owner_name ?? "",
      연락처: row.phone ?? "",
    };
    const entries = parseMemoEntries(row.memo, row.created_at).sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    if (entries.length === 0) {
      return [{ ...base, 일시: "", 작성자: "", 내용: "(기록 없음)" }];
    }
    return entries.map((entry) => ({
      ...base,
      일시: `${kstDate(new Date(entry.at))} ${formatKst(entry.at, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })}`,
      작성자: entry.user === "-" ? "" : entry.user,
      내용: entry.text,
    }));
  });

  return { customers, history };
}

// 엑셀 칸 너비. 한글·한자는 영문보다 두 배 넓어 2칸으로 센다. 열자마자 읽히도록 내용에 맞추되 너무 넓어지지 않게 막는다.
export function columnWidths(
  records: Record<string, string>[],
  options: { min?: number; max?: number } = {},
): { wch: number }[] {
  const { min = 8, max = 50 } = options;
  const width = (text: string) => {
    let total = 0;
    for (const ch of text) total += ch.charCodeAt(0) > 0x2e7f ? 2 : 1;
    return total;
  };
  if (records.length === 0) return [];
  return Object.keys(records[0]).map((header) => {
    const longest = Math.max(
      width(header),
      ...records.map((record) =>
        Math.max(...(record[header] ?? "").split(/\r?\n/).map((line) => width(line))),
      ),
    );
    return { wch: Math.min(max, Math.max(min, longest + 2)) };
  });
}
