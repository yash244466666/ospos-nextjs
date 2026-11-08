import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPassword } from "./password";
import { getMenuGroup } from "./rbac";
import { createAppSession, requestIp } from "@/lib/session";
import { loadConfig } from "@/lib/config";
import { isLoginBlocked, recordLoginFailure, recordLoginSuccess } from "./throttle";

const allowedHostnamesRaw = process.env.ALLOWED_HOSTNAMES;
if (
  process.env.NODE_ENV === "production" &&
  !allowedHostnamesRaw &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  throw new Error(
    "ALLOWED_HOSTNAMES env is required in production (GHSA-jchf-7hr6-h4f3 mitigation).",
  );
}

export const config = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 7200 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        await loadConfig();
        const username = credentials?.username as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!username || !password) return null;
        const ip = requestIp(request);
        if (isLoginBlocked(ip, username)) return null;
        const user = await verifyPassword(username, password);
        if (!user) {
          recordLoginFailure(ip, username);
          return null;
        }
        recordLoginSuccess(ip, username);
        // CI4 regenerates the session id on login; a fresh app session row has
        // no cart state, which is the observable effect of that regeneration.
        const appSessionId = await createAppSession(user.personId, ip);
        const menuGroup = await getMenuGroup("home", user.personId);
        return {
          id: String(user.personId),
          name: user.username,
          personId: user.personId,
          language: user.language ?? "english",
          languageCode: user.languageCode ?? "en",
          appSessionId,
          sessionIp: ip,
          menuGroup,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const typed = user as {
          personId?: number;
          language?: string;
          languageCode?: string;
          appSessionId?: string;
          sessionIp?: string;
          menuGroup?: string;
        };
        token.personId = typed.personId;
        token.language = typed.language;
        token.languageCode = typed.languageCode;
        token.appSessionId = typed.appSessionId;
        token.sessionIp = typed.sessionIp;
        token.menuGroup = typed.menuGroup;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const typed = token as {
          personId?: number;
          language?: string;
          languageCode?: string;
          appSessionId?: string;
          sessionIp?: string;
          menuGroup?: string;
        };
        session.user.personId = typed.personId;
        session.user.language = typed.language;
        session.user.languageCode = typed.languageCode;
        session.user.appSessionId = typed.appSessionId;
        session.user.sessionIp = typed.sessionIp;
        session.user.menuGroup = typed.menuGroup;
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
      appSessionId?: string;
      sessionIp?: string;
      menuGroup?: string;
    };
  }
  interface User {
    personId?: number;
    language?: string;
    languageCode?: string;
    appSessionId?: string;
    sessionIp?: string;
    menuGroup?: string;
  }
}
