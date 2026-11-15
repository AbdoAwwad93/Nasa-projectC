import { useEffect, useRef, useState } from 'react';
import { fetchLocalNetwork } from '../../utils/localNetworkFetch';

const MAX_MESSAGE_LENGTH = 240;

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function CrewTextChat({ apiBase, roomCode, playerId, playerName, enabled, open, onOpenChange }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [unread, setUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const lastMessageIdRef = useRef(null);
  const initializedRef = useRef(false);
  const wasNearBottomRef = useRef(true);

  useEffect(() => {
    if (!enabled || !apiBase || !roomCode || !playerId) return undefined;
    let live = true;
    let polling = false;
    const poll = async () => {
      if (!live || polling) return;
      polling = true;
      try {
        const url = `${apiBase}/api/rooms/${encodeURIComponent(roomCode)}/chat?playerId=${encodeURIComponent(playerId)}`;
        const response = await fetchLocalNetwork(url);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Crew chat is unavailable.');
        if (!live) return;
        const nextMessages = result.messages ?? [];
        const previousLastId = lastMessageIdRef.current;
        const previousLastIndex = previousLastId
          ? nextMessages.findIndex((message) => message.id === previousLastId)
          : -1;
        const newMessages = previousLastIndex >= 0
          ? nextMessages.slice(previousLastIndex + 1)
          : previousLastId && nextMessages.length
            ? nextMessages.slice(-1)
            : [];
        if (!initializedRef.current) {
          initializedRef.current = true;
          lastMessageIdRef.current = nextMessages.at(-1)?.id ?? null;
        } else if (newMessages.length) {
          lastMessageIdRef.current = nextMessages.at(-1)?.id ?? previousLastId;
          const incomingCount = newMessages.filter((message) => message.playerId !== playerId).length;
          if (incomingCount && !open) setUnread((count) => count + incomingCount);
        }
        setMessages(nextMessages);
        setError('');
      } catch (pollError) {
        if (live) setError(pollError instanceof Error ? pollError.message : 'Crew chat is unavailable.');
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 800);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [apiBase, enabled, open, playerId, roomCode]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !open || !wasNearBottomRef.current) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, open]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const message = draft.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message || sending) return;
    setSending(true);
    setError('');
    try {
      const response = await fetchLocalNetwork(`${apiBase}/api/rooms/${encodeURIComponent(roomCode)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, message }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Message could not be sent.');
      setMessages((current) => [...current.filter((entry) => entry.id !== result.message.id), result.message].slice(-100));
      lastMessageIdRef.current = result.message.id;
      initializedRef.current = true;
      setDraft('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="crew-chat-control">
      <button
        type="button"
        className={`crew-voice-icon crew-chat-toggle${open ? ' is-active' : ''}`}
        aria-label={open ? 'Close crew chat' : `Open crew chat${unread ? `, ${unread} unread messages` : ''}`}
        aria-expanded={open}
        aria-controls="crew-chat-panel"
        title="Crew chat"
        onClick={() => onOpenChange(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5.5 4v-4.5A2.5 2.5 0 0 1 4 13.5z" /><path d="M8 8h8M8 12h5" /></svg>
        {unread > 0 && !open && <span className="crew-chat-unread">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <section className="crew-chat-panel" id="crew-chat-panel" role="dialog" aria-modal="false" aria-label="Crew chat">
          <header className="crew-chat-header">
            <div><strong>Crew chat</strong><span>Room {roomCode}</span></div>
            <button type="button" className="crew-chat-close" aria-label="Close crew chat" onClick={() => onOpenChange(false)}>×</button>
          </header>
          <div
            className="crew-chat-messages"
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            onScroll={(event) => {
              const list = event.currentTarget;
              wasNearBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
            }}
          >
            {messages.length === 0 ? (
              <p className="crew-chat-empty">Send a message to your crew.</p>
            ) : messages.map((entry) => (
              <article className={`crew-chat-message${entry.playerId === playerId ? ' is-own' : ''}`} key={entry.id}>
                <div><strong>{entry.playerId === playerId ? 'You' : entry.playerName || 'Crew member'}</strong><time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time></div>
                <p>{entry.message}</p>
              </article>
            ))}
          </div>
          {error && <p className="crew-chat-error" role="status">{error}</p>}
          <form className="crew-chat-compose" onSubmit={sendMessage}>
            <textarea
              aria-label="Message your crew"
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={`Message as ${playerName || 'crew member'}…`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={2}
            />
            <button type="submit" aria-label="Send message" disabled={sending || !draft.trim()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 5 16 7-16 7 2-7z" /><path d="M6 12h14" /></svg>
            </button>
          </form>
          <span className="crew-chat-hint">Enter to send · Shift+Enter for a new line</span>
        </section>
      )}
    </div>
  );
}
