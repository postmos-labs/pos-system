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

export function thumbUrl(url: string, size: number) {
  if (!url.includes("/storage/v1/object/public/")) return url;
  return (
    url.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") +
    `?width=${size}&height=${size}&resize=cover&quality=40`
  );
}
