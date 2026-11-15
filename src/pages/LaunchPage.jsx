import { Suspense, lazy, useCallback, useRef, useState } from 'react';
import SpaceBackground from '../components/space/SpaceBackground';
import IntroBackdrop from '../components/space/IntroBackdrop';
import IntroOverlay from '../components/space/Introoverlay';
import MissionStoryIntro from '../components/MissionStoryIntro';
import MultiplayerLobby from '../components/MultiplayerLobby';
import OutpostTutorial from '../components/OutpostTutorial';
import { disableGameSound, enableGameSound } from '../utils/gameAudio';
import '../components/space/Ui.css';

const preloadLunarOutpost = () => import('../components/lunar/LunarOutpost');
const LunarOutpost = lazy(preloadLunarOutpost);

// Single player phases include the outpost tutorial; multiplayer launches directly from the crew lobby.
export default function LaunchPage({ simulation, onMissionStart }) {
  const [phase, setPhase] = useState('intro');
  const [introFinished, setIntroFinished] = useState(false);
  const [soundChoice, setSoundChoice] = useState(null);
  const [commanderProfile, setCommanderProfile] = useState({ commanderName: 'Commander', baseName: 'Moonbase Alpha' });
  const [playMode, setPlayMode] = useState('single');
  const tutorialDecisionRef = useRef(null);
  tutorialDecisionRef.current = { phase };

  const finishIntro = useCallback(() => setIntroFinished(true), []);

  const handleLaunchMission = useCallback((id) => {
    if (id !== 'moon') return;
    void preloadLunarOutpost();
    setPhase('mode');
  }, []);

  const handleStart = useCallback(() => {
    void handleLaunchMission('moon');
  }, [handleLaunchMission]);

  const beginMission = useCallback(async (profile) => {
    await preloadLunarOutpost();
    setCommanderProfile(profile);
    setPhase('preparing');
  }, []);

  const handleInitialCameraSettled = useCallback(() => {
    if (tutorialDecisionRef.current.phase === 'preparing') setPhase('tutorial');
  }, []);

  const finishTutorial = useCallback(() => {
    onMissionStart?.(commanderProfile);
    setPhase('lunar');
  }, [commanderProfile, onMissionStart]);

  const handleCrewReady = useCallback(async (profile) => {
    await preloadLunarOutpost();
    const missionProfile = { ...profile, baseName: 'Moonbase Alpha' };
    setCommanderProfile(missionProfile);
    onMissionStart?.(missionProfile);
    setPhase('lunar');
  }, [onMissionStart]);

  const handleRoomExit = useCallback(() => setPhase('mode'), []);

  // Skipping the cinematic still takes the player through mission configuration.
  const handleSkip = useCallback(() => {
    void handleLaunchMission('moon');
  }, [handleLaunchMission]);

  const handleEnableSound = useCallback(() => {
    enableGameSound();
    setSoundChoice('enabled');
  }, []);

  const handleContinueMuted = useCallback(() => {
    disableGameSound();
    setSoundChoice('muted');
  }, []);

  return (
    <div className="launch-root">
      {['preparing', 'tutorial', 'lunar'].includes(phase) ? (
        <Suspense fallback={null}>
          <LunarOutpost
            simulation={simulation}
            commanderProfile={commanderProfile}
            tutorialMode={phase !== 'lunar'}
            tutorialActive={phase === 'tutorial'}
            onInitialCameraSettled={handleInitialCameraSettled}
            onRoomExit={handleRoomExit}
          />
          {phase === 'tutorial' && <OutpostTutorial onComplete={finishTutorial} />}
        </Suspense>
      ) : (
        <>
          <SpaceBackground />
          <IntroBackdrop
            visible={phase === 'intro'}
            finished={introFinished}
            onSequenceEnd={finishIntro}
            soundChoice={soundChoice}
            onSoundChoice={setSoundChoice}
          />
          {phase === 'intro' && (
            <IntroOverlay
              visible
              finished={introFinished}
              onSkip={handleSkip}
              onStart={handleStart}
            />
          )}
          {phase === 'briefing' && <MissionStoryIntro onBegin={beginMission} />}
          {phase === 'mode' && (
            <section className="play-mode-screen">
              <div className="play-mode-card">
                <span>MISSION CONFIGURATION</span>
                <h1>How will you play?</h1>
                <p>Choose a solo mission or assemble a crew to work on the outpost together.</p>
                <button onClick={() => { setPlayMode('single'); setPhase('briefing'); }}>
                  Single player <small>Launch a solo mission</small>
                </button>
                <button onClick={() => { setPlayMode('multi'); setPhase('lobby'); }}>
                  Multiplayer <small>Create a room or join your crew</small>
                </button>
                <button className="play-mode-back" onClick={() => setPhase('intro')}>Back</button>
              </div>
            </section>
          )}
          {phase === 'mode' && soundChoice === null && (
            <div className="launch-sound-gate" role="dialog" aria-modal="true" aria-labelledby="launch-sound-title">
              <section className="launch-sound-prompt launch-sound-prompt--gate">
                <div>
                  <strong id="launch-sound-title">Enable game sound?</strong>
                  <span>Hear mission narration and game alerts.</span>
                </div>
                <button type="button" className="launch-sound-enable" onClick={handleEnableSound}>Enable sound</button>
                <button type="button" className="launch-sound-muted" onClick={handleContinueMuted}>Continue muted</button>
              </section>
            </div>
          )}
          {phase === 'lobby' && playMode === 'multi' && (
            <MultiplayerLobby onStart={handleCrewReady} onRoomExit={handleRoomExit} />
          )}
        </>
      )}
    </div>
  );
}
