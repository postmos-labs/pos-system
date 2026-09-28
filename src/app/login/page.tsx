"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 계정 찾기와 비밀번호 로그인을 서버가 한 번에 처리하고 로그인 쿠키를 응답에 실어 준다.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "이름 또는 비밀번호가 올바르지 않습니다.");
        setLoading(false);
        return;
      }

      // 보호된 화면에서 넘어왔으면 그 화면으로 돌려보낸다(링크를 다시 누르지 않아도 되게).
      // 바깥 주소로 튕기지 않도록 우리 사이트 안의 경로만 허용한다.
      // 그 외에는 서버가 정해 준 첫 화면으로 바로 간다 — "/"를 거쳐 한 번 더 넘기지 않는다.
      // 새 화면은 쿠키를 들고 새로 그려지므로 router.refresh()로 한 번 더 그릴 필요가 없다.
      const next = new URLSearchParams(window.location.search).get("next");
      const dest =
        next && next.startsWith("/") && !next.startsWith("//") ? next : (data.home ?? "/dashboard");
      // 이동이 끝날 때까지 "로그인 중..."을 유지해 버튼을 두 번 누르지 않게 한다.
      router.replace(dest);
    } catch {
      setError("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">P</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">포스모스 POSMOS 전산</h1>
          <p className="text-slate-500 mt-1 text-sm">이름과 비밀번호로 로그인하세요</p>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              비밀번호 <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p
              role="alert"
              aria-live="assertive"
              className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          비밀번호를 잊으셨나요? 관리자에게 문의하세요
        </p>
      </div>
    </div>
  );
}
