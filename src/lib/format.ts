/** 숫자만 남긴다. 하이픈 유무와 관계없이 번호를 비교할 때 쓴다 */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  const len = digits.length;
  if (len < 4) return digits;
  if (len < 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (len === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

export function formatBusinessNumber(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 10);
  const len = digits.length;
  if (len < 4) return digits;
  if (len < 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function formatDateText(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const len = digits.length;
  if (len < 5) return digits;
  if (len < 7) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

// 예전엔 Supabase 이미지 변환(/render/image)으로 썸네일을 줄여 받았는데, Pro 요금제 포함량이
// 월 100장이라 설치 사진만으로 금방 넘었다(2026-11 기준 405장, spend cap에 걸려 변환이 막힐 수 있음).
// 전송량(250GB 중 수 GB 사용)은 여유가 커서 원본을 그대로 쓰고 화면에서 CSS로 줄여 보여 준다.
// size 인자는 호출부 호환을 위해 남겨 둔다.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function thumbUrl(url: string, _size: number) {
  return url;
}
