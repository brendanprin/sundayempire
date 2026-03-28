export function formatEnumLabel(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value
    .split(/[_\s./-]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z0-9]{1,3}$/.test(part)) {
        return part;
      }

      return `${part.charAt(0)}${part.slice(1).toLowerCase()}`;
    })
    .join(" ");
}
