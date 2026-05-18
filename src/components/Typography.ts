/**
 * Typography constants for ClearMoney
 *
 * DM Serif Display — elegant, trusted serif for hero numbers, balances, big titles
 * DM Sans          — clean geometric sans-serif for all UI text, labels, body copy
 */

export const Fonts = {
  // DM Serif Display (serif) — one weight, inherently heavy as a display face
  serif:        'DMSerifDisplay_400Regular',
  serifSemi:    'DMSerifDisplay_400Regular',
  serifMedium:  'DMSerifDisplay_400Regular',
  serifRegular: 'DMSerifDisplay_400Regular',

  // DM Sans (sans-serif)
  bold:     'DMSans_700Bold',
  semiBold: 'DMSans_600SemiBold',
  medium:   'DMSans_500Medium',
  regular:  'DMSans_400Regular',
} as const;

export type FontName = (typeof Fonts)[keyof typeof Fonts];
