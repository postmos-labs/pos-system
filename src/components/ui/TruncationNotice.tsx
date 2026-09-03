import { AlertTriangle } from "lucide-react";

/**
 * 조회 상한에 걸려 목록 일부가 빠졌을 때 띄우는 경고.
 *
 * 이 화면들은 검색·필터가 클라이언트에서 돌기 때문에, 잘린 데이터는 화면에 안 보일 뿐
 * 아니라 검색해도 나오지 않는다. 사용자가 "없다"고 판단해버리기 전에 알려야 한다.
 */
export function TruncationNotice({ maxRows }: { maxRows: number }) {
  return (
    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium px-4 py-2.5 rounded-xl">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        데이터가 많아 최근 {maxRows.toLocaleString()}건만 불러왔습니다. 이후 건은 목록과 검색에
        나오지 않으니 기간·상태 필터로 범위를 좁혀 확인해주세요.
      </span>
    </div>
  );
}
