// 실시간 변경 이벤트로 목록을 언제 다시 불러올지 정하는 규칙.

export const REALTIME_REFRESH_DELAY_MS = 400; // 조용하다가 처음 변경이 왔을 때 기다리는 시간
export const REALTIME_REFRESH_MIN_GAP_MS = 10_000; // 재조회와 재조회 사이 최소 간격

/** 다음 재조회까지 기다릴 시간. 마지막 재조회 후 최소 간격이 안 지났으면 간격이 찰 때까지 미룬다. */
export function nextRefreshDelay(now: number, lastRefreshAt: number): number {
  return Math.max(REALTIME_REFRESH_DELAY_MS, lastRefreshAt + REALTIME_REFRESH_MIN_GAP_MS - now);
}
