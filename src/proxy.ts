import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const TIMED_OUT = Symbol("auth-check-timed-out");
  const authCheck = await Promise.race([
    supabase.auth.getUser().then((res) => res.data.user),
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), 5000)),
  ]);

  // Supabase Auth 응답 지연으로 proxy가 수십 초씩 멈추는 장애 대응:
  // 타임아웃 시 로그인으로 막지 않고 통과시킨다. 실제 데이터 접근은 RLS가 막아준다.
  if (authCheck === TIMED_OUT) {
    return supabaseResponse;
  }
  const user = authCheck;

  const isLoginPage = request.nextUrl.pathname === "/login";
  const isPublicPage =
    request.nextUrl.pathname.startsWith("/sign/") ||
    request.nextUrl.pathname.startsWith("/install-status/") ||
    request.nextUrl.pathname.startsWith("/equipment-select/");

  if (!user && !isLoginPage && !isPublicPage) {
    // 원래 가려던 주소를 함께 넘긴다. 그러지 않으면 링크를 눌러 들어온 사람이 로그인한 뒤
    // 첫 화면으로 가버려 링크를 다시 눌러야 한다.
    const loginUrl = new URL("/login", request.url);
    const back = request.nextUrl.pathname + request.nextUrl.search;
    if (back !== "/") loginUrl.searchParams.set("next", back);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
