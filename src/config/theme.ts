/**
 * BiteIQ design tokens — a light theme after the "My Fitness Pal Redesign"
 * Figma: a pale blue-grey canvas, white cards with soft shadows, and one
 * brand blue for actions, navigation, and the calorie ring.
 *
 * Macro and meal colors are data colors: they only ever encode protein,
 * carbs, fat, or a meal slot, never UI state.
 */
export const colors = {
  background: "#F4F6FB",
  backgroundElevated: "#FFFFFF",
  surface: "#FFFFFF",
  surfaceRaised: "#EEF1F8",
  surfaceMuted: "#F7F8FC",
  ink: "#1B2130",
  muted: "#687085",
  subtle: "#99A0B3",
  border: "#E7EAF2",
  borderStrong: "#D4D9E6",
  primary: "#2563EB",
  /** Lighter end of the brand gradient. */
  primaryBright: "#5B8DEF",
  primaryDark: "#DDE7FD",
  primarySoft: "#2563EB14",
  primaryLine: "#2563EB66",
  onPrimary: "#FFFFFF",
  /** Segmented-control track and the hero card's upper wash. */
  lavender: "#E8ECF8",
  heroTint: "#EEF0FC",
  /** Inactive tab icons. */
  periwinkle: "#B7BEE0",
  accent: "#F2A33A",
  coral: "#E0445E",
  gold: "#F2A33A",
  goldSoft: "#FCE9CC",
  blue: "#2563EB",
  teal: "#4DB6AC",
  violet: "#6C2BB0",
  success: "#1F9D6B",
  warning: "#D9820B",
  warningSoft: "#D9820B14",
  danger: "#E0445E",
  onDanger: "#FFFFFF",
  dangerSoft: "#E0445E12",
  scrim: "#1B213066"
};

/** Data colors. Keep these away from buttons, links, and selection states. */
export const dataColors = {
  protein: colors.accent,
  carbs: colors.teal,
  fat: colors.violet,
  breakfast: colors.accent,
  lunch: colors.coral,
  dinner: colors.violet,
  snack: colors.teal,
  water: colors.blue,
  exercise: colors.coral
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
};

/** Tighter on inner elements, softer on containers. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  pill: 999
};

/** Soft, cool-tinted lift for white cards on the pale canvas. */
export const elevation = {
  card: {
    shadowColor: "#1E2A55",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2
  },
  raised: {
    shadowColor: "#1E2A55",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4
  }
};

export const typography = {
  display: 44,
  title: 32,
  h1: 24,
  h2: 19,
  h3: 16,
  body: 15,
  small: 13,
  tiny: 11
};

export const fonts = {
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
  "800": "Inter_800ExtraBold"
} as const;

export const motion = {
  /** Snappy press feedback. */
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  /** Settling movement: sliding thumbs, expanding panels. */
  settle: { damping: 20, stiffness: 190, mass: 0.9 },
  fast: 180,
  base: 280,
  /** Progress fills — slow enough to read as "filling up". */
  fill: 900,
  stagger: 55
};

export const layout = {
  /** Reading column for phone-style screens on tablets and desktop. */
  maxContentWidth: 680,
  /** Forms and sign-in read best narrower. */
  maxFormWidth: 460,
  /** At or above this width, dashboards switch to two columns. */
  wideBreakpoint: 760,
  /** Below this width, rings and headline numbers step down a size. */
  compactBreakpoint: 360
};
