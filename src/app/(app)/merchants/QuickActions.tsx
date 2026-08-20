import Link from "next/link";
import { Wrench, PackagePlus, FileEdit, ExternalLink } from "lucide-react";

function ActionButton({
  href,
  label,
  icon: Icon,
  disabled,
}: {
  href: string;
  label: string;
  icon: typeof Wrench;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <span className="flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-300">
        <Icon size={15} />
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
    >
      <Icon size={15} />
      {label}
    </Link>
  );
}

export default function QuickActions({
  franchiseApplicationId,
}: {
  franchiseApplicationId?: string | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-5 py-4 md:px-6">
      <h3 className="text-sm font-bold text-slate-900">빠른 업무</h3>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ActionButton href="/installs" label="A/S 접수" icon={Wrench} />
        <ActionButton href="/installs/delivery" label="장비 추가출고" icon={PackagePlus} />
        <ActionButton href="/changes" label="변경 접수" icon={FileEdit} />
        <ActionButton
          href={franchiseApplicationId ? `/franchise?id=${franchiseApplicationId}` : "#"}
          label="접수 원본 보기"
          icon={ExternalLink}
          disabled={!franchiseApplicationId}
        />
      </div>
    </section>
  );
}
