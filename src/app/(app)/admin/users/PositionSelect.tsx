"use client";

import { useState, useTransition } from "react";
import { setUserPosition } from "./actions";
import { POSITIONS } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { AppSelect } from "@/components/ui/AppSelect";

interface Props {
  userId: string;
  position: string;
}

export default function PositionSelect({ userId, position: initialPosition }: Props) {
  const [position, setPosition] = useState(initialPosition);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function handleChange(next: string) {
    const previous = position;
    setPosition(next);
    startTransition(async () => {
      const { error } = await setUserPosition(userId, next);
      if (error) {
        toast.error("직급 변경 실패: " + error);
        setPosition(previous);
      }
    });
  }

  return (
    <AppSelect
      value={position}
      onValueChange={handleChange}
      disabled={isPending}
      aria-label="직급"
      className="h-auto px-2 py-1 text-xs font-semibold"
      options={[
        { value: "", label: "직급 미지정" },
        ...POSITIONS.map((item) => ({ value: item, label: item })),
      ]}
    />
  );
}
