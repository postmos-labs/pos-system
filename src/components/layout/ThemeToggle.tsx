"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Sparkles, type LucideIcon } from "lucide-react";

type Theme = "light" | "dark" | "pink";

const THEME_KEYS: Theme[] = ["light", "dark", "pink"];
const THEME_CHANGE_EVENT = "pos:theme-change";

const THEMES: { key: Theme; label: string; icon: LucideIcon }[] = [
  { key: "light", label: "라이트", icon: Sun },
  { key: "dark", label: "다크", icon: Moon },
  { key: "pink", label: "핑크", icon: Sparkles },
];

function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem("theme");
    return THEME_KEYS.includes(v as Theme) ? (v as Theme) : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch {}
  // 같은 페이지에 동시에 마운트된 다른 ThemeToggle 인스턴스(헤더 팝오버 vs 모바일 하단바)에 알려 동기화한다.
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("light");

  // MobileNav에서는 이 컴포넌트가 SSR되므로 localStorage를 렌더 중에 읽을 수 없다.
  // 마운트 후에 실제 값으로 동기화해 서버/클라이언트 첫 렌더 결과를 일치시킨다.
  useEffect(() => {
    const saved = readStoredTheme();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage는 SSR에서 읽을 수 없어 마운트 후 동기화가 불가피함
    setTheme(saved);
    applyTheme(saved);

    function handleThemeChange(e: Event) {
      const detail = (e as CustomEvent<Theme>).detail;
      if (detail) setTheme(detail);
    }
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  }, []);

  function select(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  return (
    <div
      className={`flex items-center gap-1 bg-slate-100 rounded-xl p-1 ${compact ? "" : "w-full"}`}
    >
      {THEMES.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => select(t.key)}
          title={t.label}
          className={`flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all ${
            compact ? "w-8 h-8" : "flex-1 py-2"
          } ${
            theme === t.key
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
        >
          <t.icon size={14} />
          {!compact && t.label}
        </button>
      ))}
    </div>
  );
}
