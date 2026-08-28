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
