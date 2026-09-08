import { NextRequest, NextResponse } from "next/server";
import { sendFranchiseDocRequest, sendFranchiseStatusUpdate } from "@/lib/solapi";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const authClient = await createServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    const { type, ownerName, businessName, applicantType, status, docCase, equipmentSelectToken } =
      body;
    const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";

    let sent: boolean;
    if (type === "doc_request") {
      sent = await sendFranchiseDocRequest({
        phone,
        ownerName,
        businessName,
        applicantType,
        docCase,
      });
    } else if (type === "status_update") {
      sent = await sendFranchiseStatusUpdate({
        phone,
        ownerName,
        businessName,
        status,
        equipmentSelectToken,
      });
    } else {
      return NextResponse.json({ ok: false, error: "unknown type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, sent });
  } catch (e: any) {
    const failed =
      e?.failedMessageList ?? e?.response?.data?.failedMessageList ?? e?.data?.failedMessageList;
    console.error("[franchise/notify] raw error keys:", Object.getOwnPropertyNames(e));
    console.error("[franchise/notify] failedMessageList:", JSON.stringify(failed));
    if (failed?.length) {
      const firstErr = failed[0];
      const detail =
        firstErr?.resultMessage ??
        firstErr?.reason ??
        firstErr?.statusMessage ??
        JSON.stringify(firstErr);
      return NextResponse.json({ ok: false, error: detail }, { status: 500 });
    }
    const detail = e?.message ?? String(e);
    console.error("[franchise/notify] error:", detail);
    return NextResponse.json({ ok: false, error: detail }, { status: 500 });
  }
}
