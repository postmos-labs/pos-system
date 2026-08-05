import type { LucideIcon } from "lucide-react";

export type RateBadgeTone = "fuchsia" | "blue" | "orange";

const TONE_CLASSES: Record<
  RateBadgeTone,
  {
    border: string;
    bg: string;
    ring: string;
    track: string;
    icon: string;
    text: string;
    sub: string;
  }
> = {
  fuchsia: {
    border: "border-fuchsia-200",
    bg: "from-fuchsia-50 to-fuchsia-100/60",
    ring: "#c026d3",
    track: "#f5d0fe",
    icon: "bg-fuchsia-500/15 text-fuchsia-600",
    text: "text-fuchsia-700",
    sub: "text-fuchsia-500/80",
  },
  blue: {
    border: "border-blue-200",
    bg: "from-blue-50 to-blue-100/60",
    ring: "#2563eb",
    track: "#bfdbfe",
    icon: "bg-blue-500/15 text-blue-600",
    text: "text-blue-700",
    sub: "text-blue-500/80",
  },
  orange: {
    border: "border-orange-200",
    bg: "from-orange-50 to-orange-100/60",
    ring: "#ea580c",
    track: "#fed7aa",
    icon: "bg-orange-500/15 text-orange-600",
    text: "text-orange-700",
    sub: "text-orange-500/80",
  },
};

function RateRing({
  rate,
  size = 64,
  stroke = 6,
  colors,
}: {
  rate: number | null;
  size?: number;
  stroke?: number;
  colors: (typeof TONE_CLASSES)[RateBadgeTone];
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = rate ?? 0;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.track}
          strokeWidth={stroke}
          fill="none"
        />
        {rate !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.ring}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        )}
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-base font-bold ${colors.text}`}
      >
        {rate === null ? "-" : `${rate}`}
        {rate !== null && <span className="ml-0.5 text-[10px] font-semibold">%</span>}
      </span>
    </span>
  );
}

export interface RateBadgeStat {
  rate: number | null;
  label: string;
  detail?: string;
}

interface Props {
  title: string;
  description: string;
  icon: LucideIcon;
  tone: RateBadgeTone;
  stats: RateBadgeStat[];
  controls?: React.ReactNode;
}

export default function RateBadge({
  title,
  description,
  icon: Icon,
  tone,
  stats,
  controls,
}: Props) {
  const colors = TONE_CLASSES[tone];
  return (
    <div
      title={description}
      className={`shadow-card flex w-full flex-col gap-3 rounded-xl border bg-gradient-to-br px-6 py-5 ${colors.border} ${colors.bg}`}
    >
      <div className="flex items-center gap-5">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-full ${colors.icon}`}
        >
          <Icon className="size-5" />
        </span>
        <span className={`block shrink-0 text-sm font-semibold ${colors.text}`}>{title}</span>
        <span className="ml-auto flex items-center gap-5">
          {stats.map((stat) => (
            <span key={stat.label} className="flex flex-col items-center gap-1">
              <RateRing rate={stat.rate} colors={colors} />
              <span className={`text-[11px] font-medium ${colors.sub}`}>
                {stat.label}
                {stat.detail ? ` · ${stat.detail}` : ""}
              </span>
            </span>
          ))}
        </span>
      </div>
      {controls && <div className="flex items-center justify-end">{controls}</div>}
    </div>
  );
}
