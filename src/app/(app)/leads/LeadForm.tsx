"use client";

import { useState } from "react";
import FormModal from "@/components/ui/FormModal";
import { AppSelect } from "@/components/ui/AppSelect";
import { LEAD_SOURCES, type OwnLeadInput } from "./lead";
import type { Profile } from "@/types";

const CUSTOM_SOURCE = "__custom__";

interface Props {
  csProfiles: Pick<Profile, "id" | "name" | "role">[];
  defaultAssigneeId: string;
  onSubmit: (input: OwnLeadInput) => Promise<void>;
  submitting: boolean;
  onClose: () => void;
}

export default function LeadForm({
  csProfiles,
  defaultAssigneeId,
  onSubmit,
  submitting,
  onClose,
}: Props) {
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [region, setRegion] = useState("");
  const [sourceMode, setSourceMode] = useState<string>(LEAD_SOURCES[0]);
  const [customSource, setCustomSource] = useState("");
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [note, setNote] = useState("");

  const invalid = !businessName.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (invalid) return;
    await onSubmit({
      business_name: businessName.trim(),
      owner_name: ownerName.trim(),
      phone: phone.trim(),
      region: region.trim(),
      source: sourceMode === CUSTOM_SOURCE ? customSource.trim() : sourceMode,
      assignee_id: assigneeId,
      note: note.trim(),
    });
  }

  return (
    <FormModal title="자체리드 등록" onClose={onClose} maxWidthClassName="max-w-lg">
      <p className="mb-4 text-xs text-slate-500">
        카톡으로 받은 내용을 최소한만 적고 등록합니다. 확인·판단은 목록에서 합니다.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">상호명</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-slate-500">대표자</label>
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-slate-500">연락처</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">지역</label>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-3">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-slate-500">유입경로</label>
            {sourceMode === CUSTOM_SOURCE ? (
              <input
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                placeholder="직접 입력"
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <AppSelect
                value={sourceMode}
                onValueChange={setSourceMode}
                aria-label="유입경로"
                options={[
                  ...LEAD_SOURCES.map((s) => ({ value: s, label: s })),
                  { value: CUSTOM_SOURCE, label: "직접 입력" },
                ]}
              />
            )}
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-medium text-slate-500">담당자</label>
            <AppSelect
              value={assigneeId}
              onValueChange={setAssigneeId}
              aria-label="담당자"
              options={[
                { value: "", label: "-" },
                ...csProfiles.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-500">비고</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="대표님이 전달한 내용을 그대로 적어 두세요"
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || invalid}
          className="self-end text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
        >
          {submitting ? "등록 중..." : "등록"}
        </button>
      </form>
    </FormModal>
  );
}
