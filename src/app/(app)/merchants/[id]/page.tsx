import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowLeft } from "lucide-react";
import { loadMerchant360 } from "../loadMerchant360";
import MerchantMemoSection from "../MerchantMemoSection";
import MerchantHistorySection from "../MerchantHistorySection";
import {
  MERCHANT_OPERATION_STATUS_CLASS,
  MERCHANT_OPERATION_STATUS_LABEL,
  type MerchantOperationStatus,
} from "../merchant360";
import MerchantInfoCard from "./MerchantInfoCard";
import InstallInfoCard from "./InstallInfoCard";
import ContractCard from "./ContractCard";
import QuickActions from "./QuickActions";
import InstallCompositionSection from "./InstallCompositionSection";

interface Props {
  params: Promise<{ id: string }>;
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return format(date, "yyyy-MM-dd", { locale: ko });
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default async function MerchantUnifiedPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const {
    merchant,
    application,
    history,
    memos,
    equipment,
    equipmentCategorySummaries,
    derivedSummary,
  } = await loadMerchant360(supabase, id);

  if (!merchant) notFound();

  const operationStatus: MerchantOperationStatus = merchant.operation_status ?? "active";
  const contractMonths = derivedSummary?.contractMonths ?? null;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <Link
        href="/merchants"
        className="inline-flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft size={14} /> 가맹점 목록
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">{merchant.business_name}</h1>
          <span className="text-sm text-slate-400">
            사업자번호 {merchant.business_number || "-"} · 대표자 {merchant.owner_name || "-"}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${MERCHANT_OPERATION_STATUS_CLASS[operationStatus]}`}
          >
            {MERCHANT_OPERATION_STATUS_LABEL[operationStatus]}
          </span>
          {application?.program && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
              {application.program}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="최초 설치일"
            value={formatDateOnly(derivedSummary?.firstInstalledAt) ?? "-"}
          />
          <SummaryCard
            label="계약기간"
            value={contractMonths !== null ? `${contractMonths}개월` : "-"}
          />
          <SummaryCard label="설치 구성" value={`${derivedSummary?.totalEquipmentSets ?? 0}세트`} />
          <SummaryCard label="최근 A/S" value={formatDateOnly(derivedSummary?.lastAsAt) ?? "-"} />
        </div>
      </section>

      <InstallCompositionSection
        merchantId={merchant.id}
        equipment={equipment}
        categorySummaries={equipmentCategorySummaries}
        totalEquipmentSets={derivedSummary?.totalEquipmentSets ?? 0}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MerchantInfoCard merchant={merchant} programLabel={application?.program ?? null} />
        <InstallInfoCard
          merchant={merchant}
          derivedSummary={derivedSummary}
          caseType={application?.case_type ?? null}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ContractCard
          merchant={merchant}
          contractMonths={contractMonths}
          vanCompany={application?.van_company ?? null}
          internet={application?.internet ?? null}
        />
        <QuickActions franchiseApplicationId={merchant.franchise_application_id} />
      </div>

      <MerchantMemoSection merchantId={merchant.id} memos={memos} />
      <MerchantHistorySection history={history} />
    </div>
  );
}
