import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// 이름이 없는지 비밀번호가 틀렸는지는 구분해 알려 주지 않는다 — 있는 이름을 알아내는 데 쓰이지 않도록.
const LOGIN_FAILED = "이름 또는 비밀번호가 올바르지 않습니다.";

// 서버·DB가 시드니에 있어 한국에서 한 번 오갈 때마다 150ms 안팎이 든다.
// 예전엔 ① 여기서 이름으로 이메일만 찾아 주고 ② 브라우저가 DB 인증 서버로 직접 로그인한 뒤 ③ "/"로 갔다가
// 대시보드로 다시 넘어가고 ④ 새로고침으로 대시보드를 한 번 더 그렸다. 이제 ①②를 여기서 한 번에 끝내고
// 로그인 쿠키를 이 응답에 실어 보내며, 첫 화면 주소도 같이 돌려줘 ③④를 없앤다.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || !password) {
    return NextResponse.json({ error: LOGIN_FAILED }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("name", name)
    .single();
  if (!profile) {
    return NextResponse.json({ error: LOGIN_FAILED }, { status: 400 });
  }

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profile.id);
  const email = userData.user?.email;
  if (!email) {
    return NextResponse.json({ error: LOGIN_FAILED }, { status: 400 });
  }

  // 서버 클라이언트(@supabase/ssr)로 로그인하면 세션 쿠키가 이 응답의 Set-Cookie로 나간다.
  // 브라우저 쪽 Supabase 클라이언트도 같은 쿠키를 읽으므로 따로 로그인할 필요가 없다.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) {
      return NextResponse.json(
        { error: "로그인 시도가 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: LOGIN_FAILED }, { status: 400 });
  }

  // "/"(src/app/page.tsx)가 하던 첫 화면 판단을 여기서 한다: 기사가 휴대폰으로 들어오면 기사 페이지, 나머지는 대시보드.
  const userAgent = req.headers.get("user-agent") ?? "";
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(userAgent);
  const home = profile.role === "tech" && isMobile ? "/installs/mine" : "/dashboard";

  return NextResponse.json({ ok: true, home });
}
