import { requirePermission } from "@/lib/auth/with-permission";
import { getConfig } from "@/lib/config";
import { CONFIG_TABS } from "@/lib/config/tabs";
import { decrypt } from "@/lib/encryption";
import ConfigTabs from "@/components/config/config-tabs";

export default async function ConfigPage() {
  await requirePermission("config");
  const values: Record<string, string> = {};
  const encryptedValues: Record<string, string> = {};
  for (const tab of CONFIG_TABS) {
    for (const field of tab.fields) {
      const raw = getConfig(field.key, "");
      if (field.encrypted) {
        try { encryptedValues[field.key] = raw ? decrypt(raw) : ""; } catch { encryptedValues[field.key] = ""; }
      } else {
        values[field.key] = raw;
      }
    }
  }
  return <ConfigTabs tabs={CONFIG_TABS} values={values} encryptedValues={encryptedValues} />;
}