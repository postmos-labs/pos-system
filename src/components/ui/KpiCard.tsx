import type { LucideIcon } from "lucide-react";

const TONE_CLASSES = {
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  green: "bg-green-50 text-green-600",
} as const;

interface Props {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone: keyof typeof TONE_CLASSES;
  onClick?: () => void;
  active?: boolean;
}

export default function KpiCard({ label, value, icon: Icon, tone, onClick, active }: Props) {
  const content = (
    <>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}
      >
        <Icon size={16} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs text-slate-400">{label}</span>
        <span className="mt-1 block whitespace-nowrap text-lg font-bold text-slate-900">
          {value}
          <small className="ml-0.5 text-xs font-medium text-slate-400">건</small>
        </span>
      </span>
    </>
  );

  const className = `flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-3 shadow-sm text-left transition-colors ${
    active ? "border-blue-400 ring-1 ring-blue-300" : "border-slate-200"
  } ${onClick ? "cursor-pointer hover:border-slate-300 hover:bg-slate-50" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}
