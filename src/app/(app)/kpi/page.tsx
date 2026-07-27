import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addKpiResult,
  buildKpiScoreDetails,
  businessHoursBetween,
  type KpiMetrics,
  type KpiProfile,
  type KpiScore,
} from "@/lib/kpi";
import MasterKpiList from "./MasterKpiList";

const MONTHLY_PROCESSING_TARGET = 10;

function scoreTone(score: number) {
  if (score >= 90) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 80) return "border-blue-200 bg-blue-50 text-blue-700";
  if (score >= 70) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function countWeekdays(year: number, month: number, lastDay: number) {
  let count = 0;
  for (let day = 1; day <= lastDay; day += 1) {
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

function currentKpiPeriod() {
  const nowValue = Date.now();
  const now = new Date(nowValue + 9 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const elapsedWeekdays = countWeekdays(year, month, day);
  const totalWeekdays = countWeekdays(year, month, lastDay);

  return {
    monthStart: new Date(Date.UTC(year, month, 1) - 9 * 60 * 60 * 1000).toISOString(),
    today: now.toISOString().slice(0, 10),
    staleBefore: new Date(nowValue - 3 * 24 * 60 * 60 * 1000).toISOString(),
    periodTarget: Math.max(
      1,
      Math.ceil((MONTHLY_PROCESSING_TARGET * elapsedWeekdays) / totalWeekdays),
    ),
  };
}

function relatedCreatedAt(relation: unknown) {
  const row = Array.isArray(relation) ? relation[0] : relation;
  if (!row || typeof row !== "object" || !("created_at" in row)) return null;
  return typeof row.created_at === "string" ? row.created_at : null;
}

export default async function KpiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id,name,role,approval_role")
    .eq("id", user.id)
    .single();
  if (!currentProfile) redirect("/dashboard");

  const { monthStart, today, staleBefore, periodTarget } = currentKpiPeriod();
  const [
    { data: profiles },
    { data: transferApprovals },
    { data: installationApprovals },
    { data: staleFranchise },
    { data: trackedInstalls },
  ] = await Promise.all([
    supabase.from("profiles").select("id,name,role,team,approval_role"),
    supabase
      .from("franchise_transfer_approvals")
      .select(
        "requested_by,requested_at,cs_approved_by,cs_approved_at,status,franchise_applications(created_at)",
      )
      .gte("requested_at", monthStart),
    supabase
      .from("installation_completion_approvals")
      .select(
        "requested_by,requested_at,responsible_approved_by,responsible_approved_at,status,installations(created_at)",
      )
      .gte("requested_at", monthStart),
    supabase
      .from("franchise_applications")
      .select("cs_id")
      .is("deleted_at", null)
      .not("cs_id", "is", null)
      .not("status", "in", "(card_done,internet_done,toss_review_done,completed)")
      .lt("updated_at", staleBefore),
    supabase
      .from("installations")
      .select("assigned_to,status,scheduled_date,updated_at")
      .not("assigned_to", "is", null)
      .or(`updated_at.gte.${monthStart},scheduled_date.lt.${today}`),
  ]);

  const metrics = new Map<string, KpiMetrics>();
  for (const approval of transferApprovals ?? []) {
    const receivedAt = relatedCreatedAt(approval.franchise_applications);
    addKpiResult(metrics, approval.requested_by, {
      onTime: receivedAt !== null && businessHoursBetween(receivedAt, approval.requested_at) <= 27,
      successful: approval.status === "approved",
    });
    if (approval.cs_approved_by && approval.cs_approved_at) {
      addKpiResult(metrics, approval.cs_approved_by, {
        onTime: businessHoursBetween(approval.requested_at, approval.cs_approved_at) <= 4,
        successful: approval.status !== "rejected",
      });
    }
  }
  for (const approval of installationApprovals ?? []) {
    const receivedAt = relatedCreatedAt(approval.installations);
    addKpiResult(metrics, approval.requested_by, {
      onTime: receivedAt !== null && businessHoursBetween(receivedAt, approval.requested_at) <= 9,
      successful: approval.status === "approved",
    });
    if (approval.responsible_approved_by && approval.responsible_approved_at) {
      addKpiResult(metrics, approval.responsible_approved_by, {
        onTime: businessHoursBetween(approval.requested_at, approval.responsible_approved_at) <= 4,
        successful: approval.status !== "rejected",
      });
    }
  }
  for (const receipt of staleFranchise ?? []) {
    addKpiResult(metrics, receipt.cs_id, { onTime: false, successful: false });
  }
  for (const installation of trackedInstalls ?? []) {
    const isCompleted = installation.status === "completed";
    const isRejected = installation.status === "rejected";
    const isOverdue =
      !isCompleted &&
      !isRejected &&
      installation.scheduled_date &&
      installation.scheduled_date < today;
    if (!isCompleted && !isRejected && !isOverdue) continue;

    const finishedOnTime =
      isCompleted &&
      (!installation.scheduled_date ||
        installation.updated_at.slice(0, 10) <= installation.scheduled_date);
    addKpiResult(metrics, installation.assigned_to, {
      onTime: finishedOnTime,
      successful: isCompleted,
    });
  }

  const scoreDetails = buildKpiScoreDetails(
    (profiles ?? []) as KpiProfile[],
    metrics,
    periodTarget,
  );
  const myScore = scoreDetails.find((score) => score.userId === user.id);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">KPI</h1>
        <p className="mt-1 text-sm text-slate-500">이번 달 개인 KPI 점수입니다.</p>
      </div>

      {currentProfile.role !== "master" ? (
        myScore ? (
          <PersonalScore score={myScore} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            현재 계정은 KPI 집계 대상이 아닙니다.
          </div>
        )
      ) : (
        <MasterKpiList scores={scoreDetails} />
      )}
    </main>
  );
}

function PersonalScore({ score }: { score: KpiScore }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-medium text-slate-500">{score.name}</p>
      <p className="mt-1 text-xs text-slate-400">{score.roleLabel}</p>
      <div
        className={`mx-auto mt-6 flex size-40 items-center justify-center rounded-full border-8 text-4xl font-bold ${scoreTone(score.score)}`}
      >
        {score.score}점
      </div>
    </section>
  );
}
