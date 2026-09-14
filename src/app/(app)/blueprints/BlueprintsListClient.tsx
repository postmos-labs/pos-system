"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Plus, FileStack, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { kstWallClock } from "@/lib/date";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import type { Profile } from "@/types";

interface BlueprintRow {
  id: string;
  title: string;
  merchant_id: string | null;
  updated_at: string;
  created_at: string;
  merchant: { business_name: string } | null;
}

export default function BlueprintsListClient({
  profile,
  initialBlueprints,
}: {
  profile: Profile;
  initialBlueprints: BlueprintRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [blueprints, setBlueprints] = useState(initialBlueprints);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("install_blueprints")
      .insert({ title: "제목 없는 설계도", elements: [] })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("설계도를 만들지 못했습니다.");
      return;
    }
    router.push(`/blueprints/${data.id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 설계도를 삭제할까요?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("install_blueprints").delete().eq("id", id);
    if (error) {
      toast.error("삭제하지 못했습니다.");
      return;
    }
    setBlueprints((prev) => prev.filter((b) => b.id !== id));
    toast.success("삭제했습니다.");
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">설계도</h1>
          <p className="text-sm text-slate-500 mt-1">매장 설치 배선도를 그려서 관리합니다.</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />새 설계도
        </button>
      </div>

      {blueprints.length === 0 ? (
        <EmptyState message="아직 만들어진 설계도가 없습니다." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {blueprints.map((bp) => (
            <div
              key={bp.id}
              onClick={() => router.push(`/blueprints/${bp.id}`)}
              className="group relative cursor-pointer bg-white border border-slate-200 rounded-xl p-4 hover:border-orange-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                  <FileStack size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 truncate" title={bp.title}>
                    {bp.title}
                  </p>
                  {bp.merchant?.business_name && (
                    <p
                      className="text-xs text-slate-400 truncate mt-0.5"
                      title={bp.merchant.business_name}
                    >
                      {bp.merchant.business_name}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {format(kstWallClock(bp.updated_at ?? bp.created_at), "yyyy.MM.dd HH:mm", {
                      locale: ko,
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(bp.id);
                }}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                title="삭제"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
