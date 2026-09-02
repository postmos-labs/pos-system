import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import PhotosClient from "./PhotosClient";
import type { Profile } from "@/types";

export default async function InstallPhotosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/dashboard");

  // 승인 절차가 생기면서 기사가 사진을 올려도 승인이 끝나기 전에는 상태가 completed가
  // 아니다. 완료된 건만 찾으면 방금 올린 사진이 목록에 없어 "안 올라갔다"로 보인다.
  // 사진이 있으면 승인 대기 건도 함께 보여주고, 화면에서 상태를 구분해 표시한다.
  const { data: installs } = await supabase
    .from("installations")
    .select(
      "id, customer_name, delivery_type, status, completion_photo_urls, notes, created_at, assignee:profiles!installations_assigned_to_fkey(name)",
    )
    .not("completion_photo_urls", "is", null)
    .not("status", "in", "(rejected,canceled)")
    .order("created_at", { ascending: false })
    .limit(500);

  const withPhotos = (installs ?? []).filter((i) => (i.completion_photo_urls?.length ?? 0) > 0);

  return <PhotosClient profile={profile as Profile} installs={withPhotos as any} />;
}
