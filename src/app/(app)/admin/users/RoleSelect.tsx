"use client";

import { useState, useTransition } from "react";
import { setUserRole } from "./actions";
import { ROLE_LABEL_KR } from "./constants";
import { useToast } from "@/components/ui/Toast";
import { AppSelect } from "@/components/ui/AppSelect";

const ROLES = ["master", "admin", "sales", "cs", "tech", "developer"];

interface Props {
  userId: string;
  initialRole: string;
  currentUserRole: string;
}

export default function RoleSelect({ userId, initialRole, currentUserRole }: Props) {
  const [role, setRole] = useState(initialRole);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(next: string) {
    const prev = role;
    setRole(next);
    startTransition(async () => {
      const { error } = await setUserRole(userId, next);
      if (error) {
        toast.error("역할 변경 실패: " + error);
        setRole(prev);
      }
    });
  }

  return (
    <AppSelect
      value={role}
      onValueChange={handleChange}
      disabled={isPending}
      className="h-auto text-xs font-semibold px-2 py-1"
      aria-label="역할"
      options={ROLES.filter(
        (r) => r !== "master" || currentUserRole === "master" || role === "master",
      ).map((r) => ({ value: r, label: ROLE_LABEL_KR[r] }))}
    />
  );
}
