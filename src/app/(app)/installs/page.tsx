import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import InstallsClient from "./InstallsClient";
import type { Profile } from "@/types";
import type { ApprovalNote } from "@/lib/approvalNotes";

interface Props {
  searchParams: Promise<{ id?: string }>;
}

export default async function InstallsPage({ searchParams }: Props) {
  const { id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: installs },
    { data: techUsers },
    { data: completionApprovals },
    { data: transferApprovals },
    { data: deliveryStatusRows },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("installations")
      .select(
        "*, assignee:profiles!installations_assigned_to_fkey(name), creator:profiles!installations_created_by_fkey(name)",
      )
      .neq("delivery_type", "delivery")
      .order("sort_order", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("profiles").select("id, name").eq("role", "tech"),
    supabase
      .from("installation_completion_approvals")
      .select(
        "installation_id,status,target_status,request_payload,requested_by,requested_by_name,responsible_approved_by_name,approved_by,approved_by_name,approval_notes,requested_at",
      )
      .order("requested_at", { ascending: true }),
    supabase.from("franchise_transfer_approvals").select("franchise_application_id,approval_notes"),
    supabase.from("installations").select("status").eq("delivery_type", "delivery"),
  ]);

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
    />
  );
}
