import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import EquipmentSelectClient from "./EquipmentSelectClient";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function EquipmentSelectPage({ params }: Props) {
  const { token } = await params;

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("franchise_applications")
    .select(
      "id, business_name, owner_name, equipment_select_token, selected_equipment, equipment_selected_at",
    )
    .eq("equipment_select_token", token)
    .is("deleted_at", null)
    .single();

  if (!row) notFound();

  return <EquipmentSelectClient row={row} />;
}
