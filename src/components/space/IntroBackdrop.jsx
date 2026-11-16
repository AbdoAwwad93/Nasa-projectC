import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS } from './launchConfig';
import { enableGameSound } from '../../utils/gameAudio';

/** Plays the intro clips in sequence with one continuous voice-over track. */
export default function IntroBackdrop({ visible, finished, onSequenceEnd }) {
  const firstRef = useRef(null);
  const secondRef = useRef(null);
  const audioRef = useRef(null);
  const audioStartedRef = useRef(false);
  const audioDoneRef = useRef(false);
  const secondDoneRef = useRef(false);
  const activeRef = useRef(false);
  const attemptRef = useRef(0);
  const [secondActive, setSecondActive] = useState(false);
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

  const tryStartAudio = useCallback(() => {
    if (!activeRef.current || audioDoneRef.current || audioStartedRef.current) return;
    const audio = audioRef.current;
    if (!audio) {
      audioDoneRef.current = true;
      finishSequenceIfReady();
      return;
    }
    enableGameSound();
    audioStartedRef.current = true;
    try {
      audio.currentTime = 0;
      const playback = audio.play();
      Promise.resolve(playback).then(() => {
        if (!activeRef.current) audio.pause();
      }).catch((error) => {
        if (!activeRef.current) return;
        audioStartedRef.current = false;
        audio.pause();
        // Browsers may block audible autoplay. Let the silent intro finish;
        // game audio unlocks on the player's first input.
        audioDoneRef.current = true;
        finishSequenceIfReady();
      });
    } catch {
      audioStartedRef.current = false;
      audioDoneRef.current = true;
      finishSequenceIfReady();
    }
  }, [finishSequenceIfReady]);

  const beginPlayback = useCallback(() => {
    if (!activeRef.current) return;
    const attempt = ++attemptRef.current;
    const first = firstRef.current;
    if (!first) return;

    tryStartAudio();
    Promise.resolve(first.play()).then(() => {
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
  }, [finishSequenceIfReady, tryStartAudio]);

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
    audioDoneRef.current = true;
    finishSequenceIfReady();
  };

  return (
    <div className={`intro-media ${visible ? '' : 'intro-media--gone'} ${finished ? 'intro-media--skipped' : ''}`}>
      <video ref={firstRef} className={`intro-backdrop ${secondActive ? 'intro-backdrop--inactive' : ''}`} src={ASSETS.introVideo} muted playsInline preload="auto" disablePictureInPicture onEnded={handleFirstEnded} onError={handleFirstEnded} />
      <video ref={secondRef} className={`intro-backdrop ${secondActive ? '' : 'intro-backdrop--inactive'}`} src={ASSETS.introVideoSecond} muted playsInline preload="auto" disablePictureInPicture onEnded={handleSecondEnded} onError={handleSecondEnded} />
      <audio ref={audioRef} src={ASSETS.introVoiceover} preload="auto" onEnded={finishAudio} onError={handleAudioError} />
    </div>
  );
}
