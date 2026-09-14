import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types";

// 같은 요청 안에서 레이아웃과 페이지가 각각 getUser·profiles를 부르면 인증 왕복이 두 번 돈다.
// React cache()는 서버 렌더 한 번(요청 한 건) 동안만 결과를 기억하므로, 여기서 한 번 받아 둘이 나눠 쓴다.
// 서버 액션에서는 쓰지 않는다 — 액션은 요청 단위가 달라 캐시 효과가 없고, 권한 검사는 액션이 직접 한다.

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getSessionProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile | null) ?? null;
});
