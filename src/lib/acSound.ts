// ── 루틴 체크 효과음 ─────────────────────────────────────────
export function playCheckSound() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    const pitches = [659.25, 739.99, 783.99, 880.0, 987.77];
    const freq = pitches[Math.floor(Math.random() * pitches.length)];

    function blip(startTime: number, f: number, vol: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, startTime);
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.09);
      osc.start(startTime);
      osc.stop(startTime + 0.1);
    }

    blip(ctx.currentTime, freq, 0.32);
    blip(ctx.currentTime + 0.06, freq * 1.189, 0.22);
  } catch {
    // ignore
  }
}

// ── 일기 타이핑 효과음 (Animalese 스타일) ───────────────────
// 캐릭터 코드 → 피치 매핑으로 각 글자마다 고유한 음절 소리
let _lastPlayAt = 0;

export function playTypingSound(char: string) {
  if (typeof window === "undefined") return;

  // 최소 55ms 간격 (빠르게 타이핑해도 뭉개지지 않게)
  const now = Date.now();
  if (now - _lastPlayAt < 55) return;
  _lastPlayAt = now;

  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();

    // 글자 코드로 펜타토닉 음계 선택 → 한글/영문/숫자 모두 커버
    const code = char.charCodeAt(0);
    // 펜타토닉 2옥타브: C4~C6
    const scale = [
      261.63, 293.66, 329.63, 392.0, 440.0,  // C4 D4 E4 G4 A4
      523.25, 587.33, 659.25, 783.99, 880.0,  // C5 D5 E5 G5 A5
    ];
    const freq = scale[code % scale.length];

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    // triangle wave: 사인보다 살짝 거칠고 따뜻한 목소리 느낌
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    // 미세한 피치 슬라이드 (말소리처럼)
    osc.frequency.linearRampToValueAtTime(freq * 1.04, ctx.currentTime + 0.03);

    filter.type = "bandpass";
    filter.frequency.value = freq * 1.8;
    filter.Q.value = 1.5;

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch {
    // ignore
  }
}
