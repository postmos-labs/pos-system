"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { getFranchiseUnlinkable, unlinkInstallationFromFranchise } from "./actions";

interface Props {
  installationId: string;
  franchiseApplicationId: string;
  onUnlinked: (patch: { customer_name: string; notes: string | null }) => void;
}

// 설치관리에서 직접 연결한 건에만 보인다. 해제 가능 여부는 서버가 해제 때 쓰는 검사와 같은 함수로 판단한다.
export default function FranchiseUnlinkButton({
  installationId,
  franchiseApplicationId,
  onUnlinked,
}: Props) {
  const toast = useToast();
  const [unlinkable, setUnlinkable] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getFranchiseUnlinkable(installationId).then((result) => {
      if (alive) setUnlinkable(result.unlinkable);
    });
    return () => {
      alive = false;
    };
  }, [installationId, franchiseApplicationId]);

  if (!unlinkable) return null;

  async function unlink() {
    if (
      !window.confirm(
        "가맹접수 연결을 해제할까요?\n\n연결할 때 바뀐 상호명·비고는 그 뒤 수정하지 않았다면 원래대로 돌아갑니다.",
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await unlinkInstallationFromFranchise(installationId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    onUnlinked({ customer_name: result.customerName as string, notes: result.notes ?? null });
  }

  return (
    <button
      type="button"
      onClick={unlink}
      disabled={busy}
      className="text-muted-foreground hover:text-destructive mt-2 text-xs font-semibold underline-offset-2 hover:underline disabled:opacity-50"
    >
      가맹접수 연결 해제
    </button>
  );
}
