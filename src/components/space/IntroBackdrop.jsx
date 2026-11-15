import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS } from './launchConfig';
import { disableGameSound, enableGameSound } from '../../utils/gameAudio';

/** Plays the intro clips in sequence with one continuous voice-over track. */
export default function IntroBackdrop({ visible, finished, onSequenceEnd, soundChoice, onSoundChoice }) {
  const firstRef = useRef(null);
  const secondRef = useRef(null);
  const audioRef = useRef(null);
  const audioStartedRef = useRef(false);
  const audioDoneRef = useRef(false);
  const secondDoneRef = useRef(false);
  const activeRef = useRef(false);
  const attemptRef = useRef(0);
  const [secondActive, setSecondActive] = useState(false);
  const [audioError, setAudioError] = useState('');
  activeRef.current = visible && !finished;

  const finishSequenceIfReady = useCallback(() => {
    if (activeRef.current && audioDoneRef.current && secondDoneRef.current) onSequenceEnd?.();
  }, [onSequenceEnd]);

  const finishAudio = useCallback(() => {
    audioDoneRef.current = true;
    finishSequenceIfReady();
  }, [finishSequenceIfReady]);

  const stopAll = useCallback(() => {
    attemptRef.current += 1;
    audioStartedRef.current = false;
    [firstRef.current, secondRef.current, audioRef.current].forEach((media) => media?.pause());
  }, []);

  const beginPlayback = useCallback(() => {
    if (!activeRef.current || audioDoneRef.current || audioStartedRef.current) return;
    const attempt = ++attemptRef.current;
    const first = firstRef.current;
    if (!first) return;

    const videoPromise = first.play();
    Promise.resolve(videoPromise).then(() => {
      if (!activeRef.current || attempt !== attemptRef.current) return;
    }).catch((error) => {
      if (!activeRef.current || attempt !== attemptRef.current) return;
      console.error('Intro video playback failed.', error);
      first.pause();
      const second = secondRef.current;
      if (!second) {
        secondDoneRef.current = true;
        finishSequenceIfReady();
        return;
      }
      setSecondActive(true);
      second.play().catch((secondError) => {
        if (!activeRef.current) return;
        console.error('Second intro video playback failed.', secondError);
        secondDoneRef.current = true;
        finishSequenceIfReady();
      });
    });
  }, [finishSequenceIfReady]);

  const enableIntroSound = useCallback(() => {
    if (!activeRef.current || audioDoneRef.current || audioStartedRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    enableGameSound();
    audioStartedRef.current = true;
    setAudioError('');
    try {
      audio.currentTime = 0;
      const playback = audio.play();
      Promise.resolve(playback).then(() => {
        if (!activeRef.current) return;
        onSoundChoice?.('enabled');
      }).catch((error) => {
        if (!activeRef.current) return;
        audioStartedRef.current = false;
        audio.pause();
        setAudioError(error?.name === 'NotAllowedError'
          ? 'Tap Enable sound again to allow playback.'
          : 'Sound could not start. You can continue muted.');
        onSoundChoice?.(null);
      });
    } catch {
      audioStartedRef.current = false;
      setAudioError('Sound could not start. You can continue muted.');
      onSoundChoice?.(null);
    }
  }, [onSoundChoice]);

  const continueMuted = useCallback(() => {
    disableGameSound();
    audioRef.current?.pause();
    audioStartedRef.current = false;
    audioDoneRef.current = true;
    setAudioError('');
    onSoundChoice?.('muted');
    finishSequenceIfReady();
  }, [finishSequenceIfReady, onSoundChoice]);

  useEffect(() => {
    if (visible && !finished) beginPlayback();
    else stopAll();
    return stopAll;
  }, [visible, finished, beginPlayback, stopAll]);

  const handleFirstEnded = () => {
    if (!activeRef.current) return;
    setSecondActive(true);
    secondRef.current?.play().catch((error) => {
      if (activeRef.current) {
        console.error('Second intro video playback failed.', error);
        secondDoneRef.current = true;
        finishSequenceIfReady();
      }
    });
  };

  const handleSecondEnded = () => {
    secondDoneRef.current = true;
    finishSequenceIfReady();
  };

  const handleAudioError = () => {
    if (!activeRef.current || audioDoneRef.current) return;
    audioStartedRef.current = false;
    setAudioError('Sound could not be loaded. You can continue muted.');
    onSoundChoice?.(null);
  };

  return (
    <div className={`intro-media ${visible ? '' : 'intro-media--gone'} ${finished ? 'intro-media--skipped' : ''}`}>
      <video ref={firstRef} className={`intro-backdrop ${secondActive ? 'intro-backdrop--inactive' : ''}`} src={ASSETS.introVideo} muted playsInline preload="auto" disablePictureInPicture onEnded={handleFirstEnded} onError={handleFirstEnded} />
      <video ref={secondRef} className={`intro-backdrop ${secondActive ? '' : 'intro-backdrop--inactive'}`} src={ASSETS.introVideoSecond} muted playsInline preload="auto" disablePictureInPicture onEnded={handleSecondEnded} onError={handleSecondEnded} />
      <audio ref={audioRef} src={ASSETS.introVoiceover} preload="auto" onEnded={finishAudio} onError={handleAudioError} />
      {visible && !finished && soundChoice === null && (
        <section className="launch-sound-prompt" aria-label="Sound settings">
          <div>
            <strong>Hear the mission?</strong>
            <span>Turn on sound for the voice-over and game alerts.</span>
            {audioError && <small role="status">{audioError}</small>}
          </div>
          <button type="button" className="launch-sound-enable" onClick={enableIntroSound}>Enable sound</button>
          <button type="button" className="launch-sound-muted" onClick={continueMuted}>Continue muted</button>
        </section>
      )}
    </div>
  );
}
