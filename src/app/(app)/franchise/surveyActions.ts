"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireAdminOrCs } from "@/lib/auth/require-admin";
import { sendFranchiseSurvey, isSurveyTemplateConfigured } from "@/lib/solapi";
import { SURVEY_VALID_DAYS, type FranchiseSurvey } from "@/lib/survey";

export async function getFranchiseSurvey(
  franchiseId: string,
): Promise<{ survey: FranchiseSurvey | null; unavailable: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { survey: null, unavailable: false };

  const { data, error } = await supabase
    .from("franchise_surveys")
    .select("*")
    .eq("franchise_application_id", franchiseId)
    .maybeSingle();
  if (error) return { survey: null, unavailable: true };
  return { survey: (data as FranchiseSurvey | null) ?? null, unavailable: false };
}

export async function sendFranchiseSurveyAction(
  franchiseId: string,
): Promise<{ error: string | null; survey?: FranchiseSurvey }> {
  const authError = await requireAdminOrCs();
  if (authError) return { error: authError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  const senderName: string | null = profile?.name ?? null;

  if (!isSurveyTemplateConfigured()) {
    return {
      error:
        "리서치 알림톡 템플릿이 아직 설정되지 않았습니다. (SOLAPI_KAKAO_TEMPLATE_FRANCHISE_SURVEY)",
    };
  }

  const admin = createAdminClient();
  const { data: franchise, error: franchiseError } = await admin
    .from("franchise_applications")
    .select("phone, owner_name, business_name")
    .eq("id", franchiseId)
    .maybeSingle();
  if (franchiseError || !franchise) return { error: "가맹점을 찾을 수 없습니다." };

  const phone = String(franchise.phone ?? "").replace(/\D/g, "");
  if (!phone) return { error: "연락처가 없습니다." };

  const { data: existing, error: existingError } = await admin
    .from("franchise_surveys")
    .select("*")
    .eq("franchise_application_id", franchiseId)
    .maybeSingle();
  if (existingError) return { error: "리서치 DB가 준비되지 않았습니다. (157 마이그레이션)" };
  if (existing?.submitted_at) return { error: "이미 응답한 가맹점입니다." };

  let current = existing as FranchiseSurvey | null;
  if (!current) {
    const { data: inserted, error: insertError } = await admin
      .from("franchise_surveys")
      .insert({ franchise_application_id: franchiseId })
      .select("*")
      .single();
    if (insertError || !inserted) return { error: insertError?.message ?? "저장에 실패했습니다." };
    current = inserted as FranchiseSurvey;
  }

  const expiresAt = new Date(Date.now() + SURVEY_VALID_DAYS * 24 * 60 * 60 * 1000);

  try {
    await sendFranchiseSurvey({
      phone,
      ownerName: franchise.owner_name ?? "",
      businessName: franchise.business_name ?? "",
      token: current.token,
      expiresAt,
    });
  } catch (error) {
    const e = error as {
      message?: string;
      failedMessageList?: Record<string, unknown>[];
      response?: { data?: { failedMessageList?: Record<string, unknown>[] } };
      data?: { failedMessageList?: Record<string, unknown>[] };
    };
    const failed =
      e?.failedMessageList ?? e?.response?.data?.failedMessageList ?? e?.data?.failedMessageList;
    if (failed?.length) {
      const firstErr = failed[0];
      return {
        error: String(
          firstErr?.resultMessage ??
            firstErr?.reason ??
            firstErr?.statusMessage ??
            JSON.stringify(firstErr),
        ),
      };
    }
    return { error: e?.message ?? String(error) };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("franchise_surveys")
    .update({
      sent_at: now,
      sent_by: user.id,
      sent_by_name: senderName,
      send_count: (current.send_count ?? 0) + 1,
      expires_at: expiresAt.toISOString(),
      updated_at: now,
    })
    .eq("id", current.id)
    .select("*")
    .single();
  if (updateError || !updated) return { error: updateError?.message ?? "저장에 실패했습니다." };

  return { error: null, survey: updated as FranchiseSurvey };
}

export async function markSurveyContacted(
  surveyId: string,
  contacted: boolean,
): Promise<{ error: string | null }> {
  const authError = await requireAdminOrCs();
  if (authError) return { error: authError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin
    .from("franchise_surveys")
    .update({
      contacted_at: contacted ? now : null,
      contacted_by_name: contacted ? (profile?.name ?? null) : null,
      updated_at: now,
    })
    .eq("id", surveyId);
  return { error: error?.message ?? null };
}
