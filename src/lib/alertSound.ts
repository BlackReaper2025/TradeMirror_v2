export type AlertSound = "chime" | "beep" | "bell" | "pulse";

export const ALERT_SOUNDS: { id: AlertSound; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "beep",  label: "Beep"  },
  { id: "bell",  label: "Bell"  },
  { id: "pulse", label: "Pulse" },
];

export function playAlertSound(sound: AlertSound = "chime") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    type Tone = { freq: number; start: number; dur: number; type?: OscillatorType; vol?: number };

    const presets: Record<AlertSound, Tone[]> = {
      chime: [
        { freq: 1047, start: 0,    dur: 0.18 },   // C6
        { freq:  880, start: 0.20, dur: 0.30 },   // A5
      ],
      beep: [
        { freq: 1320, start: 0, dur: 0.12, type: "square", vol: 0.2 },
      ],
      bell: [
        { freq:  659, start: 0,    dur: 0.50 },            // E5 fundamental
        { freq: 1318, start: 0,    dur: 0.25, vol: 0.12 }, // E6 harmonic
        { freq:  988, start: 0.02, dur: 0.40, vol: 0.08 }, // B5 harmonic
      ],
      pulse: [
        { freq:  880, start: 0,    dur: 0.10 },   // A5
        { freq:  880, start: 0.15, dur: 0.10 },   // A5 repeat
        { freq: 1047, start: 0.30, dur: 0.22 },   // C6
      ],
    };

    (presets[sound] ?? presets.chime).forEach(({ freq, start, dur, type = "sine", vol = 0.35 }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0, now + start);
      gain.gain.linearRampToValueAtTime(vol, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    });
  } catch { /* audio not available */ }
}
