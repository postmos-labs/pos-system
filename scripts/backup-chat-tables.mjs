import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TABLES = [
  "dm_rooms",
  "dm_messages",
  "messages",
  "group_chat_rooms",
  "group_chat_members",
  "group_chat_messages",
  "chat_room_reads",
];

async function fetchAll(table) {
  const pageSize = 1000;
  let from = 0;
  const all = [];
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) {
      if (error.code === "PGRST103") break;
      console.error(`  ! ${table}: ${error.message} (${error.code})`);
      return null;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = `backups/chat-${stamp}`;
  mkdirSync(dir, { recursive: true });

  for (const table of TABLES) {
    const rows = await fetchAll(table);
    if (rows === null) continue;
    writeFileSync(`${dir}/${table}.json`, JSON.stringify(rows, null, 2));
    console.log(`  ${table}: ${rows.length}건 백업 완료`);
  }
  console.log(`\n백업 위치: ${dir}`);
}

main();
