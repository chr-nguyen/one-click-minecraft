import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Thin, safe wrapper — real haptics on iOS/Android via Capacitor; a harmless
// no-op on web (or where unsupported). Never throws into the game loop.
export function impact(style = 'Medium') {
  try {
    Haptics.impact({ style: ImpactStyle[style] || ImpactStyle.Medium }).catch(() => {});
  } catch { /* not available */ }
}
