const isPreview =
  process.env.NODE_ENV === "development" ||
  process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

export const pageTitlePrefix = isPreview ? "[Preview] " : "";
