import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "./password";

const allowedHostnamesRaw = process.env.ALLOWED_HOSTNAMES;
if (process.env.NODE_ENV === "production" && !allowedHostnamesRaw) {
  throw new Error(
    "ALLOWED_HOSTNAMES env is required in production (GHSA-jchf-7hr6-h4f3 mitigation).",
  );
}

export const config = {
  trustHost: true,
  ...(allowedHostnamesRaw
    ? { allowedHostnames: allowedHostnamesRaw.split(",").map((h) => h.trim()).filter(Boolean) }
    : {}),
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const username = creds?.username as string | undefined;
        const password = creds?.password as string | undefined;
        if (!username || !password) return null;
        const user = await verifyPassword(username, password);
        if (!user) return null;
        return {
          id: String(user.personId),
          name: user.username,
          personId: user.personId,
          language: user.language ?? "english",
          languageCode: user.languageCode ?? "en",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.personId = (user as any).personId;
        token.language = (user as any).language;
        token.languageCode = (user as any).languageCode;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).personId = token.personId;
        (session.user as any).language = token.language;
        (session.user as any).languageCode = token.languageCode;
      }
      return session;
    },
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      if (path === "/login" || path.startsWith("/api/auth") || path.startsWith("/api/migrate")) {
        return true;
      }
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;

export const { auth, handlers, signIn, signOut } = NextAuth(config);

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      personId?: number;
      language?: string;
      languageCode?: string;
    };
  }
  interface User {
    personId?: number;
    language?: string;
    languageCode?: string;
  }
}

import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface JWT extends DefaultJWT {
    personId?: number;
    language?: string;
    languageCode?: string;
  }
}