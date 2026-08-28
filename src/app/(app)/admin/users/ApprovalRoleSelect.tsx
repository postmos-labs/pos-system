"use client";

import { useState, useTransition } from "react";
import { setUserApprovalRole } from "./actions";
import { APPROVAL_ROLE_LABEL_KR } from "./constants";
import { useToast } from "@/components/ui/Toast";
import { AppSelect } from "@/components/ui/AppSelect";

const APPROVAL_ROLES = [
  "cs_manager",
  "cs_responsible",
  "tech_manager",
  "tech_responsible",
  "team_lead",
  "developer",
  "test_account",
];

export default function ApprovalRoleSelect({
  userId,
  initialRole,
}: {
  userId: string;
  initialRole: string | null;
}) {
  const [role, setRole] = useState(initialRole ?? "");
  const [isPending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <AppSelect
      value={role}
      disabled={isPending}
      aria-label="승인 직책"
      className="h-auto px-2 py-1 text-xs font-semibold"
      onValueChange={(next) => {
        const previous = role;
        setRole(next);
        startTransition(async () => {
          const { error } = await setUserApprovalRole(userId, next);
          if (error) {
            toast.error("승인 직책 변경 실패: " + error);
            setRole(previous);
          }
        });
      }}
      options={[
        { value: "", label: "승인 직책 미지정" },
        ...APPROVAL_ROLES.map((item) => ({ value: item, label: APPROVAL_ROLE_LABEL_KR[item] })),
      ]}
    />
  );
}
