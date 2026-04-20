// Floating overlays: profile popout, incoming call, command palette.

const ProfilePopout = ({ user, onClose }) => {
  if (!user) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 160ms ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 360, borderRadius: 16,
        background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* banner */}
        <div style={{
          height: 90, background: `linear-gradient(120deg, oklch(38% 0.1 ${user.hue || 268}), oklch(22% 0.06 ${((user.hue||268)+50)%360}))`,
        }}/>
        <div style={{ padding: '0 20px 20px', marginTop: -40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <Avatar name={user.name} hue={user.hue || 268} size={80} ring status="online"/>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 4 }}>
              <Btn size="sm" variant="soft" icon={<Icons.phone size={14}/>}/>
              <Btn size="sm" variant="soft" icon={<Icons.video size={14}/>}/>
              <Btn size="sm" variant="soft" icon={<Icons.more size={14}/>}/>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-0)', letterSpacing: -0.4 }}>{user.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'Geist Mono', marginTop: 2 }}>
              @{(user.name||'').toLowerCase().replace(/\s+/g,'_')}
              {user.role === 'mod' && <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 3, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>МОДЕРАТОР</span>}
            </div>
          </div>

          <div style={{ marginTop: 14, padding: 12, background: 'var(--bg-1)', borderRadius: 10, border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>О себе</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-1)', lineHeight: 1.5 }}>
              дизайн, шрифты, медленные интерфейсы. пишу по-русски и по-английски.
              пн–пт после 20:00 почти всегда онлайн.
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Pill soft color="var(--accent)" icon={<Icons.sparkle size={11}/>}>HiRoo Pro</Pill>
              <Pill soft color="var(--ok)">3 общих сервера</Pill>
              <Pill soft color="var(--warn)">друзья с марта</Pill>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-1)', borderRadius: 10, border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Сейчас</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>F</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-0)' }}>Figma</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>Макет главной · 2ч 14м</div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <div style={{
              flex: 1, height: 36, borderRadius: 8, background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', padding: '0 12px',
              color: 'var(--text-3)', fontSize: 13,
            }}>Написать @{user.name}…</div>
            <Btn size="md" variant="soft" icon={<Icons.smile size={15}/>}/>
          </div>
        </div>
      </div>
    </div>
  );
};

const IncomingCall = ({ show, onAccept, onDecline }) => {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 90,
      width: 320, borderRadius: 14,
      background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      padding: 16, animation: 'fadeIn 240ms ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ animation: 'ringPulse 1.6s infinite' }}>
          <Avatar name="Ксения" hue={290} size={54} shape="circle"/>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'Geist Mono', letterSpacing: 0.3 }}>Входящий видеозвонок</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-0)', marginTop: 2 }}>Ксения</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 1 }}>hiroo · звонит · 0:07</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn size="md" variant="soft" style={{ flex: 1, background: 'var(--danger)', color: '#fff' }} icon={<Icons.phoneHang size={15}/>} onClick={onDecline}>Отклонить</Btn>
        <Btn size="md" style={{ flex: 1, background: 'var(--ok)', color: '#fff' }} icon={<Icons.phone size={15}/>} onClick={onAccept}>Принять</Btn>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center' }}>
        {['Занята, перезвоню', 'Уже еду', 'Напиши сообщением'].map(t => (
          <div key={t} style={{ fontSize: 11, color: 'var(--text-2)', padding: '4px 8px', borderRadius: 10, background: 'var(--bg-1)', border: '1px solid var(--line)', cursor: 'pointer' }}>{t}</div>
        ))}
      </div>
    </div>
  );
};

const CommandPalette = ({ show, onClose }) => {
  if (!show) return null;
  const items = [
    { group: 'Каналы', rows: [
      { icon: <Icons.hashtag size={14}/>, label: 'общий-чат', hint: 'Ночной Кортекс' },
      { icon: <Icons.hashtag size={14}/>, label: 'мемы-и-шитпост', hint: 'Ночной Кортекс' },
      { icon: <Icons.volume size={14}/>, label: 'Главная комната', hint: 'голосовая · 3 человека' },
    ]},
    { group: 'Люди', rows: [
      { icon: <Avatar name="Ксения" hue={290} size={18} shape="circle"/>, label: 'Ксения', hint: '@ксения · в сети' },
      { icon: <Avatar name="реми" hue={150} size={18} shape="circle"/>, label: 'реми', hint: '@remi · в сети' },
    ]},
    { group: 'Действия', rows: [
      { icon: <Icons.settings size={14}/>, label: 'Открыть настройки', hint: '⌘,' },
      { icon: <Icons.users size={14}/>, label: 'Добавить друга', hint: 'по имени или почте' },
      { icon: <Icons.gift size={14}/>, label: 'Подарить HiRoo Pro', hint: '' },
    ]},
  ];
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 110,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 120,
      animation: 'fadeIn 140ms ease-out',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, borderRadius: 14,
        background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icons.search size={18}/>
          <input autoFocus placeholder="Поиск каналов, людей, команд…" style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--text-0)', fontSize: 16, fontFamily: 'inherit',
          }}/>
          <span style={{ fontSize: 11, fontFamily: 'Geist Mono', padding: '2px 6px', borderRadius: 4, background: 'var(--bg-3)', color: 'var(--text-2)' }}>esc</span>
        </div>
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 8 }}>
          {items.map((g, gi) => (
            <div key={gi} style={{ marginBottom: 6 }}>
              <div style={{ padding: '8px 12px 4px', fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{g.group}</div>
              {g.rows.map((r, ri) => (
                <div key={ri} style={{
                  padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10,
                  borderRadius: 6, cursor: 'pointer',
                  background: gi === 0 && ri === 0 ? 'var(--bg-active)' : 'transparent',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = gi === 0 && ri === 0 ? 'var(--bg-active)' : 'transparent'}
                >
                  <span style={{ color: 'var(--text-2)', width: 18, display: 'flex', justifyContent: 'center' }}>{r.icon}</span>
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--text-0)' }}>{r.label}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>{r.hint}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>
          <span><kbd style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--bg-3)' }}>↑↓</kbd> навигация</span>
          <span><kbd style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--bg-3)' }}>↵</kbd> выбрать</span>
          <span><kbd style={{ padding: '1px 5px', borderRadius: 3, background: 'var(--bg-3)' }}>⌘K</kbd> открыть</span>
        </div>
      </div>
    </div>
  );
};

window.ProfilePopout = ProfilePopout;
window.IncomingCall = IncomingCall;
window.CommandPalette = CommandPalette;
