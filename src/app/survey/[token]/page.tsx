import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { isSurveyExpired, isSurveyItemKey } from "@/lib/survey";
import SurveyClient from "./SurveyClient";

interface Props {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ item?: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SurveyPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { item } = await searchParams;

  // UUID가 아니면 DB 캐스팅 에러가 나므로 먼저 걸러낸다.
  if (!UUID_RE.test(token)) notFound();

  const supabase = createAdminClient();
  const { data: row, error } = await supabase
    .from("franchise_surveys")
    .select(
      "id, token, sent_at, expires_at, opened_at, picks, submitted_at, franchise_application:franchise_applications(business_name, owner_name)",
    )
    .eq("token", token)
    .maybeSingle();

  // 테이블이 아직 없는 경우도 error로 들어오므로 404 처리한다.
  if (error || !row || !row.sent_at) notFound();

  const expired = isSurveyExpired(row);
  const submitted = !!row.submitted_at;
  const entryItem = isSurveyItemKey(item) ? item : null;

  if (!submitted && !expired && !row.opened_at) {
    const now = new Date().toISOString();
    await supabase
      .from("franchise_surveys")
      .update({ opened_at: now, entry_item: entryItem, updated_at: now })
      .eq("token", token)
      .is("opened_at", null);
  }

  const fa = row.franchise_application as unknown as
    | { business_name: string | null; owner_name: string | null }
    | { business_name: string | null; owner_name: string | null }[]
    | null;
  const app = Array.isArray(fa) ? fa[0] : fa;

  return (
    <SurveyClient
      token={token}
      businessName={app?.business_name ?? ""}
      ownerName={app?.owner_name ?? ""}
      initialItem={entryItem}
      submittedPicks={
        submitted ? ((row.picks as string[] | null) ?? []).filter(isSurveyItemKey) : null
      }
      expired={expired}
      expiresAt={row.expires_at}
    />
  );
}
