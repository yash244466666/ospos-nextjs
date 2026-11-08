import { LoginForm } from "@/components/auth/login-form";
import { getConfig, loadConfig } from "@/lib/config";
import { lang } from "@/lib/i18n/lang";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await loadConfig();
  return (
    <LoginForm
      company={getConfig("company")}
      labels={{
        login: lang("Login.login"),
        username: lang("Login.username"),
        password: lang("Login.password"),
        invalid: lang("Login.invalid_username_and_password"),
        tooMany: lang("Login.too_many_attempts"),
        welcome: lang("Login.welcome", { 0: "OSPOS" }),
      }}
    />
  );
}
