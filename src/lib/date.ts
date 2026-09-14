// 날짜 문자열(YYYY-MM-DD)은 항상 한국 기준으로 만든다.
//
// new Date().toISOString()은 UTC 날짜라, 한국 00:00~08:59 사이에는 하루 전 날짜가 나온다.
// 서버(Vercel은 UTC)와 브라우저(한국) 양쪽 모두 같은 함정에 빠지므로 이 헬퍼로 통일한다.

const KST_FORMATTER = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });

/** 주어진 시점을 한국 날짜 문자열(YYYY-MM-DD)로 바꾼다. */
export function kstDate(value: Date | number = Date.now()): string {
  return KST_FORMATTER.format(value);
}

/** 오늘(한국 기준) 날짜 문자열. offsetDays로 며칠 앞뒤를 볼 수 있다. */
export function kstToday(offsetDays = 0): string {
  return kstDate(Date.now() + offsetDays * 86400000);
}

export const KST_TIME_ZONE = "Asia/Seoul";

/**
 * 어느 환경에서 돌든 "한국 벽시계"를 가리키는 Date를 돌려준다.
 *
 * 서버 함수는 시드니(UTC+10)에서 돌고 사용자는 한국이라, date-fns format()처럼 실행 환경의 시간대를
 * 따르는 함수는 서버 HTML과 브라우저 렌더가 서로 다른 글자를 낸다(하이드레이션 불일치 → 표 전체 재렌더).
 * DB 타임스탬프를 format()에 넘기기 전에 이 함수로 감싸면 양쪽이 같은 한국 시각을 낸다.
 */
export function kstWallClock(value: Date | string | number): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return date;
  return new Date(date.getTime() + (9 * 60 + date.getTimezoneOffset()) * 60_000);
}

/** toLocaleString("ko-KR")을 대체한다. 잘못된 값이면 "-". 시간대는 항상 한국. */
export function formatKst(
  value: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (value == null) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", { timeZone: KST_TIME_ZONE, ...options });
}
