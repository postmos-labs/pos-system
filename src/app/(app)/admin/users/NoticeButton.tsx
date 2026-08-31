"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone, X } from "lucide-react";
import type { Team } from "@/types";
import { sendNotice } from "./actions";

// @/types의 TEAM_LABEL은 인입내역 담당팀(CS/기술지원)용이라 직원 소속팀 4개를 담지 못한다.
const TEAM_LABEL: Record<Team, string> = {
  sales: "영업",
  cs: "CS팀",
  tech: "기술지원",
  dev: "개발",
};
const TEAMS: Team[] = ["sales", "cs", "tech", "dev"];

export interface NoticeMember {
  id: string;
  name: string;
  team: string | null;
}

export default function NoticeButton({ members }: { members: NoticeMember[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const selectedSet = new Set(selected);
  const canSend = !!title.trim() && !!body.trim() && selected.length > 0;

  // 소속팀이 없는 계정도 빠뜨리지 않도록 마지막에 '팀 없음'으로 모아 보여준다.
  const groups = [
    ...TEAMS.map((team) => ({
      key: team as string,
      label: TEAM_LABEL[team],
      people: members.filter((member) => member.team === team),
    })),
    { key: "none", label: "팀 없음", people: members.filter((member) => !member.team) },
  ].filter((group) => group.people.length > 0);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  // 팀 이름을 누르면 그 팀을 통째로 넣거나 뺀다. 사람 단위 선택의 단축키일 뿐이다.
  function toggleGroup(people: NoticeMember[]) {
    const ids = people.map((person) => person.id);
    const allSelected = ids.every((id) => selectedSet.has(id));
    setSelected((prev) =>
      allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  }

  function close() {
    setOpen(false);
    setSelected([]);
    setTitle("");
    setBody("");
  }

  async function handleSend() {
    // 보낸 공지는 각자의 알림함에 바로 들어가고 되돌릴 수단이 없다. 누구에게 가는지 보여주고 확인한다.
    const names = members
      .filter((member) => selectedSet.has(member.id))
      .map((member) => member.name)
      .join(", ");
    if (!confirm(`${selected.length}명에게 공지를 보냅니다.\n\n${names}\n\n되돌릴 수 없습니다.`))
      return;

    setSending(true);
    const result = await sendNotice({ title, body, userIds: selected });
    setSending(false);
    if (result.error) {
      alert(result.error);
      return;
    }
    alert(`${result.sentCount}명에게 공지를 보냈습니다.`);
    close();
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
      >
        <Megaphone size={16} />
        공지 보내기
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">공지 보내기</h2>
              <button type="button" onClick={close} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    받는 사람{" "}
                    <span className="font-semibold text-blue-600">{selected.length}명</span>
                  </p>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelected(members.map((member) => member.id))}
                      className="font-medium text-slate-500 hover:text-slate-800"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected([])}
                      className="font-medium text-slate-500 hover:text-slate-800"
                    >
                      전체 해제
                    </button>
                  </div>
                </div>

                <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
                  {groups.map((group) => {
                    const allSelected = group.people.every((person) => selectedSet.has(person.id));
                    return (
                      <div key={group.key}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.people)}
                          className="mb-1 text-xs font-semibold text-slate-500 hover:text-blue-600"
                        >
                          {group.label} {group.people.length}명 · {allSelected ? "해제" : "모두"}
                        </button>
                        <div className="flex flex-wrap gap-1.5">
                          {group.people.map((person) => {
                            const on = selectedSet.has(person.id);
                            return (
                              <button
                                key={person.id}
                                type="button"
                                onClick={() => toggle(person.id)}
                                className={`rounded-lg border px-2.5 py-1 text-sm transition-colors ${
                                  on
                                    ? "border-blue-500 bg-blue-50 font-medium text-blue-700"
                                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {person.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs text-slate-500">제목</p>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="예: 인입내역 기록 안내"
                  className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs text-slate-500">내용</p>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={8}
                  maxLength={2000}
                  placeholder="공지 내용을 입력하세요"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-right text-[11px] text-slate-400">{body.length} / 2,000</p>
              </div>

              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                각자의 알림함에 바로 쌓입니다. 접속 중인 직원에게는 1분 안에 알림창이 뜨고, 그
                외에는 다음 접속 때 알림함에서 확인합니다. 보낸 뒤에는 회수할 수 없습니다.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || !canSend}
                className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? "보내는 중..." : `${selected.length}명에게 보내기`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
