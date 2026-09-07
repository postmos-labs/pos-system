"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inspectTicket, type QualityIssue } from "@/lib/resolutionQuality";

// 인입내역(tickets) 해결 절차 → 외부 LLM 정제 → 챗봇 학습 데이터(chatbot_training_data)
//
// service_role 키를 쓰므로 RLS가 걸리지 않는다. 로그인 여부를 여기서 직접 확인한다.
// 챗봇 데이터 화면 자체가 전 직원용이고 chatbot_training_data의 RLS도
// authenticated면 읽기/쓰기를 허용하므로, 권한 축을 새로 만들지 않고 같은 수준으로 맞춘다.

const CHUNK_SIZE = 100;

export interface ExportedTicket {
  id: string;
  inquiry: string;
  steps: string;
  category: string | null;
  repeat: boolean | null;
  occurred_on: string;
}

export interface CuratedRow {
  problem_situation: string;
  solution: string;
  source_ticket_ids: string[];
}

export interface TicketQuality {
  id: string;
  issues: QualityIssue[];
  /** 담당자(sales/cs/tech)가 한 명이라도 있는지 — 없으면 수정 요청을 보낼 대상이 없다 */
  hasAssignee: boolean;
  /** 이미 처리 대기 중인 수정 요청이 있는지 — 중복 발송을 막는다 */
  hasOpenRequest: boolean;
}

async function currentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("id", user.id)
    .single();
  return profile ?? null;
}

// 138번 마이그레이션(chatbot_exported_at / source_ticket_ids)이 아직 안 돌았을 때
// 해당 컬럼을 건드리면 42703이 난다. 화면이 죽지 않도록 컬럼 없음을 따로 구분한다.
function isMissingColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    /column .* does not exist/i.test(error.message ?? "") ||
    /Could not find the '.*' column/i.test(error.message ?? "")
  );
}

/** 에러 메시지에서 없는 컬럼 이름만 뽑아낸다 (NewTicketForm의 같은 처리와 동일한 규칙) */
function missingColumnName(error: { message?: string } | null): string | null {
  const message = error?.message ?? "";
  const match =
    message.match(/column "?([a-zA-Z_.]+)"? does not exist/i) ??
    message.match(/Could not find the '([^']+)' column/i);
  if (!match) return null;
  return match[1].split(".").pop() ?? null;
}

// 139번 마이그레이션(ticket_revision_requests) 미적용 감지. tickets/actions.ts의 같은 규칙을 그대로 둔다.
function isMissingRevisionTable(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /ticket_revision_requests|schema cache|relation .* does not exist/i.test(error.message ?? "")
  );
}

/**
 * 정제를 맡길 인입내역을 뽑는다.
 * 기본은 아직 안 내보낸 건만, includeExported면 해결 절차가 있는 건 전부.
 * 가맹점 상호·연락처는 담지 않는다 — 이 결과가 외부 LLM으로 나가기 때문이다.
 */
export async function fetchExportTargets(includeExported: boolean): Promise<{
  rows: ExportedTicket[];
  quality: TicketQuality[];
  /** 138번 마이그레이션 미적용 — "안 내보낸 것만" 필터가 동작하지 않은 경우 */
  exportColumnMissing: boolean;
  /** 139번 마이그레이션(ticket_revision_requests) 미적용 — 중복 요청 여부를 알 수 없는 경우 */
  revisionTableMissing: boolean;
  error: string | null;
}> {
  const profile = await currentProfile();
  if (!profile)
    return {
      rows: [],
      quality: [],
      exportColumnMissing: false,
      revisionTableMissing: false,
      error: "로그인이 필요합니다.",
    };

  const admin = createAdminClient();

  // 마이그레이션이 밀린 환경을 감안해, 없는 컬럼이 걸리면 그 조건만 빼고 다시 시도한다.
  // team(123) / issue_category(124) / chatbot_exported_at(138) / deleted_at 모두 대상이다.
  let selectColumns =
    "id, title, resolution_steps, issue_category, is_repeat, created_at, sales_id, cs_id, tech_id, merchant:merchants(business_name, owner_name)";
  let useTeam = true;
  let useDeleted = true;
  let useExported = !includeExported;
  let exportColumnMissing = false;

  let data: Record<string, unknown>[] | null = null;
  let error: { code?: string; message?: string } | null = null;

  for (let attempt = 0; attempt < 10; attempt++) {
    let query = admin
      .from("tickets")
      .select(selectColumns)
      .not("resolution_steps", "is", null)
      .neq("resolution_steps", "")
      .order("created_at", { ascending: true });
    if (useTeam) query = query.eq("team", "tech");
    if (useDeleted) query = query.is("deleted_at", null);
    if (useExported) query = query.is("chatbot_exported_at", null);

    const result = await query;
    data = result.data as Record<string, unknown>[] | null;
    error = result.error;
    if (!isMissingColumn(error)) break;

    const missing = missingColumnName(error);
    if (missing === "chatbot_exported_at" && useExported) {
      // 내보냄 표시를 못 쓰면 전체가 대상이 된다. 중복 판단은 화면에서 안내한다.
      useExported = false;
      exportColumnMissing = true;
      continue;
    }
    if (missing === "team" && useTeam) {
      useTeam = false;
      continue;
    }
    if (missing === "deleted_at" && useDeleted) {
      useDeleted = false;
      continue;
    }
    if (missing === "issue_category" && selectColumns.includes("issue_category")) {
      selectColumns = selectColumns.replace(", issue_category", "");
      continue;
    }
    if (missing === "sales_id" && selectColumns.includes("sales_id")) {
      selectColumns = selectColumns.replace(", sales_id", "");
      continue;
    }
    if (missing === "cs_id" && selectColumns.includes("cs_id")) {
      selectColumns = selectColumns.replace(", cs_id", "");
      continue;
    }
    if (missing === "tech_id" && selectColumns.includes("tech_id")) {
      selectColumns = selectColumns.replace(", tech_id", "");
      continue;
    }
    if (missing === "resolution_steps") {
      // 128번이 안 돌았으면 내보낼 원본 자체가 없다. 에러 코드 대신 이유를 알린다.
      return {
        rows: [],
        quality: [],
        exportColumnMissing,
        revisionTableMissing: false,
        error: "해결 절차 컬럼이 없습니다. 128번 마이그레이션을 먼저 적용해 주세요.",
      };
    }
    break;
  }

  if (error)
    return {
      rows: [],
      quality: [],
      exportColumnMissing,
      revisionTableMissing: false,
      error: error.message ?? "조회에 실패했습니다.",
    };

  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    inquiry: (row.title as string | null) ?? "",
    steps: (row.resolution_steps as string | null) ?? "",
    category: (row.issue_category as string | null) ?? null,
    repeat: (row.is_repeat as boolean | null) ?? null,
    occurred_on: String(row.created_at).slice(0, 10),
  }));

  const quality: TicketQuality[] = (data ?? []).map((row) => {
    const merchant = row.merchant as {
      business_name?: string | null;
      owner_name?: string | null;
    } | null;
    return {
      id: row.id as string,
      issues: inspectTicket({
        title: (row.title as string | null) ?? "",
        steps: (row.resolution_steps as string | null) ?? "",
        businessName: merchant?.business_name ?? null,
        ownerName: merchant?.owner_name ?? null,
      }),
      hasAssignee: !!(row.sales_id || row.cs_id || row.tech_id),
      hasOpenRequest: false,
    };
  });

  const flaggedIds = quality.filter((q) => q.issues.length > 0).map((q) => q.id);
  let revisionTableMissing = false;

  if (flaggedIds.length) {
    const openIds = new Set<string>();
    for (let i = 0; i < flaggedIds.length; i += CHUNK_SIZE) {
      const chunk = flaggedIds.slice(i, i + CHUNK_SIZE);
      const { data: openRows, error: openError } = await admin
        .from("ticket_revision_requests")
        .select("ticket_id")
        .eq("status", "open")
        .in("ticket_id", chunk);
      if (openError) {
        if (isMissingRevisionTable(openError)) {
          revisionTableMissing = true;
          break;
        }
        // 그 외 에러는 조용히 무시하고 hasOpenRequest를 false로 둔다.
        continue;
      }
      for (const row of openRows ?? []) {
        openIds.add(row.ticket_id as string);
      }
    }
    if (!revisionTableMissing) {
      for (const q of quality) {
        if (openIds.has(q.id)) q.hasOpenRequest = true;
      }
    }
  }

  return { rows, quality, exportColumnMissing, revisionTableMissing, error: null };
}

/**
 * 내보낸 티켓에 시각을 찍는다. 다음 배치에서 같은 건이 다시 나오지 않게 하는 표시.
 * 컬럼이 아직 없으면 실패로 보지 않고 미적용 사실만 알린다.
 */
export async function markTicketsExported(ids: string[]): Promise<{
  columnMissing: boolean;
  error: string | null;
}> {
  const profile = await currentProfile();
  if (!profile) return { columnMissing: false, error: "로그인이 필요합니다." };
  if (!ids.length) return { columnMissing: false, error: null };

  const admin = createAdminClient();
  const now = new Date().toISOString();

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const { error } = await admin
      .from("tickets")
      .update({ chatbot_exported_at: now })
      .in("id", chunk);
    if (isMissingColumn(error)) return { columnMissing: true, error: null };
    if (error) return { columnMissing: false, error: error.message };
  }

  return { columnMissing: false, error: null };
}

/**
 * 정제해서 돌려받은 문제상황/해결방법을 학습 데이터로 넣는다.
 * 등록자는 이 작업을 실행한 사람으로 남는다.
 */
export async function importCuratedRows(rows: CuratedRow[]): Promise<{
  inserted: Record<string, unknown>[];
  sourceColumnMissing: boolean;
  error: string | null;
}> {
  const profile = await currentProfile();
  if (!profile) return { inserted: [], sourceColumnMissing: false, error: "로그인이 필요합니다." };
  if (!rows.length) return { inserted: [], sourceColumnMissing: false, error: null };

  const admin = createAdminClient();
  let sourceColumnMissing = false;
  const inserted: Record<string, unknown>[] = [];

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const withSource = chunk.map((row) => ({
      problem_situation: row.problem_situation,
      solution: row.solution,
      source_ticket_ids: row.source_ticket_ids.length ? row.source_ticket_ids : null,
      registered_by: profile.id,
      registrant_name: profile.name,
    }));

    let { data, error } = await admin.from("chatbot_training_data").insert(withSource).select("*");

    // 출처 컬럼이 아직 없으면 그것만 빼고 넣는다. 학습 데이터 자체는 들어가야 한다.
    if (isMissingColumn(error)) {
      sourceColumnMissing = true;
      const withoutSource = withSource.map((row) => {
        const copy = { ...row } as Record<string, unknown>;
        delete copy.source_ticket_ids;
        return copy;
      });
      ({ data, error } = await admin
        .from("chatbot_training_data")
        .insert(withoutSource)
        .select("*"));
    }

    if (error) return { inserted, sourceColumnMissing, error: error.message };
    inserted.push(...(data ?? []));
  }

  return { inserted, sourceColumnMissing, error: null };
}
