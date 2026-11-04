import { v } from "convex/values";

const automaticThemeValidator = v.object({
  mode: v.literal("automatic"),
  primary: v.string(),
  foreground: v.string(),
  background: v.string(),
});

const customThemeValidator = v.object({
  mode: v.literal("custom"),
  primary: v.string(),
  primaryForeground: v.string(),
  foreground: v.string(),
  background: v.string(),
  surface: v.string(),
  muted: v.string(),
  mutedForeground: v.string(),
  accent: v.string(),
  border: v.string(),
});

export const organizationThemeValidator = v.union(
  automaticThemeValidator,
  customThemeValidator,
);

export type OrganizationTheme =
  | {
      mode: "automatic";
      primary: string;
      foreground: string;
      background: string;
    }
  | {
      mode: "custom";
      primary: string;
      primaryForeground: string;
      foreground: string;
      background: string;
      surface: string;
      muted: string;
      mutedForeground: string;
      accent: string;
      border: string;
    };

export const defaultOrganizationTheme: OrganizationTheme = {
  mode: "automatic",
  primary: "#4F46E5",
  foreground: "#18181B",
  background: "#FFFFFF",
};

const hexPattern = /^#[0-9A-F]{6}$/;

function toRgb(color: string) {
  return {
    red: Number.parseInt(color.slice(1, 3), 16),
    green: Number.parseInt(color.slice(3, 5), 16),
    blue: Number.parseInt(color.slice(5, 7), 16),
  };
}

function toHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function mix(from: string, to: string, amount: number) {
  const start = toRgb(from);
  const end = toRgb(to);
  return toHex(
    start.red + (end.red - start.red) * amount,
    start.green + (end.green - start.green) * amount,
    start.blue + (end.blue - start.blue) * amount,
  );
}

function luminance(color: string) {
  const { red, green, blue } = toRgb(color);
  const channels = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function getContrastRatio(first: string, second: string) {
  if (!hexPattern.test(first) || !hexPattern.test(second)) return 0;
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function readableColor(
  preferred: string,
  background: string,
  alternative: string,
) {
  return getContrastRatio(preferred, background) >= 4.5
    ? preferred
    : alternative;
}

function bestTextColor(background: string, first: string, second: string) {
  return getContrastRatio(first, background) >=
    getContrastRatio(second, background)
    ? first
    : second;
}

export function normalizeOrganizationTheme(
  theme: OrganizationTheme,
): OrganizationTheme {
  return Object.fromEntries(
    Object.entries(theme).map(([key, value]) => [
      key,
      key === "mode" ? value : value.toUpperCase(),
    ]),
  ) as OrganizationTheme;
}

export function getOrganizationThemeError(theme: OrganizationTheme) {
  const colors = Object.entries(theme).filter(([key]) => key !== "mode");
  if (colors.some(([, color]) => !hexPattern.test(color))) {
    return "Alle farver skal angives som en gyldig hex-farve, f.eks. #4F46E5.";
  }
  if (getContrastRatio(theme.foreground, theme.background) < 4.5) {
    return "Tekst og baggrund skal have en kontrast på mindst 4,5:1.";
  }
  if (theme.mode === "custom") {
    if (getContrastRatio(theme.primaryForeground, theme.primary) < 4.5) {
      return "Teksten på primærfarven skal have en kontrast på mindst 4,5:1.";
    }
    if (getContrastRatio(theme.foreground, theme.surface) < 4.5) {
      return "Tekst og kortflader skal have en kontrast på mindst 4,5:1.";
    }
    if (getContrastRatio(theme.mutedForeground, theme.muted) < 4.5) {
      return "Dæmpet tekst og dæmpede flader skal have en kontrast på mindst 4,5:1.";
    }
    if (getContrastRatio(theme.foreground, theme.accent) < 4.5) {
      return "Tekst og fremhævningsfarve skal have en kontrast på mindst 4,5:1.";
    }
  }
  return null;
}


function rotateHue(hex: string, degrees: number) {
  const [r, g, b] = [1, 3, 5].map((index) =>
    Number.parseInt(hex.slice(index, index + 2), 16),
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  const delta = max - min;
  const saturation =
    delta === 0 ? 0 : delta / (255 - Math.abs(max + min - 255));
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  hue = (((hue + degrees) % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const [rr, gg, bb] =
    hue < 60 ? [chroma, x, 0]
    : hue < 120 ? [x, chroma, 0]
    : hue < 180 ? [0, chroma, x]
    : hue < 240 ? [0, x, chroma]
    : hue < 300 ? [x, 0, chroma]
    : [chroma, 0, x];
  const channel = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${channel(rr)}${channel(gg)}${channel(bb)}`;
}

export function resolveOrganizationTheme(theme: OrganizationTheme) {
  const primary = theme.primary;
  const foreground = theme.foreground;
  const background = theme.background;
  const primaryForeground =
    theme.mode === "custom"
      ? theme.primaryForeground
      : bestTextColor(primary, foreground, background);
  const surface = theme.mode === "custom" ? theme.surface : background;
  const muted =
    theme.mode === "custom" ? theme.muted : mix(background, foreground, 0.04);
  const mutedForeground =
    theme.mode === "custom"
      ? theme.mutedForeground
      : readableColor(mix(foreground, background, 0.32), muted, foreground);
  const accent =
    theme.mode === "custom" ? theme.accent : mix(background, primary, 0.09);
  const accentForeground = readableColor(
    foreground,
    accent,
    primaryForeground,
  );
  const border =
    theme.mode === "custom" ? theme.border : mix(background, foreground, 0.11);
  const secondary = mix(background, foreground, 0.05);
  const sidebar = mix(background, foreground, 0.02);

  return {
    background,
    foreground,
    card: surface,
    cardForeground: foreground,
    popover: surface,
    popoverForeground: foreground,
    primary,
    primaryForeground,
    secondary,
    secondaryForeground: foreground,
    muted,
    mutedForeground,
    accent,
    accentForeground,
    border,
    input: border,
    ring: primary,
    chart1: primary,
    chart2: rotateHue(primary, 70),
    chart3: rotateHue(primary, 145),
    chart4: rotateHue(primary, 215),
    chart5: rotateHue(primary, 290),
    sidebar,
    sidebarForeground: foreground,
    sidebarPrimary: primary,
    sidebarPrimaryForeground: primaryForeground,
    sidebarAccent: accent,
    sidebarAccentForeground: accentForeground,
    sidebarBorder: border,
    sidebarRing: primary,
  };
}

export function getOrganizationThemeCssVariables(theme: OrganizationTheme) {
  const colors = resolveOrganizationTheme(theme);
  return {
    "--background": colors.background,
    "--foreground": colors.foreground,
    "--card": colors.card,
    "--card-foreground": colors.cardForeground,
    "--popover": colors.popover,
    "--popover-foreground": colors.popoverForeground,
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--secondary": colors.secondary,
    "--secondary-foreground": colors.secondaryForeground,
    "--muted": colors.muted,
    "--muted-foreground": colors.mutedForeground,
    "--accent": colors.accent,
    "--accent-foreground": colors.accentForeground,
    "--border": colors.border,
    "--input": colors.input,
    "--ring": colors.ring,
    "--chart-1": colors.chart1,
    "--chart-2": colors.chart2,
    "--chart-3": colors.chart3,
    "--chart-4": colors.chart4,
    "--chart-5": colors.chart5,
    "--sidebar": colors.sidebar,
    "--sidebar-foreground": colors.sidebarForeground,
    "--sidebar-primary": colors.sidebarPrimary,
    "--sidebar-primary-foreground": colors.sidebarPrimaryForeground,
    "--sidebar-accent": colors.sidebarAccent,
    "--sidebar-accent-foreground": colors.sidebarAccentForeground,
    "--sidebar-border": colors.sidebarBorder,
    "--sidebar-ring": colors.sidebarRing,
  };
}

export function createCustomOrganizationTheme(
  theme: OrganizationTheme,
): OrganizationTheme {
  const colors = resolveOrganizationTheme(theme);
  return {
    mode: "custom",
    primary: colors.primary,
    primaryForeground: colors.primaryForeground,
    foreground: colors.foreground,
    background: colors.background,
    surface: colors.card,
    muted: colors.muted,
    mutedForeground: colors.mutedForeground,
    accent: colors.accent,
    border: colors.border,
  };
}
