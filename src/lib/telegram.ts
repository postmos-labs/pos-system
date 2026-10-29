// 텔레그램 단체방 알림. 봇을 방에 초대하고 TELEGRAM_BOT_TOKEN · TELEGRAM_SURVEY_CHAT_ID를 넣으면 켜진다.
// 알림은 부가 기능이라 실패해도 던지지 않는다 — 고객 제출까지 실패로 만들면 안 된다.

export async function sendTelegramMessage(text: string, chatIdEnvKey = "TELEGRAM_SURVEY_CHAT_ID") {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env[chatIdEnvKey];
  if (!token || !chatId) {
    console.warn(`[telegram] 환경변수 미설정(TELEGRAM_BOT_TOKEN · ${chatIdEnvKey}) — 발송 스킵`);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error("[telegram] 발송 실패:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[telegram] 발송 오류:", e instanceof Error ? e.message : String(e));
    return false;
  }
}
