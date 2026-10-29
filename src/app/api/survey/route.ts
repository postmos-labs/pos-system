import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SURVEY_ITEMS, SURVEY_ITEM_KEYS, isSurveyItemKey, type SurveyItemKey } from "@/lib/survey";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatPhone } from "@/lib/format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body?.token === "string" ? body.token : "";
    if (!UUID_RE.test(token)) {
      return NextResponse.json({ ok: false, error: "유효하지 않은 링크입니다." }, { status: 400 });
    }
    const picks: SurveyItemKey[] = Array.isArray(body.picks)
      ? Array.from(new Set((body.picks as unknown[]).filter(isSurveyItemKey)))
      : [];
    if (!picks.length) {
      return NextResponse.json(
        { ok: false, error: "항목을 하나 이상 골라 주세요." },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("franchise_surveys")
      .update({ picks, submitted_at: nowIso, updated_at: nowIso })
      .eq("token", token)
      .not("sent_at", "is", null)
      .is("submitted_at", null)
      .gt("expires_at", nowIso)
      .select("id, franchise_application_id");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    if (!updated || updated.length === 0) {
      const { data: cur } = await supabase
        .from("franchise_surveys")
        .select("submitted_at, expires_at")
        .eq("token", token)
        .maybeSingle();
      if (!cur) {
        return NextResponse.json(
          { ok: false, error: "유효하지 않은 링크입니다." },
          { status: 404 },
        );
      }
      if (cur.submitted_at) {
        return NextResponse.json({ ok: false, error: "이미 응답하셨습니다." }, { status: 409 });
      }
      if (cur.expires_at && new Date(cur.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ ok: false, error: "참여 기한이 지났습니다." }, { status: 410 });
      }
      return NextResponse.json({ ok: false, error: "유효하지 않은 링크입니다." }, { status: 404 });
    }

    const survey = updated[0];
    const { data: app } = await supabase
      .from("franchise_applications")
      .select("business_name, owner_name, phone")
      .eq("id", survey.franchise_application_id)
      .maybeSingle();

    // 단체방 공지라 영업 연락에 필요한 것만 짧게 보낸다. 관심상품은 항목 정의 순서로 고정한다.
    const interests = SURVEY_ITEM_KEYS.filter((k) => picks.includes(k)).map(
      (k) => SURVEY_ITEMS[k].short,
    );
    const text = [
      "📋 리서치 응답",
      `가맹점명: ${app?.business_name || app?.owner_name || "-"}`,
      `번호: ${app?.phone ? formatPhone(app.phone) : "-"}`,
      `관심상품: ${interests.join(" ")}`,
    ].join("\n");

    // Vercel은 응답 후 작업을 끊으므로 await 한다. 실패해도 던지지 않는다.
    await sendTelegramMessage(text);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
