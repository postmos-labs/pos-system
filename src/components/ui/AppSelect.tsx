"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

const EMPTY_VALUE = "__empty__";

export type AppSelectOption = {
  value: string;
  label: ReactNode;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
};

export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder,
  "aria-label": ariaLabel,
  className = "",
  disabled = false,
}: AppSelectProps) {
  const internalValue = value || EMPTY_VALUE;
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Select.Root
      value={internalValue}
      onValueChange={(nextValue) => onValueChange(nextValue === EMPTY_VALUE ? "" : nextValue)}
      disabled={disabled}
    >
      <Select.Trigger
        className={`group inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        aria-label={ariaLabel}
      >
        <Select.Value placeholder={placeholder}>{selectedOption?.label ?? null}</Select.Value>
        <Select.Icon className="shrink-0 text-slate-400 transition-transform group-data-[state=open]:rotate-180">
          <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 text-sm text-slate-700 shadow-lg"
        >
          <Select.Viewport className="max-h-72">
            {options.map((option) => {
              const itemValue = option.value || EMPTY_VALUE;
              return (
                <Select.Item
                  key={itemValue}
                  value={itemValue}
                  disabled={option.disabled}
                  className="relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-3 outline-none transition data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-blue-50 data-[highlighted]:text-slate-900"
                >
                  <Select.ItemIndicator className="absolute left-2.5 inline-flex items-center text-blue-600">
                    <Check size={14} strokeWidth={2.25} aria-hidden="true" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
