import { NextRequest, NextResponse } from "next/server";
import { sendSignRequest, sendSignComplete } from "@/lib/solapi";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

// 이 주소는 실제로 문자·알림톡을 발송한다(건당 비용 발생 + 회사 발신번호 사용).
// 그래서 수신번호를 요청 본문에서 받지 않고, 항상 DB에 저장된 계약서 값으로 보낸다.
// 부르는 곳이 둘이고 성격이 달라 확인 방식도 갈린다.
//   sign_request  — 직원이 계약서 화면에서 보낸다        → 로그인 확인
//   sign_complete — 고객이 서명 링크에서 서명 직후 보낸다 → 로그인이 없으므로 서명 토큰 확인
export async function POST(req: NextRequest) {
  let contractId: string | undefined;
  let type: string | undefined;
  try {
    const body = await req.json();
    type = typeof body.type === "string" ? body.type : undefined;
    const admin = createAdminClient();

    if (type === "sign_request") {
      const authClient = await createServerClient();
      const {
        data: { user },
      } = await authClient.auth.getUser();
      if (!user) {
        return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
      }

      contractId = typeof body.contractId === "string" ? body.contractId : undefined;
      if (!contractId) {
        return NextResponse.json({ ok: false, error: "contractId가 필요합니다." }, { status: 400 });
      }
      const { data: contract } = await admin
        .from("contracts")
        .select("id, title, signer_name, signer_phone, sign_token, signature_zones")
        .eq("id", contractId)
        .single();
      if (!contract) {
        return NextResponse.json(
          { ok: false, error: "계약서를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      if (!contract.signature_zones || contract.signature_zones.length === 0) {
        return NextResponse.json(
          { ok: false, error: "서명 위치가 지정되지 않은 계약서입니다." },
          { status: 400 },
        );
      }
      await sendSignRequest({
        signerPhone: contract.signer_phone ?? "",
        signerName: contract.signer_name,
        contractTitle: contract.title,
        signToken: contract.sign_token,
      });
    } else if (type === "sign_complete") {
      // 고객은 로그인하지 않는다. 대신 서명 링크의 토큰을 확인해
      // "그 링크로 실제 서명을 마친 건"에만 발송한다.
      const signToken = typeof body.signToken === "string" ? body.signToken : "";
      if (!signToken) {
        return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
      }
      const { data: contract } = await admin
        .from("contracts")
        .select("id, title, signer_name, signer_phone, status")
        .eq("sign_token", signToken)
        .single();
      if (!contract) {
        return NextResponse.json(
          { ok: false, error: "유효하지 않은 서명 링크입니다." },
          { status: 404 },
        );
      }
      if (contract.status !== "signed") {
        return NextResponse.json(
          { ok: false, error: "아직 서명이 완료되지 않았습니다." },
          { status: 400 },
        );
      }
      contractId = contract.id;
      await sendSignComplete({
        signerPhone: contract.signer_phone ?? "",
        signerName: contract.signer_name,
        contractTitle: contract.title,
      });
    } else {
      return NextResponse.json({ ok: false, error: "unknown type" }, { status: 400 });
    }

    if (contractId) {
      await admin.from("notification_logs").insert({
        entity_type: "contract",
        entity_id: contractId,
        template_key: type,
        status: "sent",
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("notify error:", e);
    if (contractId) {
      await createAdminClient().from("notification_logs").insert({
        entity_type: "contract",
        entity_id: contractId,
        template_key: type,
        status: "failed",
        error: e.message,
      });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
