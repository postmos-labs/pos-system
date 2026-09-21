export type ApprovalNoteStage = "request" | "first_approval" | "final_approval" | "rejection";

export type ApprovalNote = {
  id: string;
  content: string;
  author_id: string;
  author_name: string;
  author_role: string;
  created_at: string;
  stage: ApprovalNoteStage;
};

const MAX_APPROVAL_NOTE_LENGTH = 2000;

export function validateApprovalNote(content: string): string | null {
  const note = content.trim();
  if (note.length > MAX_APPROVAL_NOTE_LENGTH) return null;
  return note;
}

export function parseApprovalNotes(value: unknown): ApprovalNote[] {
  if (!Array.isArray(value)) return [];
  return value.filter((note): note is ApprovalNote => {
    if (!note || typeof note !== "object") return false;
    const item = note as Record<string, unknown>;
    return (
      typeof item.id === "string" &&
      typeof item.content === "string" &&
      typeof item.author_id === "string" &&
      typeof item.author_name === "string" &&
      typeof item.author_role === "string" &&
      typeof item.created_at === "string" &&
      typeof item.stage === "string"
    );
  });
}

export function appendApprovalNote(
  value: unknown,
  author: { id: string; name: string | null; role: string },
  content: string,
  stage: ApprovalNoteStage,
): ApprovalNote[] {
  const note = validateApprovalNote(content);
  if (note === null) throw new Error("비고는 2,000자 이하로 입력해주세요.");
  if (!note) return parseApprovalNotes(value);

  const createdAt = new Date().toISOString();
  return [
    ...parseApprovalNotes(value),
    {
      id: `${createdAt}-${author.id}-${stage}`,
      content: note,
      author_id: author.id,
      author_name: author.name?.trim() || "사용자",
      author_role: author.role,
      created_at: createdAt,
      stage,
    },
  ];
}

export const APPROVAL_NOTE_STAGE_LABEL: Record<ApprovalNoteStage, string> = {
  request: "승인 요청",
  first_approval: "1차 승인",
  final_approval: "최종 승인",
  rejection: "반려",
};
