export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

export function imageExtension(contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/avif":
      return "avif";
    default:
      return "webp";
  }
}

export function emailErrorMessage(error: unknown, fallback: string) {
  return (error instanceof Error ? error.message : fallback)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
