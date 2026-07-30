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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
