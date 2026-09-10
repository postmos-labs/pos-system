// 인입내역 품질 판정 - 의미 판단이 필요한 다섯 항목은 DeepSeek에 맡기고, 나머지는 규칙(resolutionQuality.ts)이
// 본다. 결과는 티켓에 저장해 내용이 바뀔 때만 다시 부른다. 키가 없거나 호출이 실패하면 규칙으로 판정한다.
// 서버 전용 모듈 — node:crypto와 fetch를 쓴다.

import { createHash } from "node:crypto";
import {
  AI_JUDGED_CODES,
  inspectMechanical,
  inspectTicket,
  issueByCode,
  maskPersonalInfo,
  type InspectInput,
  type QualityIssue,
  type QualityIssueCode,
} from "./resolutionQuality";

/** 판정 기준이 바뀌면 올린다. 해시에 섞여 있어 저장된 판정이 자동으로 무효가 된다. */
export const JUDGE_VERSION = 1;

export interface StoredVerdict {
  version: number;
  passed: boolean;
  issues: QualityIssue[];
  /** 왜 걸렸는지 한 문장. 모델 판정일 때만 채워진다 */
  reason: string | null;
  /** 어떻게 고치면 되는지 한 문장 */
  suggestion: string | null;
  source: "ai" | "rule";
  judged_at: string;
}

const SYSTEM_PROMPT = `너는 포스 고객센터의 응대 기록을 검사한다. 해결 절차는 챗봇이 가맹점 사장님에게 그대로 읽어준다.
아래 다섯 가지만 판정한다. 해당하는 것이 있으면 그 코드를 codes에 넣는다.
- title_no_subject: 문의 내용에 무엇이 어떻게 되는지가 없어 검색 열쇠가 되지 못한다. 오타는 문제 삼지 않는다.
- remote_access: 직원이 원격으로 접속해 처리한 단계가 절차에 있다. 사장님이 원격 지원을 요청하는 표현은 해당하지 않는다.
- staff_system: 밴 전산, KOCES 전산, 토스 파트너스처럼 직원만 들어갈 수 있는 전산을 사장님이 조작하게 적혀 있다. 고객센터에 요청하라는 표현은 해당하지 않는다. 쿠팡이츠 파트너스 앱은 사장님이 쓰는 앱이라 해당하지 않는다.
- dangerous: 매출이나 설정이 지워질 수 있는 초기화, 포맷, 재설치를 사장님에게 시킨다. 임시 파일이나 캐시 정리는 해당하지 않는다.
- our_action: 유선으로 안내드림처럼 우리가 한 행동이 절차에 적혀 있다. 고객센터로 안내처럼 마지막 안내 단계는 해당하지 않는다.
JSON만 출력한다. 형식은 {"codes": [], "reason": "", "suggestion": ""} 이다.
reason은 왜 걸렸는지 한 문장, suggestion은 어떻게 고치면 되는지 한 문장이다. codes가 비면 둘 다 빈 문자열로 둔다.`;

export function qualityInputHash(title: string, steps: string): string {
  return createHash("sha1").update(`${JUDGE_VERSION}${title}${steps}`).digest("hex");
}

export function verdictFromRules(input: InspectInput): StoredVerdict {
  const issues = inspectTicket(input);
  return {
    version: JUDGE_VERSION,
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
  return candidate as StoredVerdict;
}

interface DeepseekJudgeResponse {
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
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
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

    const codes = (parsed.codes ?? []).filter((code): code is QualityIssueCode =>
      AI_JUDGED_CODES.includes(code as QualityIssueCode),
    );
    const suggestion = parsed.suggestion || null;
    const reason = parsed.reason || null;

    const aiIssues: QualityIssue[] = codes.map((code) => {
      const issue = issueByCode(code);
      return suggestion ? { ...issue, message: `${issue.message} ${suggestion}` } : issue;
    });

    const mechanicalIssues = inspectMechanical(input);
    const seen = new Set<QualityIssueCode>();
    const issues: QualityIssue[] = [];
    for (const issue of [...aiIssues, ...mechanicalIssues]) {
      if (seen.has(issue.code)) continue;
      seen.add(issue.code);
      issues.push(issue);
    }

    return {
      version: JUDGE_VERSION,
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
