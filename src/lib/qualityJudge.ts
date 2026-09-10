// 인입내역 품질 판정 - 의미 판단이 필요한 다섯 항목은 DeepSeek에 맡기고, 나머지는 규칙(resolutionQuality.ts)이
// 본다. 결과는 티켓에 저장해 내용이 바뀔 때만 다시 부른다. 키가 없거나 호출이 실패하면 규칙으로 판정한다.
// 서버 전용 모듈 — node:crypto와 fetch를 쓴다.

import { createHash } from "node:crypto";
import {
  AI_JUDGED_CODES,
  inferProcedureKind,
  inspectMechanical,
  inspectTicket,
  issueByCode,
  maskPersonalInfo,
  STAFF_ONLY_SYSTEMS,
  type InspectInput,
  type ProcedureKind,
  type QualityIssue,
  type QualityIssueCode,
} from "./resolutionQuality";

export type { ProcedureKind } from "./resolutionQuality";

export const PROCEDURE_KIND_LABEL: Record<ProcedureKind, string> = {
  owner: "사장님 직접",
  staff: "고객센터 처리",
};

/** 판정 기준이 바뀌면 올린다. 해시에 섞여 있어 저장된 판정이 자동으로 무효가 된다. */
// 2: 절차를 owner/staff 두 종류로 나눠 판정하도록 바뀌어 저장된 판정을 전부 무효화한다.
export const JUDGE_VERSION = 2;

/** 기본 모델. 이 판정은 분류에 가까워 flash로 충분하다. 바꾸려면 DEEPSEEK_MODEL을 넣는다. */
const DEFAULT_MODEL = "deepseek-v4-flash";

export interface StoredVerdict {
  version: number;
  kind: ProcedureKind;
  passed: boolean;
  issues: QualityIssue[];
  /** 왜 걸렸는지 한 문장. 모델 판정일 때만 채워진다 */
  reason: string | null;
  /** 어떻게 고치면 되는지 한 문장 */
  suggestion: string | null;
  source: "ai" | "rule";
  judged_at: string;
}

const SYSTEM_PROMPT = `너는 포스 회사의 응대 기록을 검사한다. 이 회사는 사장님에게 방법을 가르쳐 스스로 하게 하는 것을 원칙으로 한다. 회사 전산이 있어야만 되는 일만 회사가 처리한다. 해결 절차는 챗봇이 사장님에게 그대로 읽어준다.

회사만 할 수 있는 일: ${STAFF_ONLY_SYSTEMS.join(", ")}. 이 밖의 일은 전부 사장님이 직접 할 수 있는 일로 본다. 유니온·아임유·플릭 ASP는 가맹점 계정으로 로그인되므로 사장님 일이다.

먼저 kind를 정한다.
- owner: 사장님이 화면에서 따라 할 순서다.
- staff: 회사만 할 수 있는 일이라 "고객센터에 요청" 형태로 적혀 있다. 요청 뒤 회사가 무엇을 하는지와 사장님이 할 확인이 있으면 좋다. 한 단계여도 된다.

그다음 아래 다섯 가지를 판정한다. 해당하면 코드를 codes에 넣는다.
- title_no_subject: 문의 내용에 무엇이 어떻게 되는지가 없어 검색 열쇠가 되지 못한다. 오타는 문제 삼지 않는다.
- remote_access: 직원이 원격으로 대신 처리한 단계가 있고, 그 일이 사장님도 할 수 있는 일이다. 사장님이 직접 누르는 화면 순서로 다시 써야 한다. 회사만 할 수 있는 일을 원격으로 한 것은 staff로 보고 여기 넣지 않는다.
- staff_system: 회사만 할 수 있는 일을 사장님이 직접 조작하게 적혀 있다. "고객센터에 요청"으로 적혀 있으면 해당하지 않는다.
- dangerous: 매출이나 설정이 지워질 수 있는 초기화, 포맷, 재설치를 사장님에게 시킨다. 임시 파일이나 캐시 정리는 해당하지 않는다.
- our_action: "전화로 안내함"처럼 회사가 한 행동만 적혀 있고 사장님이 따라 할 내용이 없다. 안내한 내용이 순서로 적혀 있으면 해당하지 않는다. "고객센터로 안내"처럼 마지막 안내 단계도 해당하지 않는다.

JSON만 출력한다. 형식은 {"kind": "owner", "codes": [], "reason": "", "suggestion": ""} 이다.
reason은 왜 걸렸는지 한 문장, suggestion은 사장님 시점으로 어떻게 고쳐 쓰면 되는지 한 문장이다. codes가 비면 둘 다 빈 문자열로 둔다.`;

export function qualityInputHash(title: string, steps: string): string {
  return createHash("sha1").update(`${JUDGE_VERSION}${title}${steps}`).digest("hex");
}

export function verdictFromRules(input: InspectInput): StoredVerdict {
  const issues = inspectTicket(input);
  return {
    version: JUDGE_VERSION,
    kind: inferProcedureKind(input.steps ?? ""),
    passed: issues.length === 0,
    issues,
    reason: null,
    suggestion: null,
    source: "rule",
    judged_at: new Date().toISOString(),
  };
}

export function verdictFromStored(value: unknown): StoredVerdict | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredVerdict>;
  if (candidate.version !== JUDGE_VERSION) return null;
  if (!Array.isArray(candidate.issues)) return null;
  if (!candidate.kind) return null;
  return candidate as StoredVerdict;
}

interface DeepseekJudgeResponse {
  kind?: string;
  codes?: string[];
  reason?: string;
  suggestion?: string;
}

export async function judgeTicketQuality(input: InspectInput): Promise<StoredVerdict> {
  if (!(input.steps ?? "").trim()) return verdictFromRules(input);

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return verdictFromRules(input);

  const title = maskPersonalInfo(input.title ?? "", input.businessName, input.ownerName);
  const steps = maskPersonalInfo(input.steps ?? "", input.businessName, input.ownerName);
  const userContent = `문의 내용: ${title}\n\n해결 절차:\n${steps}`;

  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`qualityJudge: deepseek 응답 실패 (${res.status})`);
      return verdictFromRules(input);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed: DeepseekJudgeResponse = JSON.parse(content);

    const kind: ProcedureKind = parsed.kind === "staff" ? "staff" : "owner";
    const codes = (parsed.codes ?? []).filter((code): code is QualityIssueCode =>
      AI_JUDGED_CODES.includes(code as QualityIssueCode),
    );
    const suggestion = parsed.suggestion || null;
    const reason = parsed.reason || null;

    const aiIssues: QualityIssue[] = codes.map((code) => {
      const issue = issueByCode(code);
      return suggestion ? { ...issue, message: `${issue.message} ${suggestion}` } : issue;
    });

    const mechanicalIssues = inspectMechanical(input).filter(
      (issue) => !(kind === "staff" && issue.code === "too_few_steps"),
    );
    const seen = new Set<QualityIssueCode>();
    const issues: QualityIssue[] = [];
    for (const issue of [...aiIssues, ...mechanicalIssues]) {
      if (seen.has(issue.code)) continue;
      seen.add(issue.code);
      issues.push(issue);
    }

    return {
      version: JUDGE_VERSION,
      kind,
      passed: issues.length === 0,
      issues,
      reason,
      suggestion,
      source: "ai",
      judged_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("qualityJudge: deepseek 호출 실패", err);
    return verdictFromRules(input);
  }
}
