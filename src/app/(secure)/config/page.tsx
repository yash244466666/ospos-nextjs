import { requirePermission } from "@/lib/auth/with-permission";
import { getConfig, loadConfig } from "@/lib/config";
import { CONFIG_TABS } from "@/lib/config/tabs";
import { lang } from "@/lib/i18n/lang";
import ConfigTabs from "@/components/config/config-tabs";

export default async function ConfigPage() {
  await requirePermission("config");
  await loadConfig();
  const values: Record<string, string> = {};
  const secretsSet: Record<string, boolean> = {};
  for (const tab of CONFIG_TABS) {
    for (const field of tab.fields) {
      const raw = getConfig(field.key, "");
      if (field.encrypted) {
        secretsSet[field.key] = raw !== "";
        values[field.key] = "";
      } else {
        values[field.key] = raw;
      }
    }
  }
  const resolve = (label: string): string => {
    const translated = label.includes(".") ? lang(label) : label;
    if (translated !== label) return translated;
    return label
      .split(".")
      .pop()!
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };
  const tabs = CONFIG_TABS.map((tab) => ({
    ...tab,
    label: resolve(tab.label),
    fields: tab.fields.map((field) => ({
      ...field,
      label: resolve(field.label),
      options: field.options?.map((option) => ({
        ...option,
        label: resolve(option.label),
      })),
    })),
  }));
  return <ConfigTabs tabs={tabs} values={values} secretsSet={secretsSet} />;
}