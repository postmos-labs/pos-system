"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Download, Upload } from "lucide-react";
import FormModal from "@/components/ui/FormModal";
import { useToast } from "@/components/ui/Toast";
import {
  fetchExportTargets,
  importCuratedRows,
  markTicketsExported,
  type CuratedRow,
  type ExportedTicket,
} from "./actions";
import type { ChatbotDataRow } from "./ChatbotDataClient";

// 정제를 맡길 때 함께 붙여넣는 지시문. 돌려받을 형식을 여기서 못 박아야
// 가져오기가 파일을 그대로 읽을 수 있다.
const CURATION_PROMPT = `아래 JSON은 POS 기술지원팀이 실제 문의를 처리하며 남긴 "해결 절차" 기록이다.
이것을 챗봇이 학습할 Q/A 쌍으로 정제해라.

규칙
1. 같은 문제를 다룬 항목은 하나로 합친다. source_ticket_ids에 합친 항목의 id를 모두 넣는다.
2. problem_situation은 고객이 실제로 물어볼 법한 문장으로 다시 쓴다.
3. solution은 따라 하면 되는 순서로 정리한다. 화면에 표시되는 버튼 이름은 원문 그대로 둔다.
4. 가맹점 상호, 사람 이름, 전화번호, 사업자번호, 단말기 일련번호는 모두 지운다.
5. 절차가 불충분해 재현할 수 없는 항목은 결과에서 뺀다.
6. 오타와 줄임말은 고치되 내용을 지어내지 않는다.

출력은 아래 형식의 JSON만. 설명 문장은 붙이지 않는다.
{
  "items": [
    {
      "problem_situation": "...",
      "solution": "1) ...\\n2) ...",
      "source_ticket_ids": ["...", "..."]
    }
  ]
}

입력 데이터:
`;

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

/** 돌려받은 파일에서 쓸 수 있는 항목만 추린다. LLM이 형식을 조금씩 어긋나게 주는 걸 감안한다. */
function parseCurated(text: string): { rows: CuratedRow[]; skipped: number; error: string | null } {
  let parsed: unknown;
  try {
    // 앞뒤로 설명이 붙어 오는 경우가 있어 가장 바깥 JSON 덩어리만 잘라 읽는다.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const body = start >= 0 && end > start ? text.slice(start, end + 1) : text;
    parsed = JSON.parse(body);
  } catch {
    return { rows: [], skipped: 0, error: "JSON 형식이 아닙니다. 파일 내용을 확인해 주세요." };
  }

  const container = parsed as { items?: unknown };
  const items = Array.isArray(container?.items)
    ? container.items
    : Array.isArray(parsed)
      ? (parsed as unknown[])
      : null;
  if (!items) {
    return { rows: [], skipped: 0, error: "items 배열을 찾지 못했습니다." };
  }

  const rows: CuratedRow[] = [];
  let skipped = 0;
  for (const item of items) {
    const entry = item as Record<string, unknown>;
    const problem =
      typeof entry.problem_situation === "string" ? entry.problem_situation.trim() : "";
    const solution = typeof entry.solution === "string" ? entry.solution.trim() : "";
    if (!problem || !solution) {
      skipped += 1;
      continue;
    }
    const ids = Array.isArray(entry.source_ticket_ids)
      ? entry.source_ticket_ids.filter((id): id is string => typeof id === "string")
      : [];
    rows.push({ problem_situation: problem, solution, source_ticket_ids: ids });
  }

  return { rows, skipped, error: null };
}

interface ExportModalProps {
  onClose: () => void;
}

function ExportModal({ onClose }: ExportModalProps) {
  const toast = useToast();
  const [includeExported, setIncludeExported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<ExportedTicket[] | null>(null);
  const [columnMissing, setColumnMissing] = useState(false);

  const load = useCallback(
    async (next: boolean) => {
      setIncludeExported(next);
      setLoading(true);
      const result = await fetchExportTargets(next);
      setLoading(false);
      if (result.error) {
        toast.error(`불러오기 실패: ${result.error}`);
        setPreview([]);
        return;
      }
      setPreview(result.rows);
      setColumnMissing(result.exportColumnMissing);
    },
    [toast],
  );

  // 모달이 열릴 때 한 번만 불러온다. 이후 갱신은 체크박스가 load()를 직접 호출한다.
  // 여기서 상태를 동기로 건드리지 않도록 loading은 초기값 true로 두고 응답 후에만 바꾼다.
  useEffect(() => {
    let alive = true;
    fetchExportTargets(false).then((result) => {
      if (!alive) return;
      setLoading(false);
      if (result.error) {
        toast.error(`불러오기 실패: ${result.error}`);
        setPreview([]);
        return;
      }
      setPreview(result.rows);
      setColumnMissing(result.exportColumnMissing);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDownload() {
    if (!preview?.length) return;
    setLoading(true);
    downloadJson(`인입내역_해결절차_${today()}.json`, {
      exported_at: new Date().toISOString(),
      count: preview.length,
      items: preview,
    });

    const marked = await markTicketsExported(preview.map((row) => row.id));
    setLoading(false);

    if (marked.error) {
      toast.error(`내보내기 표시 실패: ${marked.error}`);
      return;
    }
    if (marked.columnMissing) {
      toast.error(
        "파일은 받았지만 내보냄 표시는 남기지 못했습니다. 138번 마이그레이션이 필요합니다.",
      );
      return;
    }
    toast.success(`${preview.length}건을 내보냈습니다.`);
    onClose();
  }

  async function handleCopyPrompt() {
    if (!preview?.length) return;
    const payload = JSON.stringify({ items: preview }, null, 2);
    await navigator.clipboard.writeText(CURATION_PROMPT + payload);
    setCopied(true);
    toast.success("프롬프트와 데이터를 복사했습니다.");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <FormModal title="인입내역 내보내기" onClose={onClose} maxWidthClassName="max-w-2xl">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          기술지원 인입내역에 적힌 해결 절차를 파일로 받습니다. 정제를 마친 뒤{" "}
          <span className="font-semibold text-slate-800">정제 결과 가져오기</span>로 되돌려
          넣으세요. 가맹점 상호와 연락처는 파일에 담기지 않습니다.
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeExported}
            onChange={(event) => void load(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          이미 내보낸 건도 포함
        </label>

        {columnMissing && (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
            138번 마이그레이션이 아직 적용되지 않아 이미 내보낸 건을 구분할 수 없습니다. 지금은 해결
            절차가 있는 건 전부가 대상입니다.
          </div>
        )}

        <div className="rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            {loading ? "불러오는 중..." : `대상 ${preview?.length.toLocaleString() ?? 0}건`}
          </div>
          <div className="max-h-56 overflow-auto">
            {preview?.slice(0, 30).map((row) => (
              <div key={row.id} className="border-b border-slate-100 px-3 py-2 last:border-b-0">
                <div className="truncate text-[13px] font-medium text-slate-800">{row.inquiry}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{row.steps}</div>
              </div>
            ))}
            {preview?.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-slate-400">
                내보낼 해결 절차가 없습니다.
              </div>
            )}
            {(preview?.length ?? 0) > 30 && (
              <div className="px-3 py-2 text-center text-xs text-slate-400">
                외 {(preview!.length - 30).toLocaleString()}건
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleCopyPrompt}
            disabled={loading || !preview?.length}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            프롬프트째 복사
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={loading || !preview?.length}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Download size={14} />
            파일로 받기
          </button>
        </div>
      </div>
    </FormModal>
  );
}

interface ImportModalProps {
  onClose: () => void;
  onImported: (rows: ChatbotDataRow[]) => void;
}

function ImportModal({ onClose, onImported }: ImportModalProps) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed = text.trim() ? parseCurated(text) : null;

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setText(await file.text());
  }

  async function handleImport() {
    if (!parsed?.rows.length) return;
    setSaving(true);
    const result = await importCuratedRows(parsed.rows);
    setSaving(false);

    if (result.error) {
      toast.error(`가져오기 실패: ${result.error}`);
      return;
    }
    const count = result.inserted.length;
    if (result.sourceColumnMissing) {
      toast.success(`${count}건을 등록했습니다. (출처 기록은 138번 마이그레이션 후 저장됩니다)`);
    } else {
      toast.success(`${count}건을 등록했습니다.`);
    }
    onImported(result.inserted as unknown as ChatbotDataRow[]);
    onClose();
  }

  return (
    <FormModal title="정제 결과 가져오기" onClose={onClose} maxWidthClassName="max-w-2xl">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          정제해서 받은 JSON 파일을 올리거나 내용을 붙여넣으세요. 등록 전에 몇 건이 들어가는지
          확인할 수 있습니다.
        </p>

        <input
          type="file"
          accept=".json,.txt,application/json"
          onChange={handleFile}
          className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700"
        />

        <textarea
          rows={10}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder='{"items": [{"problem_situation": "...", "solution": "..."}]}'
          className="resize-none rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
        />

        {parsed?.error && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] text-red-700">
            {parsed.error}
          </div>
        )}
        {parsed && !parsed.error && (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700">
            등록할 항목{" "}
            <span className="font-semibold">{parsed.rows.length.toLocaleString()}건</span>
            {parsed.skipped > 0 && (
              <span className="text-slate-500">
                {" "}
                · 내용이 비어 건너뛴 항목 {parsed.skipped.toLocaleString()}건
              </span>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={saving || !parsed?.rows.length}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Upload size={14} />
            {saving ? "등록 중..." : "등록"}
          </button>
        </div>
      </div>
    </FormModal>
  );
}

interface Props {
  onImported: (rows: ChatbotDataRow[]) => void;
}

export default function ChatbotExportImport({ onImported }: Props) {
  const [mode, setMode] = useState<"export" | "import" | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setMode("export")}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Download size={14} />
        인입내역 내보내기
      </button>
      <button
        type="button"
        onClick={() => setMode("import")}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Upload size={14} />
        정제 결과 가져오기
      </button>

      {mode === "export" && <ExportModal onClose={() => setMode(null)} />}
      {mode === "import" && <ImportModal onClose={() => setMode(null)} onImported={onImported} />}
    </>
  );
}
