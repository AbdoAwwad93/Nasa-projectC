let audioContext = null;
let gameSoundEnabled = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
  return audioContext;
}

export function enableGameSound() {
  gameSoundEnabled = true;
  const context = getAudioContext();
  if (context?.state === 'suspended') void context.resume().catch(() => {});
}

export function disableGameSound() {
  gameSoundEnabled = false;
}

export function isGameSoundEnabled() {
  return gameSoundEnabled;
}

export function playGameNotificationChime() {
  if (!gameSoundEnabled) return;
  try {
    const context = getAudioContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, startAt);
    oscillator.frequency.setValueAtTime(1046, startAt + 0.075);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.19);
    oscillator.connect(gain);
    gain.connect(context.destination);
    if (context.state === 'suspended') void context.resume().catch(() => {});
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.2);
  } catch { /* Keep gameplay usable when sound is unavailable. */ }
}
