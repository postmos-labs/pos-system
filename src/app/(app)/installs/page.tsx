import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InstallsClient from "./InstallsClient";
import type { Profile, VanGroup } from "@/types";
import type { ApprovalNote } from "@/lib/approvalNotes";

interface Props {
  searchParams: Promise<{ id?: string; van?: string }>;
}

type VanFilter = VanGroup | "";

interface VanFilterable<T> {
  ilike(column: string, pattern: string): T;
  not(column: string, operator: string, value: unknown): T;
}

function applyVanFilter<T extends VanFilterable<T>>(query: T, van: VanFilter): T {
  if (van === "kicc") return query.ilike("franchise.van_company", "%KICC%");
  if (van === "toss") {
    return query
      .not("franchise.van_company", "is", null)
      .not("franchise.van_company", "ilike", "%KICC%");
  }
  return query;
}

export default async function InstallsPage({ searchParams }: Props) {
  const { id, van: vanParam } = await searchParams;
  const van: VanFilter = vanParam === "toss" || vanParam === "kicc" ? vanParam : "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const installsSelect = van
    ? "*, assignee:profiles!installations_assigned_to_fkey(name), creator:profiles!installations_created_by_fkey(name), franchise:franchise_applications!inner(van_company)"
    : "*, assignee:profiles!installations_assigned_to_fkey(name), creator:profiles!installations_created_by_fkey(name), franchise:franchise_applications(van_company)";

  const [
    { data: profile },
    { data: installs },
    { data: techUsers },
    { data: completionApprovals },
    { data: transferApprovals },
    { data: deliveryStatusRows },
    { count: allVanCount },
    { count: tossVanCount },
    { count: kiccVanCount },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    applyVanFilter(
      supabase
        .from("installations")
        .select(installsSelect)
        .neq("delivery_type", "delivery")
        .order("sort_order", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(300),
      van,
    ),
    supabase.from("profiles").select("id, name").eq("role", "tech"),
    supabase
      .from("installation_completion_approvals")
      .select(
        "installation_id,status,target_status,request_payload,requested_by,requested_by_name,responsible_approved_by_name,approved_by,approved_by_name,approval_notes,requested_at",
      )
      .order("requested_at", { ascending: true }),
    supabase.from("franchise_transfer_approvals").select("franchise_application_id,approval_notes"),
    supabase.from("installations").select("status").eq("delivery_type", "delivery"),
    supabase
      .from("installations")
      .select("id", { count: "exact", head: true })
      .neq("delivery_type", "delivery"),
    applyVanFilter(
      supabase
        .from("installations")
        .select("id, franchise:franchise_applications!inner(van_company)", {
          count: "exact",
          head: true,
        })
        .neq("delivery_type", "delivery"),
      "toss",
    ),
    applyVanFilter(
      supabase
        .from("installations")
        .select("id, franchise:franchise_applications!inner(van_company)", {
          count: "exact",
          head: true,
        })
        .neq("delivery_type", "delivery"),
      "kicc",
    ),
  ]);

  const vanCounts = {
    all: allVanCount ?? 0,
    toss: tossVanCount ?? 0,
    kicc: kiccVanCount ?? 0,
  };

  const initialDeliveryStats = {
    total: deliveryStatusRows?.length ?? 0,
    completed: (deliveryStatusRows ?? []).filter((row) => row.status === "completed").length,
  };

  if (!profile) redirect("/dashboard");

  const pendingApprovals = (completionApprovals ?? []).filter((approval) =>
    ["requested", "responsible_approved"].includes(approval.status),
  );
  const transferNotesByFranchise = Object.fromEntries(
    (transferApprovals ?? []).map((approval) => [
      approval.franchise_application_id,
      (approval.approval_notes ?? []) as ApprovalNote[],
    ]),
  );
  const approvalNoteHistory = (installs ?? []).reduce<Record<string, ApprovalNote[]>>(
    (history, installation) => {
      history[installation.id] =
        transferNotesByFranchise[installation.franchise_application_id ?? ""] ?? [];
      return history;
    },
    {},
  );
  for (const approval of completionApprovals ?? []) {
    historyPushUnique(
      approvalNoteHistory,
      approval.installation_id,
      (approval.approval_notes ?? []) as ApprovalNote[],
    );
  }

  function historyPushUnique(
    history: Record<string, ApprovalNote[]>,
    installationId: string,
    notes: ApprovalNote[],
  ) {
    const existing = history[installationId] ?? [];
    history[installationId] = [...existing, ...notes].filter(
      (note, index, allNotes) => allNotes.findIndex((item) => item.id === note.id) === index,
    );
  }

  return (
    <InstallsClient
      profile={profile as Profile}
      techUsers={techUsers ?? []}
      initialInstalls={(installs as any) ?? []}
      initialHighlightId={id}
      initialCompletionApprovals={Object.fromEntries(
        pendingApprovals.map((approval) => [approval.installation_id, approval]),
      )}
      initialApprovalNoteHistory={approvalNoteHistory}
      initialDeliveryStats={initialDeliveryStats}
      van={van}
      vanCounts={vanCounts}
    />
  );
}
