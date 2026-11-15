import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLocalNetwork } from '../../utils/localNetworkFetch';

const VOICE_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function CrewVoiceChat({ apiBase, roomCode, playerId, enabled }) {
  const peersRef = useRef(new Map());
  const micStreamRef = useRef(null);
  const speakerEnabledRef = useRef(true);
  const [micEnabled, setMicEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [connectedCount, setConnectedCount] = useState(0);
  const [voiceError, setVoiceError] = useState('');

  const refreshConnectedCount = useCallback(() => {
    setConnectedCount([...peersRef.current.values()].filter(({ pc }) => pc.connectionState === 'connected').length);
  }, []);

  useEffect(() => {
    if (!enabled || !apiBase || !roomCode || !playerId) return undefined;
    let live = true;
    let pollingSignals = false;
    let pollingRoster = false;
    const roomPath = `${apiBase}/api/rooms/${encodeURIComponent(roomCode)}`;

    const sendSignal = async (toId, type, payload) => {
      try {
        await fetchLocalNetwork(`${roomPath}/voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromId: playerId, toId, type, payload }),
        });
      } catch { /* Voice reconnects when the room relay is available again. */ }
    };

    const createPeer = (remoteId) => {
      let peer = peersRef.current.get(remoteId);
      if (peer) return peer;
      const pc = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS });
      let audioTransceiver = null;
      try { audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch { /* Older browsers may negotiate audio after a track is added. */ }
      const activeMicTrack = micStreamRef.current?.getAudioTracks().find((track) => track.readyState === 'live');
      if (activeMicTrack && audioTransceiver) void audioTransceiver.sender.replaceTrack(activeMicTrack).catch(() => {});
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.muted = !speakerEnabledRef.current;
      audio.setAttribute('aria-hidden', 'true');
      audio.className = 'crew-voice-audio';
      document.body.appendChild(audio);
      peer = { pc, audio, audioTransceiver, pendingCandidates: [], offerStarted: false };
      peersRef.current.set(remoteId, peer);
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) void sendSignal(remoteId, 'candidate', candidate.toJSON());
      };
      pc.ontrack = ({ track, streams }) => {
        const stream = streams[0] ?? new MediaStream([track]);
        peer.audio.srcObject = stream;
        peer.audio.muted = !speakerEnabledRef.current;
        const playback = peer.audio.play();
        playback?.catch(() => { /* The speaker icon click retries playback after browser gesture gating. */ });
      };
      pc.onconnectionstatechange = refreshConnectedCount;
      pc.oniceconnectionstatechange = refreshConnectedCount;
      return peer;
    };

    const flushCandidates = async (peer) => {
      if (!peer.pc.remoteDescription) return;
      for (const candidate of peer.pendingCandidates.splice(0)) {
        try { await peer.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* Ignore stale ICE candidates. */ }
      }
    };

    const handleSignal = async (signal) => {
      const peer = createPeer(signal.fromId);
      try {
        if (signal.type === 'offer') {
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          await flushCandidates(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await sendSignal(signal.fromId, 'answer', peer.pc.localDescription.toJSON());
        } else if (signal.type === 'answer') {
          if (peer.pc.signalingState !== 'have-local-offer') return;
          await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          await flushCandidates(peer);
        } else if (signal.type === 'candidate') {
          if (!peer.pc.remoteDescription) peer.pendingCandidates.push(signal.payload);
          else await peer.pc.addIceCandidate(new RTCIceCandidate(signal.payload));
        }
      } catch { /* A later room poll or ICE candidate can recover a transient negotiation race. */ }
    };

    const pollRoster = async () => {
      if (!live || pollingRoster) return;
      pollingRoster = true;
      try {
        const response = await fetchLocalNetwork(roomPath);
        if (!response.ok) return;
        const { room } = await response.json();
        if (!live) return;
        const currentIds = new Set((room.players ?? []).filter((player) => player.id !== playerId).map((player) => player.id));
        for (const [remoteId, peer] of peersRef.current) {
          if (currentIds.has(remoteId)) continue;
          peer.pc.close();
          peer.audio.srcObject = null;
          peer.audio.remove();
          peersRef.current.delete(remoteId);
        }
        for (const remoteId of currentIds) {
          const peer = createPeer(remoteId);
          // Stable player ordering selects one offerer for each pair and prevents offer glare.
          if (playerId.localeCompare(remoteId) < 0 && !peer.offerStarted && peer.pc.signalingState === 'stable') {
            peer.offerStarted = true;
            try {
              const offer = await peer.pc.createOffer();
              await peer.pc.setLocalDescription(offer);
              await sendSignal(remoteId, 'offer', peer.pc.localDescription.toJSON());
            } catch { peer.offerStarted = false; }
          }
        }
        refreshConnectedCount();
      } catch { /* Crew voice stays quiet while the room relay reconnects. */ }
      finally { pollingRoster = false; }
    };

    const pollSignals = async () => {
      if (!live || pollingSignals) return;
      pollingSignals = true;
      try {
        const url = `${roomPath}/voice?playerId=${encodeURIComponent(playerId)}`;
        const response = await fetchLocalNetwork(url);
        if (!response.ok) return;
        const { signals } = await response.json();
        for (const signal of signals ?? []) await handleSignal(signal);
      } catch { /* Keep the mission usable if voice signaling briefly drops. */ }
      finally { pollingSignals = false; }
    };

    void pollRoster();
    void pollSignals();
    const rosterTimer = window.setInterval(pollRoster, 1500);
    const signalTimer = window.setInterval(pollSignals, 250);
    return () => {
      live = false;
      window.clearInterval(rosterTimer);
      window.clearInterval(signalTimer);
      for (const peer of peersRef.current.values()) {
        peer.pc.close();
        peer.audio.srcObject = null;
        peer.audio.remove();
      }
      peersRef.current.clear();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    };
  }, [apiBase, enabled, playerId, refreshConnectedCount, roomCode]);

  const toggleMicrophone = async () => {
    if (micEnabled) {
      const stream = micStreamRef.current;
      for (const peer of peersRef.current.values()) {
        const sender = peer.audioTransceiver?.sender ?? peer.pc.getSenders().find((entry) => entry.track?.kind === 'audio');
        if (sender) void sender.replaceTrack(null).catch(() => {});
      }
      stream?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      setMicEnabled(false);
      setVoiceError('');
      return;
    }
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access needs HTTPS or localhost.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.getAudioTracks().forEach((track) => { track.enabled = true; });
      micStreamRef.current = stream;
      for (const peer of peersRef.current.values()) {
        const sender = peer.audioTransceiver?.sender ?? peer.pc.getSenders().find((entry) => entry.track?.kind === 'audio');
        if (sender) await sender.replaceTrack(stream.getAudioTracks()[0]);
      }
      setMicEnabled(true);
      setVoiceError('');
    } catch (error) {
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      setVoiceError(error?.name === 'NotAllowedError' ? 'Allow microphone access in your browser.' : error?.message || 'Could not start microphone.');
    }
  };

  const toggleSpeaker = () => {
    const audioReadyButBlocked = speakerEnabled && [...peersRef.current.values()]
      .some((peer) => peer.audio.srcObject && peer.audio.paused);
    if (audioReadyButBlocked) {
      for (const peer of peersRef.current.values()) peer.audio.play()?.catch(() => {});
      return;
    }
    const next = !speakerEnabled;
    speakerEnabledRef.current = next;
    setSpeakerEnabled(next);
    for (const peer of peersRef.current.values()) {
      peer.audio.muted = !next;
      if (next) peer.audio.play()?.catch(() => { /* Playback can remain blocked until a browser gesture. */ });
    }
  };

  if (!enabled) return null;
  const micLabel = voiceError ? `Microphone error: ${voiceError}` : (micEnabled ? 'Turn microphone off' : 'Turn microphone on');
  const speakerLabel = speakerEnabled ? `Mute crew audio (${connectedCount} connected)` : 'Turn crew audio on';

  return (
    <div className="crew-voice-controls" role="group" aria-label="Crew voice chat">
      <button
        type="button"
        className={`crew-voice-icon${micEnabled ? ' is-active' : ''}${voiceError ? ' has-error' : ''}`}
        aria-label={micLabel}
        aria-pressed={micEnabled}
        title={micLabel}
        onClick={() => void toggleMicrophone()}
      >
        {micEnabled ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21m-4 0h8" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3 21 21M9 9v3a3 3 0 0 0 5.12 2.12M15 9V6a3 3 0 0 0-5.56-1.56M5.5 11a6.5 6.5 0 0 0 11.82 3.76M12 17.5V21m-4 0h8" /></svg>
        )}
      </button>
      <button
        type="button"
        className={`crew-voice-icon${speakerEnabled ? ' is-active' : ''}`}
        aria-label={speakerLabel}
        aria-pressed={speakerEnabled}
        title={speakerLabel}
        onClick={toggleSpeaker}
      >
        {speakerEnabled ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4Z" /><path d="M16 9a5 5 0 0 1 0 6m2.5-8.5a8.5 8.5 0 0 1 0 11" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4h4l5 4V6l-5 4H4ZM17 9l5 6m0-6-5 6" /></svg>
        )}
      </button>
      {voiceError && <span className="crew-voice-error" role="alert">{voiceError}</span>}
      <span className="crew-voice-sr-status" role="status" aria-live="polite">{voiceError || `${connectedCount} crew audio connections`}</span>
    </div>
  );
}
