"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const PROMOTION_MANAGER_ROLES = ["admin", "master", "cs"] as const;

export type PromotionInput = {
  name: string;
  startDate: string;
  endDate: string;
  unitRate: number;
  achievedCount: number;
  memo: string;
};

async function requirePromotionManager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !PROMOTION_MANAGER_ROLES.includes(profile.role)) {
    return { error: "권한이 없습니다." as const };
  }

  return { supabase, userId: user.id } as const;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validatePromotion(input: PromotionInput) {
  const name = input.name.trim();
  const memo = input.memo.trim();
  if (!name) return { error: "프로모션 이름을 입력해주세요." };
  if (!isValidDate(input.startDate) || !isValidDate(input.endDate)) {
    return { error: "프로모션 기간을 올바르게 입력해주세요." };
  }
  if (input.endDate < input.startDate) {
    return { error: "종료일은 시작일 이후여야 합니다." };
  }
  if (!Number.isInteger(input.unitRate) || input.unitRate < 0) {
    return { error: "단가는 0 이상의 정수로 입력해주세요." };
  }
  if (!Number.isInteger(input.achievedCount) || input.achievedCount < 0) {
    return { error: "달성 건수는 0 이상의 정수로 입력해주세요." };
  }

  return { name, memo };
}

export async function createPromotion(input: PromotionInput) {
  const auth = await requirePromotionManager();
  if ("error" in auth) return auth;

  const validated = validatePromotion(input);
  if ("error" in validated) return validated;

  const { error } = await auth.supabase.from("settlement_promotions").insert({
    name: validated.name,
    unit_rate: input.unitRate,
    achieved_count: input.achievedCount,
    start_date: input.startDate,
    end_date: input.endDate,
    memo: validated.memo || null,
    created_by: auth.userId,
  });
  if (error) return { error: error.message };

  revalidatePath("/overview");
  return { error: null };
}

export async function updatePromotion(id: string, input: PromotionInput) {
  const auth = await requirePromotionManager();
  if ("error" in auth) return auth;
  if (!id) return { error: "프로모션을 찾을 수 없습니다." };

  const validated = validatePromotion(input);
  if ("error" in validated) return validated;

  const { error } = await auth.supabase
    .from("settlement_promotions")
    .update({
      name: validated.name,
      unit_rate: input.unitRate,
      achieved_count: input.achievedCount,
      start_date: input.startDate,
      end_date: input.endDate,
      memo: validated.memo || null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/overview");
  return { error: null };
}

export async function deletePromotion(id: string) {
  const auth = await requirePromotionManager();
  if ("error" in auth) return auth;
  if (!id) return { error: "프로모션을 찾을 수 없습니다." };

  const { error } = await auth.supabase.from("settlement_promotions").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/overview");
  return { error: null };
}
