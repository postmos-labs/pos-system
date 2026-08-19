"use client";

import { useState, useTransition } from "react";
import { setUserTeam } from "./actions";
import { TEAM_LABEL_KR, TEAMS } from "./constants";
import { useToast } from "@/components/ui/Toast";
import { AppSelect } from "@/components/ui/AppSelect";

interface Props {
  userId: string;
  initialTeam: string;
}

export default function TeamSelect({ userId, initialTeam }: Props) {
  const [team, setTeam] = useState(initialTeam);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(next: string) {
    const previous = team;
    setTeam(next);
    startTransition(async () => {
      const { error } = await setUserTeam(userId, next);
      if (error) {
        toast.error("팀 변경 실패: " + error);
        setTeam(previous);
      }
    });
  }

  return (
    <AppSelect
      value={team}
      onValueChange={handleChange}
      disabled={isPending}
      aria-label="소속 팀"
      className="h-auto px-2 py-1 text-xs font-semibold"
      options={TEAMS.map((item) => ({ value: item, label: TEAM_LABEL_KR[item] }))}
    />
  );
}
