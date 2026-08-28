import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = typeof body.token === "string" ? body.token : "";
    const equipment = Array.isArray(body.equipment)
      ? body.equipment.filter((v: unknown) => typeof v === "string")
      : [];
    if (!token || !equipment.length) {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: updated, error } = await supabase
      .from("franchise_applications")
      .update({ selected_equipment: equipment, equipment_selected_at: new Date().toISOString() })
      .eq("equipment_select_token", token)
      .select("id");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    // 매칭 0행이면 저장된 게 없다 — 성공으로 응답하면 고객이 제출됐다고 믿게 된다.
    if (!updated || updated.length === 0) {
      return NextResponse.json({ ok: false, error: "유효하지 않은 링크입니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
