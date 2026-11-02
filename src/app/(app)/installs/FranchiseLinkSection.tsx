"use client";

import { useState } from "react";
import { format } from "date-fns";
import { formatPhone } from "@/lib/format";
import { FRANCHISE_STATUS_LABEL } from "@/types";
import { useToast } from "@/components/ui/Toast";
import { linkInstallationToFranchise, searchLinkableFranchises } from "./actions";
import type { Installation } from "./InstallsClient";

interface Props {
  installationId: string;
  onLinked: (franchiseId: string, franchise: NonNullable<Installation["franchise"]>) => void;
}

interface Row {
  id: string;
  business_name: string | null;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
  linkable: boolean;
  blockedReason: string | null;
}

const inputClass =
  "border-border bg-card text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/30 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2";
const secondaryButton =
  "focus-visible:ring-primary/30 border-border bg-card text-foreground hover:bg-muted inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";

export default function FranchiseLinkSection({ installationId, onLinked }: Props) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (busy) return;
    setBusy(true);
    const result = await searchLinkableFranchises(query);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setRows(result.rows as Row[]);
  }

  async function link(row: Row) {
    const name = row.business_name || row.owner_name || "미입력";
    if (
      !window.confirm(
        `[${name}] 가맹접수와 연결할까요?\n\n연결하면 되돌릴 수 없고, 가맹점 화면에 이 설치건이 함께 표시됩니다.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await linkInstallationToFranchise({
      installationId,
      franchiseApplicationId: row.id,
    });
    setBusy(false);
    if (result.error || !result.franchise) {
      toast.error(result.error ?? "연결에 실패했습니다.");
      return;
    }
    onLinked(row.id, result.franchise);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-foreground text-[13px] font-bold">가맹접수 연결</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          가맹접수를 거치지 않고 등록한 건입니다. 같은 가맹점의 접수를 찾아 연결하세요.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={query}
          placeholder="상호명 · 대표자 · 전화번호"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className={secondaryButton} onClick={search} disabled={busy}>
          검색
        </button>
      </div>
      {rows &&
        (rows.length === 0 ? (
          <p className="text-muted-foreground py-3 text-center text-sm">검색 결과가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="border-border flex items-start justify-between gap-3 rounded-lg border p-2.5"
              >
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-bold break-words">
                    {row.business_name || "미입력"}
                  </p>
                  <p className="text-muted-foreground text-xs break-words">
                    {[row.owner_name, row.phone ? formatPhone(row.phone) : null, row.address]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {FRANCHISE_STATUS_LABEL[row.status as keyof typeof FRANCHISE_STATUS_LABEL] ??
                      row.status}{" "}
                    · {format(new Date(row.created_at), "yyyy-MM-dd")}
                  </p>
                </div>
                {row.linkable ? (
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => link(row)}
                    disabled={busy}
                  >
                    연결
                  </button>
                ) : (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {row.blockedReason}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
