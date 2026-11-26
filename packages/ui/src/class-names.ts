type ClassValue = string | false | null | undefined;

export function classNames(...values: ClassValue[]): string | undefined {
  const joined = values.filter(Boolean).join(" ");
  return joined || undefined;
}
