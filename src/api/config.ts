// EXPO_PUBLIC_* vars are inlined at build time and must be read with static
// dot access (no destructuring / dynamic keys), or Expo won't substitute them.
// They ship in the client bundle, so never put a real secret here.
export const apiConfig = {
  baseUrl: (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, ''),
  token: process.env.EXPO_PUBLIC_API_TOKEN ?? '',
} as const;
