// Supabase(PostgREST)는 한 번의 select가 기본 1000행에서 잘린다. 잘렸다는 신호가 따로
// 오지 않아, 목록 화면이 조용히 일부만 보여주게 된다. 검색·필터가 클라이언트에서 도는
// 화면이면 1001번째 이후는 검색해도 나오지 않는다.
//
// fetchFranchiseListData.ts가 쓰던 페이징 루프를 여기로 옮겨 정본을 하나로 뒀다.
// 상한 조정이 필요하면 이 파일만 고친다.

export const DEFAULT_PAGE_SIZE = 1000;
export const DEFAULT_MAX_ROWS = 5000;

// PostgREST가 in 필터를 쿼리스트링으로 실어 보내므로 ID를 한 번에 너무 많이 넣으면
// URL 길이 제한에 걸려 조회가 통째로 실패한다. UUID 하나가 약 37바이트라
// 150개면 5.5KB 남짓으로, 일반적인 헤더 상한에 여유가 있다.
export const DEFAULT_ID_CHUNK_SIZE = 150;

type QueryError = { code?: string; message?: string } | null;
type PageResult<T> = { data: T[] | null; error: QueryError };

export interface FetchAllRowsResult<T> {
  data: T[];
  error: QueryError;
  /** 상한(maxRows)에 걸려 뒤쪽 데이터가 잘렸을 수 있음 */
  truncated: boolean;
}

/**
 * range로 끝까지 훑어 모든 행을 가져온다.
 *
 * 주의: `runPage`의 정렬은 **동점이 없어야 한다.** Postgres는 ORDER BY가 같은 행들의
 * 순서를 보장하지 않아, 동점이 있으면 페이지 경계에서 같은 행이 두 번 나오거나 아예
 * 빠진다. updated_at처럼 여러 행이 같은 값을 갖기 쉬운 컬럼으로 정렬할 때는
 * `.order("id", ...)`를 마지막에 덧붙여 순서를 확정해라.
 *
 * @param runPage from~to 범위를 조회하는 함수. `.range(from, to)`를 붙여 넘긴다.
 */
export async function fetchAllRows<T>(
  runPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  options: { pageSize?: number; maxRows?: number; label?: string } = {},
): Promise<FetchAllRowsResult<T>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  const label = options.label ?? "fetchAllRows";

  const rows: T[] = [];
  let error: QueryError = null;
  let truncated = false;

  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error: pageError } = await runPage(from, from + pageSize - 1);
    if (pageError) {
      // 결과가 0건일 때 PostgREST가 던지는 PGRST103은 실패가 아니라 빈 결과다.
      if (pageError.code === "PGRST103") break;
      error = pageError;
      break;
    }
    if (!data?.length) break;
    rows.push(...data);
    // 채워지지 않은 페이지가 나오면 마지막 페이지다.
    if (data.length < pageSize) break;
    if (from + pageSize >= maxRows) {
      truncated = true;
      console.warn(
        `${label}: 상한 ${maxRows}행에 도달하여 이후 데이터가 잘렸을 수 있습니다 (조회된 행: ${rows.length})`,
      );
    }
  }

  return { data: rows, error, truncated };
}

/**
 * ID 목록을 나눠 여러 번 조회하고 합친다. `.in("col", ids)`를 그대로 쓰면
 * ID가 많을 때 URL 길이 제한에 걸리므로 이걸 거친다.
 *
 * @param runChunk ID 묶음 하나를 조회하는 함수. `.in("col", chunk)`를 붙여 넘긴다.
 */
export async function fetchByIdChunks<T>(
  ids: string[],
  runChunk: (chunk: string[]) => PromiseLike<PageResult<T>>,
  chunkSize: number = DEFAULT_ID_CHUNK_SIZE,
): Promise<{ data: T[]; error: QueryError }> {
  if (!ids.length) return { data: [], error: null };

  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await runChunk(ids.slice(i, i + chunkSize));
    if (error) return { data: rows, error };
    if (data?.length) rows.push(...data);
  }
  return { data: rows, error: null };
}
