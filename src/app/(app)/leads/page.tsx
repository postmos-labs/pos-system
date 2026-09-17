import { redirect } from "next/navigation";

// 자체리드 메뉴는 2026-09-17에 내렸다. 가맹접수의 채널 "직접 영업"과 겹쳐서다.
// 진행 중이던 리드는 supabase/154로 가맹접수에 옮겼다. 예전 링크·알림으로 들어오면 가맹접수로 보낸다.
// 화면 코드(LeadsClient 등)와 own_leads 표는 병행 기간 동안 남겨 둔다.
export default function LeadsPage() {
  redirect("/franchise?channel=direct_sales");
}
