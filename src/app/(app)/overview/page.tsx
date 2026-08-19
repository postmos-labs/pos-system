import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CircleDollarSign, Gift, PackageCheck, Search } from "lucide-react";
import PromotionManager from "./PromotionManager";
import { DatePickerField } from "@/components/ui/DatePickerField";
import { formatNumber } from "./formatters";

const FRONT_UNIT_PRICE = 220000; // 프론트 1대당 부가서비스 수수료

type SearchParams = Promise<{
  from?: string | string[] | undefined;
  to?: string | string[] | undefined;
}>;

type InstallationItem = {
  name: string;
  quantity: number;
};

type InstallationRow = {
  id: string;
  customer_name: string | null;
  created_at: string;
  items: unknown;
  status: string;
};

type SettlementPromotion = {
  id: string;
  name: string;
  unit_rate: number;
  achieved_count: number;
  start_date: string;
  end_date: string;
  memo: string | null;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isDateInput(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function getDefaultDateRange() {
  const to = todayInSeoul();
  return { from: `${to.slice(0, 8)}01`, to };
}

function nextDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const FRONT_ITEM_NAMES = new Set(["프론트", "토스프론트"]);

function frontQuantity(items: unknown) {
  if (!Array.isArray(items)) return 0;

  return (items as InstallationItem[]).reduce((total, item) => {
    if (!item || !FRONT_ITEM_NAMES.has(item.name) || typeof item.quantity !== "number")
      return total;
    return total + item.quantity;
  }, 0);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default async function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  const canManage = ["admin", "master", "cs"].includes(profile?.role ?? "");

  const defaults = getDefaultDateRange();
  const params = await searchParams;
  const requestedFrom = firstParam(params.from);
  const requestedTo = firstParam(params.to);
  const dateFrom = isDateInput(requestedFrom) ? requestedFrom : defaults.from;
  const dateTo = isDateInput(requestedTo) ? requestedTo : defaults.to;
  const rangeFrom = dateFrom <= dateTo ? dateFrom : defaults.from;
  const rangeTo = dateFrom <= dateTo ? dateTo : defaults.to;

  const [{ data: installationData }, { data: promotionData }] = await Promise.all([
    supabase
      .from("installations")
      .select("id, customer_name, created_at, items, status")
      .gte("created_at", `${rangeFrom}T00:00:00+09:00`)
      .lt("created_at", `${nextDate(rangeTo)}T00:00:00+09:00`)
      .order("created_at", { ascending: false }),
    supabase
      .from("settlement_promotions")
      .select("id, name, unit_rate, achieved_count, start_date, end_date, memo")
      .lte("start_date", rangeTo)
      .gte("end_date", rangeFrom)
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const installations = (installationData ?? []) as unknown as InstallationRow[];
  const rows = installations
    .map((installation) => ({
      ...installation,
      frontQuantity: frontQuantity(installation.items),
    }))
    .filter((installation) => installation.frontQuantity > 0);
  const totalQuantity = rows.reduce((total, row) => total + row.frontQuantity, 0);
  const amount = totalQuantity * FRONT_UNIT_PRICE;
  const promotions = ((promotionData ?? []) as unknown as SettlementPromotion[]).map(
    (promotion) => ({
      ...promotion,
      amount: promotion.unit_rate * promotion.achieved_count,
    }),
  );
  const promotionAmount = promotions.reduce((total, promotion) => total + promotion.amount, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">공통 대시보드</h1>
        <p className="mt-1 text-sm text-slate-500">
          프론트 출고 수량과 정산 예상 금액을 확인합니다.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <label className="flex min-w-[170px] flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700">
          시작일
          <DatePickerField
            name="from"
            defaultValue={rangeFrom}
            ariaLabel="시작일"
            className="h-10 w-full"
          />
        </label>
        <span className="pb-2 text-slate-400">~</span>
        <label className="flex min-w-[170px] flex-1 flex-col gap-1.5 text-sm font-medium text-slate-700">
          종료일
          <DatePickerField
            name="to"
            defaultValue={rangeTo}
            ariaLabel="종료일"
            className="h-10 w-full"
          />
        </label>
        <button
          type="submit"
          className="flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Search className="size-4" /> 조회
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <PackageCheck className="size-5 text-blue-600" />
            프론트 출고 수량
          </div>
          <p className="text-4xl font-bold text-slate-900">{formatNumber(totalQuantity)}</p>
          <p className="mt-1 text-sm text-slate-500">선택 기간 내 설치건 기준</p>
        </section>

        <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <CircleDollarSign className="size-5 text-emerald-600" />
            부가서비스 수수료 예상 금액
          </div>
          <p className="text-4xl font-bold text-emerald-700">{formatNumber(amount)}원</p>
          <p className="mt-1 text-sm text-slate-500">
            프론트 {formatNumber(totalQuantity)}대 × {formatNumber(FRONT_UNIT_PRICE)}원
          </p>
        </section>

        <section className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <Gift className="size-5 text-amber-600" />
            프로모션 보상금액
          </div>
          <p className="text-4xl font-bold text-amber-700">{formatNumber(promotionAmount)}원</p>
          <p className="mt-1 text-sm text-slate-500">
            겹치는 프로모션 {formatNumber(promotions.length)}건
          </p>
        </section>
      </div>

      <PromotionManager promotions={promotions} canManage={canManage} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="font-bold text-slate-900">프론트 포함 설치건</h2>
          <p className="mt-1 text-xs text-slate-500">
            {rangeFrom} ~ {rangeTo} · 총 {formatNumber(rows.length)}건
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-6 py-3">거래처명</th>
                <th className="px-6 py-3">접수일</th>
                <th className="px-6 py-3 text-right">프론트 수량</th>
                <th className="px-6 py-3">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-slate-400">
                    해당 기간에 프론트가 포함된 설치건이 없습니다.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {row.customer_name || "거래처명 미입력"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-slate-500">
                    {formatDateTime(row.created_at)}
                  </td>
                  <td className="px-6 py-3 text-right font-semibold text-slate-900">
                    {formatNumber(row.frontQuantity)}
                  </td>
                  <td className="px-6 py-3 text-slate-600">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
