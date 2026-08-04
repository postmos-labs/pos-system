"use client";

import { X } from "lucide-react";
import { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
  zIndexClassName?: string;
}

// 등록/입력 폼을 화면 중앙 모달로 띄우는 공용 래퍼 (변경관리 탭 스타일)
export default function FormModal({
  title,
  onClose,
  children,
  maxWidthClassName = "max-w-md",
  zIndexClassName = "z-50",
}: Props) {
  return (
    <div
      className={`fixed inset-0 bg-black/30 flex items-center justify-center ${zIndexClassName} p-4`}
    >
      <div
        className={`bg-white border border-slate-200 rounded-2xl p-6 w-full ${maxWidthClassName} max-h-[90vh] overflow-y-auto shadow-xl`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button onClick={onClose}>
            <X size={20} className="text-slate-400" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
