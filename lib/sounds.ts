// Notification sounds, made on the spot with the browser's Web Audio: no sound
// files to load or license. Client only.
export type NotificationSound = "chime" | "ding" | "pop" | "bell" | "marimba" | "none";

export const SOUNDS: { value: NotificationSound; label: string }[] = [
  { value: "chime", label: "Chime" }, { value: "ding", label: "Ding" }, { value: "pop", label: "Pop" },
  { value: "bell", label: "Bell" }, { value: "marimba", label: "Marimba" }, { value: "none", label: "No sound" },
];

let ctx: AudioContext | null = null;

/** Plays one of the sounds people choose from in My account → Notifications. */
export function playSound(sound: NotificationSound | string | undefined, volume = 0.5) {
  if (!sound || sound === "none" || typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    // A paused audio context plays once it resumes, if that's straight away: the
    // browser may hold it until the next click, and a late sound would confuse.
    if (ctx.state !== "running") {
      const asked = Date.now();
      void ctx.resume().then(() => { if (Date.now() - asked < 1500) playNotes(ctx!, sound, volume); }).catch(() => {});
      return;
    }
    playNotes(ctx, sound, volume);
  } catch { /* sound isn't essential */ }
}

function playNotes(c: AudioContext, sound: string, volume: number) {
  try {
    const t0 = c.currentTime + 0.02;
    /** One note: a quick rise, then a natural fade. */
    const note = (freq: number, at: number, length: number, level = 1, type: OscillatorType = "sine", slideTo?: number) => {
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0 + at);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + at + length);
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.6 * volume * level), t0 + at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + length);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + length + 0.05);
    };
    switch (sound) {
      case "chime": note(880, 0, 0.45); note(1318.5, 0.13, 0.6, 0.8); break;                          // two rising notes
      case "ding": note(1568, 0, 0.9, 0.9); note(3136, 0, 0.35, 0.15); break;                        // one bright note
      case "pop": note(900, 0, 0.09, 1, "triangle", 280); break;                                       // a short, soft click
      case "bell": note(659.3, 0, 1.4, 0.8); note(1318.5, 0, 0.9, 0.25); note(1976, 0, 0.5, 0.1); break; // a low bell with overtones
      case "marimba": note(523.3, 0, 0.25, 0.9, "triangle"); note(784, 0.11, 0.25, 0.8, "triangle"); note(1046.5, 0.22, 0.35, 0.7, "triangle"); break;
    }
  } catch { /* sound isn't essential */ }
}
