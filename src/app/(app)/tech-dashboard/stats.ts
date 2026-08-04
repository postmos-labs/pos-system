import type { SupabaseClient } from "@supabase/supabase-js";

export type TechStats = {
  cards: {
    totalSchedule: number;
    totalInstall: number;
    totalAs: number;
    pendingInstall: number;
    completedInstall: number;
    completedAs: number;
    pendingTransfer: number;
  };
  installRate: number;
  asRate: number;
  weeklyBars: { label: string; install: number; as: number }[];
};

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildWeeks(dateFrom: string, dateTo: string) {
  const weeks: { start: string; end: string; label: string }[] = [];
  const cursor = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  let weekNo = 1;
  while (cursor <= end) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    weeks.push({ start: toYMD(cursor), end: toYMD(weekEnd), label: `${weekNo}주` });
    cursor.setDate(cursor.getDate() + 7);
    weekNo++;
  }
  return weeks;
}

export async function fetchTechStats(
  supabase: SupabaseClient,
  dateFrom: string,
  dateTo: string,
): Promise<TechStats> {
  const base = () => supabase.from("installations").select("id", { count: "exact", head: true });

  const [
    { count: totalInstallCount },
    { count: totalAsCount },
    { count: pendingInstallCount },
    { count: completedInstallCount },
    { count: completedAsCount },
    { count: pendingTransferCount },
    { data: weeklyRows },
  ] = await Promise.all([
    base()
      .eq("delivery_type", "install")
      .gte("scheduled_date", dateFrom)
      .lte("scheduled_date", dateTo),
    base().eq("delivery_type", "as").gte("scheduled_date", dateFrom).lte("scheduled_date", dateTo),
    base()
      .eq("delivery_type", "install")
      .not("status", "in", "(completed,rejected)")
      .gte("scheduled_date", dateFrom)
      .lte("scheduled_date", dateTo),
    base()
      .eq("delivery_type", "install")
      .eq("status", "completed")
      .gte("scheduled_date", dateFrom)
      .lte("scheduled_date", dateTo),
    base()
      .eq("delivery_type", "as")
      .eq("status", "completed")
      .gte("scheduled_date", dateFrom)
      .lte("scheduled_date", dateTo),
    supabase
      .from("franchise_transfer_approvals")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "cs_responsible_approved"]),
    supabase
      .from("installations")
      .select("id, delivery_type, scheduled_date, status")
      .in("delivery_type", ["install", "as"])
      .gte("scheduled_date", dateFrom)
      .lte("scheduled_date", dateTo),
  ]);

  const weeklyBars = buildWeeks(dateFrom, dateTo).map((w) => {
    const rowsInWeek = (weeklyRows ?? []).filter(
      (r) => r.scheduled_date && r.scheduled_date >= w.start && r.scheduled_date <= w.end,
    );
    return {
      label: w.label,
      install: rowsInWeek.filter((r) => r.delivery_type === "install").length,
      as: rowsInWeek.filter((r) => r.delivery_type === "as").length,
    };
  });

  const installRate =
    (totalInstallCount ?? 0) > 0
      ? Math.round(((completedInstallCount ?? 0) / (totalInstallCount ?? 1)) * 100)
      : 0;
  const asRate =
    (totalAsCount ?? 0) > 0 ? Math.round(((completedAsCount ?? 0) / (totalAsCount ?? 1)) * 100) : 0;

  return {
    cards: {
      totalSchedule: (totalInstallCount ?? 0) + (totalAsCount ?? 0),
      totalInstall: totalInstallCount ?? 0,
      totalAs: totalAsCount ?? 0,
      pendingInstall: pendingInstallCount ?? 0,
      completedInstall: completedInstallCount ?? 0,
      completedAs: completedAsCount ?? 0,
      pendingTransfer: pendingTransferCount ?? 0,
    },
    installRate,
    asRate,
    weeklyBars,
  };
}

export function monthRange(year: number, month1based: number) {
  const start = `${year}-${String(month1based).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month1based, 0).getDate();
  const end = `${year}-${String(month1based).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
