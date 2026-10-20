export const colors = {
  background: '#F4F5F7',
  surface: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  primary: '#2563EB',
  danger: '#DC2626',
  border: '#E5E7EB',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 12,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 16 },
  caption: { fontSize: 13 },
} as const;

/** Max content width: phone-sized column, centered on larger screens. */
export const layout = {
  maxWidth: 480,
} as const;
