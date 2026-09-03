// 일정 공유 링크의 주소 조각(slug). 개인은 이름(/staff-schedules/정희두),
// 전 직원을 한 화면에서 보는 링크는 "전체"(/staff-schedules/전체)를 쓴다.
//
// 서버 페이지와 데스크톱 캘린더(링크 복사 버튼)가 같은 값을 봐야 해서 여기 모았다.
// "전체"라는 이름을 가진 직원이 생기면 그 사람은 이 주소를 쓸 수 없으므로,
// 링크를 만들 때 id 주소로 떨어뜨린다.

export const ALL_STAFF_SLUG = "전체";

/** 주소 조각이 전체 보기인지. 브라우저가 한글을 인코딩해 보내는 경우도 받는다. */
export function isAllStaffSlug(slug: string): boolean {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // 인코딩이 깨진 값이 들어오면 원본 그대로 비교한다.
  }
  return decoded === ALL_STAFF_SLUG;
}
