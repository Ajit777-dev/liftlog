// Lightweight haptic feedback with zero native dependencies.
// Uses the Web Vibration API, which works in the Android WebView Capacitor
// runs inside. On platforms without support (most desktop browsers, iOS
// Safari) the calls are silent no-ops, so this is a safe progressive
// enhancement — never throws, never blocks.

type Pattern = "tap" | "success" | "warning";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 10, // crisp single tick — e.g. completing a set
  success: [12, 40, 24], // double-pulse — e.g. finishing a workout / new PR
  warning: [30, 30, 30], // triple buzz — e.g. a destructive action
};

let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

export function haptic(pattern: Pattern = "tap") {
  if (!enabled) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    // Vibration can be blocked by the platform / user settings — ignore.
  }
}
