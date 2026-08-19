"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { ko } from "react-day-picker/locale";

export function parseDate(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const CALENDAR_CLASSNAMES = {
  months: "flex flex-col gap-2",
  month: "space-y-2",
  month_caption: "flex items-center justify-center py-1 text-sm font-semibold text-slate-800",
  nav: "absolute inset-x-1 top-1 flex items-center justify-between",
  button_previous:
    "flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100",
  button_next:
    "flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100",
  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday:
    "w-9 text-center text-xs font-medium text-slate-400 first:text-red-500 last:text-blue-500",
  week: "mt-1 flex w-full",
  day: "size-9 shrink-0 p-0 text-center text-sm",
  day_button:
    "flex size-9 shrink-0 items-center justify-center rounded-md text-sm tabular-nums text-slate-700 hover:bg-slate-100",
  today: "font-bold text-blue-600",
  selected: "[&_button]:!bg-blue-600 [&_button]:!text-white",
  outside: "[&_button]:!text-slate-300",
  disabled: "[&_button]:!text-slate-300",
};

export function DatePickerField({
  value,
  onChange,
  ariaLabel,
  placeholder = "날짜 선택",
  disabled = false,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const selected = parseDate(value);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
          <CalendarDays size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className={value ? "text-slate-700" : "text-slate-400"}>
            {value || placeholder}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <DayPicker
            mode="single"
            locale={ko}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (date) onChange(formatDate(date));
            }}
            classNames={CALENDAR_CLASSNAMES}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mt-1 w-full rounded-md py-1 text-center text-xs text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            >
              날짜 지우기
            </button>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
