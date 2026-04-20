// Shared primitives: Avatar, Badge, Button, Tooltip-free helpers, placeholders.

const Avatar = ({ name, hue = 268, size = 36, status, self = false, ring = false, shape = 'squircle' }) => {
  const initials = (name || '?').trim().slice(0, 1).toUpperCase();
  const bg = `oklch(58% 0.14 ${hue})`;
  const bg2 = `oklch(72% 0.11 ${(hue + 30) % 360})`;
  const radius = shape === 'circle' ? '50%' : `${Math.round(size * 0.32)}px`;
  return (
    <div style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
    }}>
      <div style={{
        width: size, height: size, borderRadius: radius,
        background: `linear-gradient(135deg, ${bg}, ${bg2})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 600, fontSize: size * 0.42, letterSpacing: -0.5,
        boxShadow: ring ? `0 0 0 2px var(--bg-2), 0 0 0 4px ${bg}` : 'none',
      }}>{initials}</div>
      {status && (
        <div style={{
          position: 'absolute', right: -2, bottom: -2,
          width: Math.max(10, size * 0.3), height: Math.max(10, size * 0.3),
          borderRadius: '50%',
          background: status === 'online' ? 'var(--ok)' : status === 'idle' ? 'var(--away)' : status === 'dnd' ? 'var(--danger)' : 'var(--text-3)',
          boxShadow: '0 0 0 3px var(--bg-2)',
        }}>
          {status === 'idle' && <div style={{ width: '50%', height: '50%', borderRadius: '50%', background: 'var(--bg-2)', margin: '25% 0 0 25%' }}/>}
        </div>
      )}
    </div>
  );
};

const GroupAvatar = ({ members = [], hue = 268, size = 36 }) => {
  const r = Math.round(size * 0.32);
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: `oklch(18% 0.04 ${hue})`,
      position: 'relative', overflow: 'hidden', flexShrink: 0,
      display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
      gap: 1,
    }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{
          background: `oklch(${55 + i*3}% 0.12 ${(hue + i*40) % 360})`,
        }}/>
      ))}
    </div>
  );
};

const Pill = ({ children, color, soft, icon, onClick, style = {} }) => (
  <div onClick={onClick} style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '3px 9px', borderRadius: 999,
    background: soft ? `oklch(from ${color || 'var(--accent)'} l c h / 0.15)` : color || 'var(--accent)',
    color: soft ? color || 'var(--accent)' : '#fff',
    fontSize: 12, fontWeight: 500,
    border: soft ? `1px solid oklch(from ${color || 'var(--accent)'} l c h / 0.25)` : 'none',
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  }}>
    {icon}{children}
  </div>
);

const Btn = ({ children, variant = 'ghost', size = 'md', icon, onClick, active, style = {}, danger, title }) => {
  const H = { sm: 28, md: 32, lg: 38 }[size];
  const pad = icon && !children ? 0 : { sm: '0 10px', md: '0 14px', lg: '0 18px' }[size];
  const bg = danger ? 'var(--danger)' : variant === 'primary' ? 'var(--accent)' : active ? 'var(--bg-active)' : variant === 'soft' ? 'var(--bg-3)' : 'transparent';
  const color = danger || variant === 'primary' ? '#fff' : active ? 'var(--accent)' : 'var(--text-1)';
  return (
    <button title={title} onClick={onClick} style={{
      height: H, padding: pad, width: icon && !children ? H : undefined,
      borderRadius: size === 'sm' ? 6 : 8,
      background: bg, color,
      border: variant === 'outline' ? '1px solid var(--line-strong)' : 'none',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      fontSize: 13, fontWeight: 500, cursor: 'pointer',
      transition: 'background 120ms, color 120ms, transform 80ms',
      ...style,
    }}
    onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
    onMouseUp={e => e.currentTarget.style.transform = ''}
    onMouseLeave={e => e.currentTarget.style.transform = ''}
    >
      {icon}{children}
    </button>
  );
};

const ImagePlaceholder = ({ w = 320, h = 200, label, hue = 268, style = {} }) => (
  <div style={{
    width: w, height: h, borderRadius: 8,
    background: `repeating-linear-gradient(45deg, oklch(22% 0.03 ${hue}), oklch(22% 0.03 ${hue}) 10px, oklch(25% 0.035 ${hue}) 10px, oklch(25% 0.035 ${hue}) 20px)`,
    border: '1px solid var(--line)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'Geist Mono, monospace', fontSize: 11, color: 'var(--text-2)',
    letterSpacing: 0.3, textAlign: 'center', padding: 16,
    ...style,
  }}>{label || `${w}×${h}`}</div>
);

// A subtle "desk/room" placeholder for camera feeds
const CameraFeed = ({ name, hue = 200, muted, speaking, screenshare, label, style = {} }) => (
  <div style={{
    position: 'relative', borderRadius: 14, overflow: 'hidden',
    background: screenshare
      ? `linear-gradient(140deg, oklch(14% 0.02 240), oklch(10% 0.02 260))`
      : `linear-gradient(160deg, oklch(35% 0.08 ${hue}), oklch(18% 0.04 ${(hue+30)%360}))`,
    border: speaking ? '2px solid var(--ok)' : '1px solid var(--line)',
    boxShadow: speaking ? '0 0 0 2px rgba(62,207,142,0.18), 0 8px 24px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.3)',
    transition: 'border-color 180ms, box-shadow 180ms',
    ...style,
  }}>
    {screenshare ? (
      // mock screen content
      <div style={{ position: 'absolute', inset: 16, background: 'var(--bg-1)', borderRadius: 6, padding: 12, fontFamily: 'Geist Mono, monospace', fontSize: 9, color: 'var(--text-2)', lineHeight: 1.5, overflow: 'hidden' }}>
        <div style={{ color: 'var(--accent-2)', marginBottom: 4 }}>~ figma · макет.fig</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {['◻','◻','◼','◻'].map((g,i)=>(<div key={i} style={{width: 18, height: 14, background: i===2 ? 'var(--accent-soft)' : 'rgba(255,255,255,0.05)', borderRadius: 2}}/>))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8, height: 'calc(100% - 24px)' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}/>
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 4, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: '20% 25%', background: 'var(--accent-soft)', borderRadius: 3 }}/>
          </div>
        </div>
      </div>
    ) : (
      // avatar centered bubble
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: `linear-gradient(135deg, oklch(60% 0.12 ${hue}), oklch(70% 0.10 ${(hue+30)%360}))`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, fontWeight: 600, letterSpacing: -1,
          animation: speaking ? 'speaking 1.2s ease-in-out infinite' : 'none',
        }}>{(name||'?').slice(0,1).toUpperCase()}</div>
      </div>
    )}

    {/* name tag */}
    <div style={{
      position: 'absolute', left: 10, bottom: 10,
      padding: '4px 9px 4px 8px', borderRadius: 6,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: 500, color: '#fff',
    }}>
      {muted && <span style={{ color: 'var(--danger)' }}><Icons.micOff size={12} stroke={2}/></span>}
      {screenshare && <Icons.screen size={12} stroke={2}/>}
      {name}
      {label && <span style={{ color: 'var(--text-2)', marginLeft: 2 }}>· {label}</span>}
    </div>

    {/* live dot for speaking */}
    {speaking && (
      <div style={{
        position: 'absolute', right: 10, top: 10,
        width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)',
        boxShadow: '0 0 0 4px rgba(62,207,142,0.25)',
      }}/>
    )}
  </div>
);

window.Avatar = Avatar;
window.GroupAvatar = GroupAvatar;
window.Pill = Pill;
window.Btn = Btn;
window.ImagePlaceholder = ImagePlaceholder;
window.CameraFeed = CameraFeed;
