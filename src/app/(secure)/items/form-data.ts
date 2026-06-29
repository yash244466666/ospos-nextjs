export function parseFormDataEntries(formData: FormData) {
  const grouped = new Map<string, FormDataEntryValue[]>();

  for (const [key, value] of formData.entries()) {
    const existing = grouped.get(key);
    if (existing) {
      existing.push(value);
    } else {
      grouped.set(key, [value]);
    }
  }

  const parsed: Record<string, unknown> = {};
  for (const [key, values] of grouped) {
    if (key === "taxes" || key === "quantities") {
      parsed[key] = values.flatMap((value) => {
        if (typeof value !== "string") {
          return [value];
        }

        const trimmed = value.trim();
        if (!trimmed) {
          return [];
        }

        try {
          const parsedValue = JSON.parse(trimmed);
          return Array.isArray(parsedValue) ? parsedValue : [parsedValue];
        } catch {
          return [value];
        }
      });
    } else {
      parsed[key] = values[0];
    }
  }

  return parsed;
}
