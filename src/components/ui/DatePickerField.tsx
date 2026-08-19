"use client";

import * as Popover from "@radix-ui/react-popover";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
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

/**
 * 캘린더 아이콘 버튼만 제공하는 트리거. 옆에 자유 텍스트 입력을 별도로 두고
 * "날짜 또는 텍스트"를 함께 받는 필드(예: WooClient)에서, 숨겨진 native
 * input[type=date] + showPicker() 트릭 대신 사용한다.
 */
export function CalendarPopoverButton({
  onSelect,
  value,
  ariaLabel,
  className = "",
}: {
  onSelect: (value: string) => void;
  value?: string;
  ariaLabel: string;
  className?: string;
}) {
  const selected = value ? parseDate(value) : undefined;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(event) => event.stopPropagation()}
          className={`shrink-0 text-slate-400 hover:text-blue-500 ${className}`}
        >
          <CalendarDays size={14} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onClick={(event) => event.stopPropagation()}
          className="z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
        >
          <DayPicker
            mode="single"
            locale={ko}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (date) onSelect(formatDate(date));
            }}
            classNames={CALENDAR_CLASSNAMES}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function DatePickerField({
  value,
  onChange,
  defaultValue,
  name,
  ariaLabel,
  placeholder = "날짜 선택",
  disabled = false,
  className = "",
  minDate,
  maxDate,
}: {
  value?: string;
  onChange?: (value: string) => void;
  /** value/onChange 없이 name과 함께 쓰면 native <form>의 GET/POST 제출에 hidden input으로 참여한다. */
  defaultValue?: string;
  name?: string;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: string;
  maxDate?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = isControlled ? value : internalValue;
  const handleChange = (next: string) => {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  };
  const selected = parseDate(currentValue);
  const min = minDate ? parseDate(minDate) : undefined;
  const max = maxDate ? parseDate(maxDate) : undefined;
  const dayDisabled = [min ? { before: min } : null, max ? { after: max } : null].filter(
    (matcher): matcher is { before: Date } | { after: Date } => matcher !== null,
  );

  return (
    <Popover.Root>
      {name && <input type="hidden" name={name} value={currentValue} />}
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        >
          <CalendarDays size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className={currentValue ? "" : "text-slate-400"}>
            {currentValue || placeholder}
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
              if (date) handleChange(formatDate(date));
            }}
            disabled={dayDisabled.length ? dayDisabled : undefined}
            classNames={CALENDAR_CLASSNAMES}
          />
          {currentValue && (
            <button
              type="button"
              onClick={() => handleChange("")}
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
