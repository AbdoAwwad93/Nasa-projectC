function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase() || 'C';
}

export default function CrewRoster({ players = [], hostId, playerId, roomCode, open, onOpenChange, onLeaveRoom, leaving = false }) {
  if (!roomCode) return null;

  return (
    <div className="crew-chat-control crew-roster-control">
      <button
        type="button"
        className={`crew-voice-icon crew-roster-toggle${open ? ' is-active' : ''}`}
        aria-label={open ? 'Close crew list' : `Show crew list, ${players.length} players`}
        aria-expanded={open}
        aria-controls="crew-roster-panel"
        title={`Crew · ${players.length}`}
        onClick={() => onOpenChange(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a2.5 2.5 0 0 1 0 5m1.5 2a4.5 4.5 0 0 1 3 4.25V19h-3" /></svg>
        <span className="crew-roster-count">{players.length}</span>
      </button>
      {open && (
        <section className="crew-chat-panel crew-roster-panel" id="crew-roster-panel" role="dialog" aria-modal="false" aria-label="Mission crew">
          <header className="crew-chat-header">
            <div><strong>Mission crew <span className="crew-roster-total">{players.length}</span></strong><span>Room {roomCode}</span></div>
            <button type="button" className="crew-chat-close" aria-label="Close crew list" onClick={() => onOpenChange(false)}>×</button>
          </header>
          <ul className="crew-roster-list">
            {players.map((player) => {
              const isHost = player.id === hostId;
              const isSelf = player.id === playerId;
              return (
                <li key={player.id}>
                  <span className={`crew-roster-avatar${isSelf ? ' is-self' : ''}`} aria-hidden="true">{getInitials(player.name)}</span>
                  <span className="crew-roster-name"><strong>{player.name || 'Commander'}{isSelf ? ' · You' : ''}</strong><small>{isHost ? 'Mission host' : 'Crew member'}</small></span>
                  {isHost && <span className="crew-roster-host">HOST</span>}
                </li>
              );
            })}
          </ul>
          <footer className="crew-roster-footer">
            <button type="button" className="crew-roster-leave" disabled={leaving} onClick={onLeaveRoom}>
              {leaving ? 'Leaving room…' : 'Leave room'}
            </button>
          </footer>
        </section>
      )}
    </div>
  );
}
