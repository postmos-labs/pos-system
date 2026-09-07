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

    // 설치건 오픈 D-5 / D-3 알림 (기술지원팀)
    //
    // 위의 가맹접수 D-day 알림은 CS·영업에게만 간다. 현장에 나가는 기술지원팀은
    // 오픈이 임박한 걸 따로 알 방법이 없어 준비가 늦어진다.
    //   D-5 가맹점 유선 통화 · 변경사항 확인
    //   D-3 미처리 사항 · 장비 · 일정 최종 점검
    let installDdayCount = 0;
    for (const days of [5, 3]) {
      const target = kstDate(days);
      const templateKey = `install_open_dday_${days}_${today}`;

      // 확정 오픈일이 있는 건과, 확정 전이라 가맹접수 예정일을 따르는 건을 따로 뽑는다.
      // installations.open_date는 141번 마이그레이션 전에는 없는 컬럼이라 실패할 수 있어,
      // 두 쿼리를 각각 처리하고 에러는 건너뛴다(알림이 빠질 뿐 cron 전체가 죽지 않는다).
      const [ownResult, inheritedResult] = await Promise.all([
        supabase
          .from("installations")
          .select("id, customer_name, assigned_to")
          .eq("open_date", target)
          .not("status", "in", "(completed,rejected)"),
        supabase
          .from("installations")
          .select(
            "id, customer_name, assigned_to, franchise:franchise_applications!inner(open_date)",
          )
          .is("open_date", null)
          .eq("franchise.open_date", target)
          .not("status", "in", "(completed,rejected)"),
      ]);

      const matched = new Map<
        string,
        { id: string; customer_name: string | null; assigned_to: string | null }
      >();
      for (const row of [...(ownResult.data ?? []), ...(inheritedResult.data ?? [])]) {
        const item = row as {
          id: string;
          customer_name: string | null;
          assigned_to: string | null;
        };
        if (!matched.has(item.id)) matched.set(item.id, item);
      }
      if (matched.size === 0) continue;

      // 담당기사 + 기술지원 팀장·실장. 담당기사가 비어 있어도 팀장은 알아야 배정을 챙긴다.
      const { data: techLeads } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "tech")
        .in("position", ["팀장", "실장"]);
      const leadIds = (techLeads ?? []).map((p) => p.id as string);

      const byUser = new Map<string, { id: string; customer_name: string | null }[]>();
      for (const item of matched.values()) {
        const recipients = new Set<string>(leadIds);
        if (item.assigned_to) recipients.add(item.assigned_to);
        for (const userId of recipients) {
          const list = byUser.get(userId) ?? [];
          list.push(item);
          byUser.set(userId, list);
        }
      }

      for (const [userId, userRows] of byUser) {
        try {
          const { data: already } = await supabase
            .from("notification_logs")
            .select("id")
            .eq("entity_type", "install_open_dday_notify")
            .eq("entity_id", userId)
            .eq("template_key", templateKey)
            .limit(1)
            .maybeSingle();
          if (already) continue;

          const names = userRows.map((r) => r.customer_name || "미입력").join(", ");
          const action =
            days === 5
              ? "가맹점 통화로 변경사항을 확인해주세요."
              : "미처리 사항·장비·일정을 최종 점검해주세요.";
          const { error } = await supabase.from("notifications").insert({
            user_id: userId,
            // 여러 건을 한 알림으로 묶으므로, 한 건일 때만 눌러서 바로 이동하게 한다.
            installation_id: userRows.length === 1 ? userRows[0].id : null,
            type: "install_open_soon",
            title: `오픈 D-${days} 설치건 ${userRows.length}건`,
            body: `${names} — ${days}일 후 오픈입니다. ${action}`,
          });
          if (error) {
            console.error("설치 오픈 D-day 알림 생성 실패:", error.message);
            continue;
          }
          await supabase.from("notification_logs").insert({
            entity_type: "install_open_dday_notify",
            entity_id: userId,
            template_key: templateKey,
            user_id: userId,
          });
          installDdayCount++;
        } catch (err) {
          console.error("설치 오픈 D-day 알림 처리 실패:", err);
        }
      }
    }

    return Response.json({
      ok: true,
      dday: ddayCount,
      stale: staleCount,
      installDday: installDdayCount,
    });
  } catch (err) {
    console.error("franchise-alerts cron 실패:", err);
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}
