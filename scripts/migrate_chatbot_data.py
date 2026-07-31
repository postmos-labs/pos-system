"""챗봇 데이터 수집 탭(chatbot_training_data) CSV 마이그레이션 스크립트.

CSV 컬럼: 날짜, 담당자, 상호명, 연락처, 문제상황, 해결방안

사용 전 준비:
  1. supabase/093_chatbot_training_data_source_fields_migration.sql 을
     dev Supabase 프로젝트 SQL Editor에서 먼저 실행할 것.
  2. 환경변수 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정
     (.env 파일이 있으면 자동으로 읽음. docs/dev-environment.md 참고)
  3. pip install requests  (이미 있으면 생략)

실행 (기본은 dry-run — 실제로 DB에 쓰지 않고 검증만 함):
  python scripts/migrate_chatbot_data.py "C:\\Users\\han\\Downloads\\고객관리대장CRM - 기술지원 (4).csv"

실제 반영:
  python scripts/migrate_chatbot_data.py "<csv경로>" --apply

담당자 이름이 profiles.name 과 매칭되지 않는 행은 기본적으로 건너뛰고 목록을
출력한다. 전부 매칭시킨 뒤에 --apply 하는 것을 권장.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover
    print("requests 패키지가 필요합니다: pip install requests", file=sys.stderr)
    sys.exit(1)

REQUIRED_HEADERS = ["날짜", "담당자", "상호명", "연락처", "문제상황", "해결방안"]
BATCH_SIZE = 50


def load_env_file(repo_root: Path) -> None:
    """.env 파일이 있으면 os.environ 에 채워 넣는다 (이미 설정된 값은 덮어쓰지 않음)."""
    env_path = repo_root / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.replace("\r", " ").replace("\n", " ").replace("\t", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def parse_date(value: str | None) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    for fmt in ("%Y.%m.%d", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    print(f"  [경고] 날짜 파싱 실패, 비워둠: {text!r}", file=sys.stderr)
    return None


def normalize_phone(value: str | None) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    digits = re.sub(r"\D", "", text)
    if not digits:
        return text
    # 엑셀에서 숫자로 취급되며 앞자리 0이 소실된 휴대폰번호 복구 (예: 1012345678 -> 01012345678)
    if digits.startswith("1") and len(digits) == 10:
        digits = "0" + digits
    if len(digits) == 11 and digits.startswith("010"):
        return f"{digits[0:3]}-{digits[3:7]}-{digits[7:11]}"
    return digits


@dataclass
class Row:
    line_no: int
    occurred_at: str | None
    agent_name: str | None
    company_name: str | None
    phone: str | None
    problem_situation: str
    solution: str


def read_csv(csv_path: Path) -> list[Row]:
    raw_bytes = csv_path.read_bytes()
    for encoding in ("utf-8-sig", "cp949"):
        try:
            text = raw_bytes.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise RuntimeError("CSV 인코딩을 판별하지 못했습니다 (utf-8-sig / cp949 실패)")

    reader = csv.reader(text.splitlines(keepends=True))
    header = next(reader)
    header = [h.strip() for h in header]
    if header != REQUIRED_HEADERS:
        print(f"[경고] 헤더가 예상과 다릅니다: {header}", file=sys.stderr)

    rows: list[Row] = []
    skipped_empty = 0
    for line_no, record in enumerate(reader, start=2):
        if not record or all(not (c or "").strip() for c in record):
            continue
        record = (record + [""] * 6)[:6]
        date_raw, agent_raw, company_raw, phone_raw, problem_raw, solution_raw = record

        problem_situation = clean_text(problem_raw)
        solution = clean_text(solution_raw)
        if not problem_situation or not solution:
            skipped_empty += 1
            continue

        rows.append(
            Row(
                line_no=line_no,
                occurred_at=parse_date(date_raw),
                agent_name=clean_text(agent_raw),
                company_name=clean_text(company_raw),
                phone=normalize_phone(phone_raw),
                problem_situation=problem_situation,
                solution=solution,
            )
        )

    print(f"CSV 총 {len(rows)}건 파싱 완료 (문제상황/해결방안 누락으로 제외: {skipped_empty}건)")
    return rows


def fetch_profiles(base_url: str, service_key: str) -> dict[str, str]:
    resp = requests.get(
        f"{base_url}/rest/v1/profiles",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
        },
        params={"select": "id,name"},
        timeout=30,
    )
    resp.raise_for_status()
    name_to_id: dict[str, str] = {}
    for profile in resp.json():
        name_to_id[profile["name"]] = profile["id"]
    return name_to_id


def insert_batch(base_url: str, service_key: str, payload: list[dict]) -> None:
    resp = requests.post(
        f"{base_url}/rest/v1/chatbot_training_data",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=payload,
        timeout=60,
    )
    if resp.status_code >= 300:
        raise RuntimeError(f"삽입 실패 ({resp.status_code}): {resp.text}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", type=Path, help="CS 대응 기록 CSV 경로")
    parser.add_argument("--apply", action="store_true", help="실제로 DB에 반영 (기본은 dry-run)")
    parser.add_argument(
        "--batch-size", type=int, default=BATCH_SIZE, help=f"배치 크기 (기본 {BATCH_SIZE})"
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    load_env_file(repo_root)

    base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        print(
            "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.",
            file=sys.stderr,
        )
        sys.exit(1)

    rows = read_csv(args.csv_path)

    print("profiles 조회 중...")
    name_to_id = fetch_profiles(base_url, service_key)

    matched: list[dict] = []
    unmatched_names: dict[str, int] = {}
    no_agent = 0

    for row in rows:
        if not row.agent_name:
            no_agent += 1
            continue
        profile_id = name_to_id.get(row.agent_name)
        if not profile_id:
            unmatched_names[row.agent_name] = unmatched_names.get(row.agent_name, 0) + 1
            continue
        entry = {
            "problem_situation": row.problem_situation,
            "solution": row.solution,
            "company_name": row.company_name,
            "phone": row.phone,
            "registered_by": profile_id,
            "registrant_name": row.agent_name,
        }
        # CSV의 원래 날짜를 등록일(created_at)로 그대로 사용한다.
        # (없는 몇 건은 DB 기본값인 삽입 시각으로 남겨둔다.)
        if row.occurred_at:
            entry["created_at"] = f"{row.occurred_at}T09:00:00+09:00"
        matched.append(entry)

    print(f"담당자 미기재로 제외: {no_agent}건")
    if unmatched_names:
        print("담당자명이 profiles.name 과 매칭되지 않아 제외된 건:")
        for name, count in sorted(unmatched_names.items()):
            print(f"  - {name}: {count}건")
    print(f"삽입 대상: {len(matched)}건")

    if not args.apply:
        print("\n[dry-run] 실제 삽입은 하지 않았습니다. 문제 없으면 --apply 로 재실행하세요.")
        if matched:
            print("샘플 1건:")
            print(matched[0])
        return

    if not matched:
        print("삽입할 데이터가 없습니다.")
        return

    inserted = 0
    for i in range(0, len(matched), args.batch_size):
        batch = matched[i : i + args.batch_size]
        insert_batch(base_url, service_key, batch)
        inserted += len(batch)
        print(f"{inserted}/{len(matched)} 완료")

    print("마이그레이션 완료!")


if __name__ == "__main__":
    main()
