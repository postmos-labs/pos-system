"use client";

import { memo, useState } from "react";
import { AppSelect } from "@/components/ui/AppSelect";

// InstallsClient.tsx(모바일 카드 뷰)와 InstallDetailDrawer.tsx(설치건 상세 드로어)가
// 같은 제품 편집 UI를 공유한다. InstallsClient.tsx가 InstallDetailDrawer를 렌더링하고
// InstallDetailDrawer도 이 컴포넌트가 필요해, 두 파일이 서로 import하면 순환 참조가
// 생길 수 있어 별도 파일로 분리했다(installStatus.ts와 같은 이유).
export const PRODUCT_CATALOG = [
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
  "ZPP-3000 화이트",
  "ZPP-3000 블랙",
  "금전함",
  "테블릿 PC",
  "테이블 오더 브라켓",
  "핸드스캐너",
  "프론트",
  "코세스/코밴 SDR-300",
  "코세스/코밴 KRE-C100+",
  "기타",
];

export function QtyStepper({
  value,
  onChange,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
}) {
  const btnCls = size === "sm" ? "w-6 h-6 text-sm" : "w-9 h-9 text-base";
  const numCls = size === "sm" ? "w-7 text-xs" : "w-10 text-sm";
  return (
    <div
      className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        className={`${btnCls} flex items-center justify-center bg-slate-50 text-slate-600 hover:bg-slate-100 font-bold`}
      >
        −
      </button>
      <span className={`${numCls} text-center font-semibold text-slate-800`}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`${btnCls} flex items-center justify-center bg-slate-50 text-slate-600 hover:bg-slate-100 font-bold`}
      >
        +
      </button>
    </div>
  );
}

export const InstallItemsEditor = memo(function InstallItemsEditor({
  items,
  onChange,
}: {
  items: { name: string; quantity: number }[];
  onChange: (items: { name: string; quantity: number }[]) => void;
}) {
  const [product, setProduct] = useState(PRODUCT_CATALOG[0]);
  const [customName, setCustomName] = useState("");
  const [qty, setQty] = useState(1);
  function add() {
    const name = customName.trim() || product;
    if (!name) return;
    const existing = items.find((i) => i.name === name);
    const next = existing
      ? items.map((i) => (i.name === name ? { ...i, quantity: i.quantity + qty } : i))
      : [...items, { name, quantity: qty }];
    onChange(next);
    setQty(1);
    setCustomName("");
  }
  function remove(name: string) {
    onChange(items.filter((i) => i.name !== name));
  }
  function setQuantity(name: string, q: number) {
    onChange(items.map((i) => (i.name === name ? { ...i, quantity: q } : i)));
  }
  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((i) => (
            <li
              key={i.name}
              className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded px-2 py-1 gap-2"
            >
              <span className="flex-1 min-w-0 truncate">{i.name}</span>
              <QtyStepper size="sm" value={i.quantity} onChange={(q) => setQuantity(i.name, q)} />
              <button
                type="button"
                onClick={() => remove(i.name)}
                className="shrink-0 text-slate-400 hover:text-red-500"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5">
        <AppSelect
          value={product}
          onValueChange={(value) => {
            setProduct(value);
            setCustomName("");
          }}
          aria-label="제품 선택"
          className="flex-1 min-w-0"
          options={PRODUCT_CATALOG.map((p) => ({ value: p, label: p }))}
        />
        <QtyStepper size="sm" value={qty} onChange={setQty} />
        <button
          type="button"
          onClick={add}
          className="shrink-0 px-2.5 py-1 bg-slate-800 text-white text-xs rounded hover:bg-slate-700"
        >
          추가
        </button>
      </div>
      <input
        value={customName}
        onChange={(e) => setCustomName(e.target.value)}
        placeholder="목록에 없는 제품은 직접 입력"
        className="border border-slate-200 rounded px-2 py-1 text-xs focus:outline-none"
      />
    </div>
  );
});
