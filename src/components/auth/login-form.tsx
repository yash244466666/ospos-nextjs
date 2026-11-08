"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Store, Loader2, Lock, User } from "lucide-react";

export interface LoginLabels {
  login: string;
  username: string;
  password: string;
  invalid: string;
  tooMany: string;
  welcome: string;
}

export function LoginForm({ labels, company }: { labels: LoginLabels; company: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.code === "throttled") {
      setError(labels.tooMany);
      return;
    }
    if (res?.error) {
      setError(labels.invalid);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-[var(--color-border)] overflow-hidden text-slate-900">
        <div className="h-2 bg-[var(--color-accent)]" />
        <div className="p-8 pt-10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center shadow-md">
              <Store className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold mb-1 text-center text-slate-900 tracking-tight">
            {labels.welcome}
          </h1>
          <p className="text-sm text-center text-slate-500 mb-8">{company}</p>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-700">
                {labels.username}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  data-testid="login-username"
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  placeholder={labels.username}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-700">
                {labels.password}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="login-password"
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  placeholder="••••••••"
                />
              </div>
            </div>
            {error && (
              <div
                className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-lg"
                data-testid="login-error"
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className="w-full bg-[var(--color-accent)] hover:bg-emerald-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {labels.login}
                </>
              ) : (
                labels.login
              )}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
