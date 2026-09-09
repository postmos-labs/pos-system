// 재고 품목 카탈로그 — 재고 실사 등록 폼의 드롭다운과 택배 발송 체크리스트가 같이 쓴다.
//
// 완료 시 재고 차감은 품목명이 글자까지 같아야 되므로, 체크리스트가 자유 입력이 아니라
// 이 목록에서 고르게 해 두 화면의 이름을 한곳에서 맞춘다. 품목을 더할 땐 여기만 고친다.

export const INVENTORY_CATEGORY_TREE: Record<string, Record<string, string[]>> = {
  포스장비: {
    포스기: [
      "J100 화이트",
      "J100 블랙",
      "J200 화이트",
      "J200 블랙",
      "T100 화이트",
      "T100 블랙",
      "T200 화이트",
      "T200 블랙",
      "G250 화이트",
      "G250 블랙",
      "윙포스 화이트",
    ],
  },
  주변기기: {
    영수증프린터: ["ZPP-3000 화이트", "ZPP-3000 블랙"],
    금전함: ["금전함"],
    "테블릿 PC": ["테블릿 PC"],
    "테이블 오더 브라켓": ["테이블 오더 브라켓"],
    핸드스캐너: ["핸드스캐너"],
  },
  결제장비: {
    프론트: ["프론트"],
    카드리더기: ["코세스/코밴 SDR-300"],
    "블루투스 스와이프 단말기": ["코세스/코밴 KRE-C100+"],
  },
};

export const INVENTORY_MAJOR_CATEGORIES = Object.keys(INVENTORY_CATEGORY_TREE);

/** 포스기 기종 — 택배 체크리스트의 빠른 선택 버튼 */
export const POS_ITEM_NAMES: string[] = INVENTORY_CATEGORY_TREE["포스장비"]["포스기"];

/** 중분류별 품목명 — 체크리스트의 "재고 품목에서 추가" 목록 */
export const INVENTORY_ITEM_GROUPS: { group: string; names: string[] }[] = Object.values(
  INVENTORY_CATEGORY_TREE,
).flatMap((mids) => Object.entries(mids).map(([group, names]) => ({ group, names })));

/** 전체 품목명 (자동완성용) */
export const INVENTORY_ITEM_NAMES: string[] = INVENTORY_ITEM_GROUPS.flatMap((g) => g.names);
