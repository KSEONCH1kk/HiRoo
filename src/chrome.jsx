// App chrome: title bar + server rail + mode switcher.

const TitleBar = ({ title, onToggleTweaks }) => (
  <div style={{
    height: 28, flexShrink: 0,
    background: 'var(--bg-0)',
    borderBottom: '1px solid var(--line)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 10px',
    WebkitAppRegion: 'drag', userSelect: 'none',
  }}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: 120 }}>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }}/>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }}/>
      <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }}/>
    </div>
    <div style={{ fontSize: 12, color: 'var(--text-2)', letterSpacing: 0.3 }}>
      {title}
    </div>
    <div style={{ width: 120, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>hiroo · 1.7.2</span>
    </div>
  </div>
);

const ServerRail = ({ servers, activeServer, activeMode, onPick, onPickMode }) => {
  const pill = (id, label, active, hue, notif, icon, onClick, shape = 'squircle') => (
    <div key={id} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52 }}>
      {/* left indicator */}
      <div style={{
        position: 'absolute', left: 0, top: '50%',
        transform: `translateY(-50%) scaleY(${active ? 1 : notif ? 0.4 : 0})`,
        width: 3, height: active ? 36 : 12, borderRadius: '0 3px 3px 0',
        background: 'var(--accent)',
        transition: 'all 220ms cubic-bezier(.3,.8,.3,1)',
      }}/>
      <button onClick={onClick} style={{
        width: 44, height: 44,
        borderRadius: active ? 14 : shape === 'circle' ? '50%' : 18,
        border: 'none', cursor: 'pointer',
        background: active
          ? 'var(--accent)'
          : hue !== undefined ? `linear-gradient(135deg, oklch(35% 0.06 ${hue}), oklch(22% 0.03 ${hue}))` : 'var(--bg-3)',
        color: active ? '#fff' : 'var(--text-1)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: icon ? 18 : 13, fontWeight: 600, letterSpacing: -0.3,
        transition: 'all 200ms cubic-bezier(.3,.8,.3,1)',
        boxShadow: active ? '0 6px 14px oklch(from var(--accent) l c h / 0.35)' : '0 1px 2px rgba(0,0,0,0.2)',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderRadius = '14px'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderRadius = shape === 'circle' ? '50%' : '18px'; }}
      >
        {icon || label}
      </button>
      {notif ? (
        <div style={{
          position: 'absolute', left: '58%', bottom: 2,
          minWidth: 18, height: 18, borderRadius: 10, padding: '0 5px',
          background: 'var(--danger)', color: '#fff',
          fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 3px var(--bg-0)',
        }}>{notif > 99 ? '99+' : notif}</div>
      ) : null}
    </div>
  );

  return (
    <div style={{
      width: 72, flexShrink: 0, background: 'var(--bg-0)',
      borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      paddingTop: 10, gap: 2, overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* Logo / home */}
      <div style={{ position: 'relative', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => onPickMode('dms')} style={{
          width: 44, height: 44, borderRadius: activeMode === 'dms' ? 14 : 22,
          border: 'none', cursor: 'pointer',
          background: activeMode === 'dms' ? 'var(--accent)' : 'var(--bg-3)',
          color: activeMode === 'dms' ? '#fff' : 'var(--text-0)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Instrument Serif', fontSize: 22, fontWeight: 600, letterSpacing: -1,
          transition: 'all 200ms cubic-bezier(.3,.8,.3,1)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        }}
        onMouseEnter={e => e.currentTarget.style.borderRadius = '14px'}
        onMouseLeave={e => e.currentTarget.style.borderRadius = activeMode === 'dms' ? '14px' : '22px'}
        >H<span style={{ marginLeft: -2, fontStyle: 'italic', opacity: 0.85 }}>r</span></button>
      </div>

      <div style={{ width: 32, height: 1, background: 'var(--line-strong)', margin: '4px 0' }}/>

      {servers.map(s => pill(
        s.id, s.short, activeMode === 'server' && activeServer === s.id, s.hue, s.notif, null,
        () => onPick(s.id)
      ))}

      {/* add server */}
      {pill('add', '+', false, undefined, 0,
        <span style={{ color: 'var(--ok)', fontSize: 22, fontWeight: 300 }}>+</span>,
        () => {}
      )}
      {pill('explore', '', activeMode === 'explore', undefined, 0,
        <span style={{ color: activeMode === 'explore' ? '#fff' : 'var(--ok)' }}><Icons.compass size={22}/></span>,
        () => onPickMode('explore')
      )}

      <div style={{ flex: 1 }}/>

      {pill('inbox', '', activeMode === 'inbox', undefined, 0,
        <Icons.inbox size={20}/>,
        () => onPickMode('inbox')
      )}
      {pill('friends', '', activeMode === 'friends', undefined, 0,
        <Icons.users size={20}/>,
        () => onPickMode('friends')
      )}
      {pill('settings', '', activeMode === 'settings', undefined, 0,
        <Icons.settings size={20}/>,
        () => onPickMode('settings')
      )}

      <div style={{ height: 10 }}/>
    </div>
  );
};

// Bottom-left user tray (shows self info, mic/deafen/settings)
const UserTray = ({ me, mic, setMic, deaf, setDeaf, onSettings, inVoice, onHangup }) => (
  <div>
    {inVoice && (
      <div style={{
        padding: '8px 6px',
        background: 'oklch(from var(--ok) 22% 0.05 h)',
        borderTop: '1px solid var(--line)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: 'var(--ok)', fontFamily: 'Geist Mono', letterSpacing: 0.3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)', boxShadow: '0 0 6px var(--ok)' }}/>
          В ЭФИРЕ
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn size="sm" icon={<Icons.screenShare size={13}/>} title="Поделиться экраном"/>
          <Btn size="sm" icon={<Icons.phoneHang size={13}/>} onClick={onHangup} title="Отключиться" style={{ color: 'var(--danger)' }}/>
        </div>
      </div>
    )}
    <div style={{
      padding: '8px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      background: 'var(--bg-0)', borderTop: '1px solid var(--line)',
    }}>
      <div style={{ padding: 4, borderRadius: 8, cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        title={`${me.name} · ${me.status}`}
      >
        <Avatar name={me.name} hue={me.avatar.hue} size={34} status="online"/>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        <Btn size="sm" icon={mic ? <Icons.mic size={13}/> : <Icons.micOff size={13}/>} onClick={() => setMic(!mic)} active={!mic} style={{ color: mic ? 'var(--text-1)' : 'var(--danger)' }} title="Микрофон"/>
        <Btn size="sm" icon={deaf ? <Icons.headphonesOff size={13}/> : <Icons.headphones size={13}/>} onClick={() => setDeaf(!deaf)} active={deaf} style={{ color: deaf ? 'var(--danger)' : 'var(--text-1)' }} title="Звук"/>
      </div>
      <Btn size="sm" icon={<Icons.settings size={13}/>} onClick={onSettings} title="Настройки"/>
    </div>
  </div>
);

window.TitleBar = TitleBar;
window.ServerRail = ServerRail;
window.UserTray = UserTray;
