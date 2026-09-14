import type { ApprovalNote } from "@/lib/approvalNotes";

const ROLE_LABEL: Record<string, string> = {
  cs_manager: "CS매니저",
  cs_responsible: "CS책임",
  tech_manager: "기술지원매니저",
  tech_responsible: "기술지원책임",
  team_lead: "팀장",
  developer: "개발자",
  test_account: "테스트계정",
};

const STAGE_LABEL: Record<ApprovalNote["stage"], string> = {
  request: "승인 요청",
  first_approval: "1차 승인",
  final_approval: "최종 승인",
  rejection: "반려",
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function ApprovalNoteTimeline({ notes }: { notes: ApprovalNote[] }) {
  if (!notes.length) {
    return <p className="text-sm text-slate-400">등록된 승인 비고가 없습니다.</p>;
  }

  return (
    <ol className="space-y-3">
      {[...notes]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((note) => (
          <li key={note.id} className="border-l-2 border-blue-200 pl-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
              <span className="font-semibold text-slate-800">{note.author_name}</span>
              <span className="text-slate-500">
                {ROLE_LABEL[note.author_role] ?? note.author_role}
              </span>
              <span
                className={
                  note.stage === "rejection"
                    ? "font-medium text-red-600"
                    : "font-medium text-blue-600"
                }
              >
                {STAGE_LABEL[note.stage]}
              </span>
              <time className="text-slate-400" dateTime={note.created_at}>
                {formatTimestamp(note.created_at)}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
              {note.content}
            </p>
          </li>
        ))}
    </ol>
  );
}
