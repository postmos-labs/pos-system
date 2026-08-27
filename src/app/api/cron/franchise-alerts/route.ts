import { createAdminClient } from "@/lib/supabase/admin";
import type { FranchiseStatus } from "@/types";

export const dynamic = "force-dynamic";

interface FranchiseAlertRow {
  id: string;
  business_name: string | null;
  owner_name: string | null;
  open_date: string | null;
  status: FranchiseStatus;
  updated_at: string;
  cs_id: string | null;
  sales_id: string | null;
}

const ALERT_COLUMNS =
  "id, business_name, owner_name, open_date, status, updated_at, cs_id, sales_id";

// "장기 미처리" 대상에서 뺄 상태. 이미 끝났거나(완료·카드가맹완료·인터넷완료)
// 의도적으로 멈춰둔 건(보류·지속적 부재·취소)에 "7일째 진척 없음" 알림을 보내면
// 매일 같은 알림이 쌓이기만 한다.
const NOT_STALE_STATUSES: FranchiseStatus[] = [
  "card_done",
  "internet_done",
  "completed",
  "canceled",
  "hold",
  "persistent_absence",
];

function kstDate(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(Date.now() + offsetDays * 86400000),
  );
}

function getKstToday() {
  return kstDate(0);
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const supabase = createAdminClient();
    const today = getKstToday();

    // 전체를 다 가져오면 Supabase의 1000행 상한에 걸려 그 뒤 건은 조용히 빠진다.
    // 필요한 건만 DB에서 걸러 온다.
    const ddayTargets = [7, 3, 1].map((days) => kstDate(days));
    const staleBefore = new Date(Date.now() - 7 * 86400000).toISOString();

    const [ddayResult, staleResult] = await Promise.all([
      supabase.from("franchise_applications").select(ALERT_COLUMNS).in("open_date", ddayTargets),
      supabase
        .from("franchise_applications")
        .select(ALERT_COLUMNS)
        .lt("updated_at", staleBefore)
        .not("status", "in", `(${NOT_STALE_STATUSES.join(",")})`),
    ]);
    if (ddayResult.error || staleResult.error) {
      return Response.json({
        ok: false,
        error: ddayResult.error?.message ?? staleResult.error?.message,
      });
    }
    const ddayApplications = (ddayResult.data ?? []) as FranchiseAlertRow[];
    const staleApplications = (staleResult.data ?? []) as FranchiseAlertRow[];

    let ddayCount = 0;
    let staleCount = 0;

    // 오픈 D-day 알림 (D-7 / D-3 / D-1)
    for (const days of [7, 3, 1]) {
      const templateKey = `franchise_dday_${days}_${today}`;
      const target = kstDate(days);
      const matched = ddayApplications.filter((r) => r.open_date === target);
      if (matched.length === 0) continue;

      const byUser = new Map<string, FranchiseAlertRow[]>();
      for (const r of matched) {
        const recipients = new Set<string>();
        if (r.cs_id) recipients.add(r.cs_id);
        if (r.sales_id) recipients.add(r.sales_id);
        for (const userId of recipients) {
          const list = byUser.get(userId) ?? [];
          list.push(r);
          byUser.set(userId, list);
        }
      }

      for (const [userId, userRows] of byUser) {
        try {
          const { data: already } = await supabase
            .from("notification_logs")
            .select("id")
            .eq("entity_type", "franchise_dday_notify")
            .eq("entity_id", userId)
            .eq("template_key", templateKey)
            .limit(1)
            .maybeSingle();
          if (already) continue;

          const names = userRows.map((r) => r.business_name || r.owner_name || "미입력").join(", ");
          const { error } = await supabase.from("notifications").insert({
            user_id: userId,
            type: "open_date_soon",
            title: `오픈 D-${days} 알림 ${userRows.length}건`,
            body: `${names} — ${days}일 후 오픈 예정입니다. 준비 상태를 확인해주세요.`,
          });
          if (error) {
            console.error("D-day 알림 생성 실패:", error.message);
            continue;
          }
          await supabase.from("notification_logs").insert({
            entity_type: "franchise_dday_notify",
            entity_id: userId,
            template_key: templateKey,
            user_id: userId,
          });
          ddayCount++;
        } catch (err) {
          console.error("D-day 알림 처리 실패:", err);
        }
      }
    }

    // 장기 미처리 알림 (7일 이상 상태 변화 없음)
    {
      const templateKey = `franchise_stale_${today}`;
      // 상태·기간 조건은 이미 DB 쿼리에서 걸렀다.
      const staleRows = staleApplications;

      const byUser = new Map<string, FranchiseAlertRow[]>();
      for (const r of staleRows) {
        const recipients = new Set<string>();
        if (r.cs_id) recipients.add(r.cs_id);
        if (r.sales_id) recipients.add(r.sales_id);
        for (const userId of recipients) {
          const list = byUser.get(userId) ?? [];
          list.push(r);
          byUser.set(userId, list);
        }
      }

      for (const [userId, userRows] of byUser) {
        try {
          const { data: already } = await supabase
            .from("notification_logs")
            .select("id")
            .eq("entity_type", "franchise_stale_notify")
            .eq("entity_id", userId)
            .eq("template_key", templateKey)
            .limit(1)
            .maybeSingle();
          if (already) continue;

          const names = userRows
            .slice(0, 3)
            .map((r) => r.business_name || r.owner_name || "미입력")
            .join(", ");
          const { error } = await supabase.from("notifications").insert({
            user_id: userId,
            type: "stale_franchise",
            title: `장기 미처리 건 ${userRows.length}개`,
            body:
              names +
              (userRows.length > 3 ? ` 외 ${userRows.length - 3}건` : "") +
              " — 7일 이상 상태 변화가 없습니다.",
          });
          if (error) {
            console.error("장기 미처리 알림 생성 실패:", error.message);
            continue;
          }
          await supabase.from("notification_logs").insert({
            entity_type: "franchise_stale_notify",
            entity_id: userId,
            template_key: templateKey,
            user_id: userId,
          });
          staleCount++;
        } catch (err) {
          console.error("장기 미처리 알림 처리 실패:", err);
        }
      }
    }

    return Response.json({ ok: true, dday: ddayCount, stale: staleCount });
  } catch (err) {
    console.error("franchise-alerts cron 실패:", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
