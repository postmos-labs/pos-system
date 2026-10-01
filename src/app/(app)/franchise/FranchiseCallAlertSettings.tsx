"use client";

import { useState } from "react";
import {
  FRANCHISE_CALL_ALERT_EVENTS,
  FRANCHISE_CALL_ALERT_EVENT_LABEL,
  type FranchiseCallAlertConfig,
  type FranchiseCallAlertEvent,
  type FranchiseCallAlertSetting,
} from "@/lib/franchiseCallAlerts";
import { saveFranchiseCallAlertSetting } from "./callAlertActions";

interface Props {
  config: FranchiseCallAlertConfig | null;
  onSaved: (setting: FranchiseCallAlertSetting) => void;
  onClose: () => void;
}

const TEAM_LABEL: Record<string, string> = {
  sales: "영업",
  cs: "CS",
  tech: "기술지원",
  dev: "개발",
};

export default function FranchiseCallAlertSettings({ config, onSaved, onClose }: Props) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-5 py-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-200">알림 받을 사람 설정</p>
          <button
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            돌아가기
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          재상담·취소처리 때 여기서 고른 사람에게 팝업 알림이 갑니다. 처리한 본인은 받지 않습니다.
        </p>
      </div>
      {config === null ? (
        <p className="px-5 py-4 text-sm text-slate-400">불러오는 중…</p>
      ) : (
        <SettingsForm config={config} onSaved={onSaved} />
      )}
    </div>
  );
}

function SettingsForm({
  config,
  onSaved,
}: {
  config: FranchiseCallAlertConfig;
  onSaved: (setting: FranchiseCallAlertSetting) => void;
}) {
  const [event, setEvent] = useState<FranchiseCallAlertEvent>("reconsult");
  const [drafts, setDrafts] = useState<Record<FranchiseCallAlertEvent, FranchiseCallAlertSetting>>(
    () => ({ ...config.settings }),
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const draft = drafts[event];
  const readOnly = !config.canEdit || config.missingTable;
  const keyword = query.trim();
  const candidates = keyword
    ? config.candidates.filter((c) => c.name.includes(keyword))
    : config.candidates;

  function updateDraft(patch: Partial<FranchiseCallAlertSetting>) {
    setDrafts((prev) => ({ ...prev, [event]: { ...prev[event], ...patch } }));
    setMessage(null);
  }

  function toggleRecipient(id: string) {
    const ids = draft.recipient_ids.includes(id)
      ? draft.recipient_ids.filter((x) => x !== id)
      : [...draft.recipient_ids, id];
    updateDraft({ recipient_ids: ids });
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      for (const ev of FRANCHISE_CALL_ALERT_EVENTS) {
        const { error } = await saveFranchiseCallAlertSetting(drafts[ev]);
        if (error) {
          setMessage({
            text: `${FRANCHISE_CALL_ALERT_EVENT_LABEL[ev]} 알림: ${error}`,
            isError: true,
          });
          return;
        }
        onSaved(drafts[ev]);
      }
      setMessage({ text: "저장했습니다", isError: false });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "저장에 실패했습니다", isError: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="px-5 pt-3 space-y-2">
        {config.missingTable && (
          <p className="text-xs text-amber-300">
            알림 설정 표가 아직 없습니다. supabase/157 마이그레이션을 실행한 뒤 설정할 수 있습니다.
          </p>
        )}
        {config.error && <p className="text-xs text-red-300">{config.error}</p>}
        {!config.canEdit && (
          <p className="text-xs text-slate-400">관리자·마스터·CS책임·팀장만 변경할 수 있습니다.</p>
        )}
        <div className="flex gap-1">
          {FRANCHISE_CALL_ALERT_EVENTS.map((ev) => (
            <button
              key={ev}
              onClick={() => {
                setEvent(ev);
                setMessage(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                ev === event ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {FRANCHISE_CALL_ALERT_EVENT_LABEL[ev]} 알림 ({drafts[ev].recipient_ids.length}명)
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="accent-blue-400"
              checked={draft.notify_sales}
              disabled={readOnly}
              onChange={(e) => updateDraft({ notify_sales: e.target.checked })}
            />
            이 건의 담당 영업
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="accent-blue-400"
              checked={draft.notify_cs}
              disabled={readOnly}
              onChange={(e) => updateDraft({ notify_cs: e.target.checked })}
            />
            이 건의 담당 CS
          </label>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름으로 검색"
          className="w-full bg-slate-800 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded px-2 py-1.5 text-sm text-white placeholder:text-slate-500"
        />
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-400">표시할 직원이 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((c) => {
              const team = c.team ? TEAM_LABEL[c.team] : null;
              const meta = [team, c.position].filter(Boolean).join(" · ");
              return (
                <li key={c.id}>
                  <label className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-200 hover:bg-slate-800">
                    <input
                      type="checkbox"
                      className="accent-blue-400"
                      checked={draft.recipient_ids.includes(c.id)}
                      disabled={readOnly}
                      onChange={() => toggleRecipient(c.id)}
                    />
                    <span>{c.name}</span>
                    {meta && <span className="text-xs text-slate-500">{meta}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-slate-700">
        {saving ? (
          <span className="text-xs text-slate-400">저장 중…</span>
        ) : (
          message && (
            <span className={`text-xs ${message.isError ? "text-red-300" : "text-green-300"}`}>
              {message.text}
            </span>
          )
        )}
        <button
          onClick={handleSave}
          disabled={saving || readOnly}
          className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-40"
        >
          저장
        </button>
      </div>
    </>
  );
}
