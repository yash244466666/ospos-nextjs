"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Store, Loader2, Lock, User } from "lucide-react";

export default function LoginPage() {
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
    if (res?.error) {
      setError("Invalid username or password");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-muted)] px-4"
    >
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-[var(--color-border)] overflow-hidden text-slate-900"
      >
        <div className="h-2 bg-[var(--color-accent)]" />
        <div className="p-8 pt-10">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center shadow-md"
            >
              <Store className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold mb-1 text-center text-slate-900 tracking-tight"
          >Welcome back</h1>
          <p className="text-sm text-center text-slate-500 mb-8"
          >Sign in to OSPOS to manage your store</p>

          <form onSubmit={onSubmit} className="space-y-5"
          >
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-700"
              >Username</label>
              <div className="relative"
              >
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  placeholder="admin"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-slate-700"
              >Password</label>
              <div className="relative"
              >
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
                  placeholder="••••••••"
                />
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-lg"
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[var(--color-accent)] hover:bg-emerald-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
          <p className="mt-6 text-xs text-center text-slate-500"
          >
            Default credentials: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">admin</code> /{" "}
            <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">pointofsale</code>
          </p>
        </div>
      </div>
    </main>
  );
}
