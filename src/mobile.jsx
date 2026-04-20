// Mobile screens — iOS-framed variants of key flows.

const MobileChat = ({ dark = true }) => {
  const bg = dark ? '#000' : '#F2F2F7';
  const surface = dark ? '#0b0c11' : '#fff';
  const text = dark ? '#f2f2f6' : '#14141a';
  const sub = dark ? '#8a8c99' : '#696b79';
  const line = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const accent = 'var(--accent)';
  return (
    <div style={{ width: '100%', height: '100%', background: surface, display: 'flex', flexDirection: 'column', color: text }}>
      <div style={{ height: 54 }}/>
      {/* channel header */}
      <div style={{ padding: '8px 14px 12px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${line}` }}>
        <span style={{ color: sub }}><Icons.chevronLeft size={22}/></span>
        <Avatar name="Ксения" hue={290} size={32} shape="circle" status="online"/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Ксения</div>
          <div style={{ fontSize: 11.5, color: sub, fontFamily: 'Geist Mono' }}>в сети</div>
        </div>
        <span style={{ color: sub }}><Icons.phone size={20}/></span>
        <span style={{ color: sub }}><Icons.video size={20}/></span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {[
          { me: false, t: 'смотри, я накидала два варианта обложки — какой ближе?', time: '21:02' },
          { me: false, img: true, time: '21:02' },
          { me: true, t: 'первый — но шрифт в нём хочется крупнее и жёстче', time: '21:05' },
          { me: true, t: 'второй слишком мягкий, теряется ощущение драйва', time: '21:05' },
          { me: false, t: 'окей, попробую Geist Display 700', time: '21:08' },
          { me: true, t: 'вот это ДА. это оно 🔥', time: '21:41' },
          { me: false, t: 'ураа 🫶 ок, в 8 созвонимся финалить', time: '21:42' },
        ].map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.me ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
            <div style={{
              maxWidth: '78%',
              padding: m.img ? 4 : '8px 12px',
              borderRadius: 18,
              background: m.img ? 'transparent' : m.me ? accent : dark ? '#1e1f2a' : '#e9e8e2',
              color: m.me ? '#fff' : text,
              fontSize: 14.5, lineHeight: 1.35,
            }}>
              {m.img ? <ImagePlaceholder w={220} h={140} label="обложка-v1.png" hue={290}/> : m.t}
            </div>
          </div>
        ))}
      </div>
      {/* composer */}
      <div style={{ padding: '8px 10px 10px', borderTop: `1px solid ${line}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: dark ? '#1e1f2a' : '#e9e8e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: sub }}><Icons.plus size={18}/></div>
        <div style={{ flex: 1, background: dark ? '#1e1f2a' : '#fff', borderRadius: 18, padding: '8px 14px', fontSize: 14, color: sub, border: `1px solid ${line}` }}>Сообщение</div>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icons.send size={16}/></div>
      </div>
      <div style={{ height: 10 }}/>
    </div>
  );
};

const MobileVoice = () => (
  <div style={{ width: '100%', height: '100%', background: '#0b0c11', color: '#fff', display: 'flex', flexDirection: 'column' }}>
    <div style={{ height: 54 }}/>
    <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ color: '#8a8c99' }}><Icons.chevronDown size={22}/></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>Главная комната</div>
        <div style={{ fontSize: 11, color: '#8a8c99', fontFamily: 'Geist Mono' }}>Ночной Кортекс · 4 участн.</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', background: '#3ecf8e', color: '#fff', borderRadius: 4 }}>LIVE</span>
    </div>
    {/* speaker grid */}
    <div style={{ flex: 1, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: '1fr', gap: 10, minHeight: 0 }}>
      {DATA.voice.speakers.map(s => (
        <CameraFeed key={s.id} name={s.self ? 'Вы' : s.name} hue={s.hue} speaking={s.speaking} muted={s.muted}/>
      ))}
    </div>
    {/* controls */}
    <div style={{ padding: '14px 16px 28px', display: 'flex', justifyContent: 'space-around' }}>
      {[
        { icon: <Icons.mic size={20}/>, label: 'Звук', active: true },
        { icon: <Icons.video size={20}/>, label: 'Камера' },
        { icon: <Icons.screenShare size={20}/>, label: 'Экран' },
        { icon: <Icons.users size={20}/>, label: 'Люди' },
      ].map((b, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div style={{ width: 54, height: 54, borderRadius: '50%', background: b.active ? 'var(--accent)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}>{b.icon}</div>
          <div style={{ fontSize: 11, color: '#cfd0d8' }}>{b.label}</div>
        </div>
      ))}
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px' }}><Icons.phoneHang size={20}/></div>
        <div style={{ fontSize: 11, color: '#cfd0d8' }}>Выйти</div>
      </div>
    </div>
  </div>
);

const MobileServers = () => {
  const dark = true;
  const text = '#f2f2f6', sub = '#8a8c99', line = 'rgba(255,255,255,0.08)';
  return (
    <div style={{ width: '100%', height: '100%', background: '#0b0c11', color: text, display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 54 }}/>
      <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, fontSize: 22, fontWeight: 700, letterSpacing: -0.4 }}>Ночной Кортекс</div>
        <span style={{ color: sub }}><Icons.search size={20}/></span>
        <span style={{ color: sub }}><Icons.bell size={20}/></span>
      </div>
      <div style={{ padding: '0 16px 14px', display: 'flex', gap: 10, overflowX: 'auto' }}>
        {DATA.servers.slice(0, 6).map((s, i) => (
          <div key={s.id} style={{ flexShrink: 0, textAlign: 'center', width: 60 }}>
            <div style={{
              width: 54, height: 54, borderRadius: i === 1 ? 14 : 18,
              background: `linear-gradient(135deg, oklch(40% 0.1 ${s.hue}), oklch(24% 0.04 ${s.hue}))`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 600, color: '#fff',
              boxShadow: i === 1 ? '0 0 0 3px var(--accent)' : 'none',
              margin: '0 auto 4px',
            }}>{s.short}</div>
            <div style={{ fontSize: 10.5, color: sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name.split(' ')[0]}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 16px' }}>
        {DATA.categories.slice(0, 3).map(cat => (
          <div key={cat.id} style={{ marginBottom: 12 }}>
            <div style={{ padding: '8px 10px 4px', fontSize: 10.5, color: sub, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.6 }}>{cat.name}</div>
            {cat.channels.map(ch => {
              const Icon = ch.type === 'voice' ? Icons.volume : ch.locked ? Icons.lock : Icons.hashtag;
              return (
                <div key={ch.id} style={{
                  padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                  borderRadius: 10, background: ch.active ? 'var(--bg-active)' : 'transparent',
                  fontSize: 14.5, color: ch.active ? text : (ch.unread ? text : sub),
                }}>
                  <Icon size={18}/>
                  <span style={{ flex: 1 }}>{ch.name}</span>
                  {ch.mentions && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 10, background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{ch.mentions}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {/* tab bar */}
      <div style={{ display: 'flex', borderTop: `1px solid ${line}`, padding: '6px 0 4px' }}>
        {[
          { icon: <Icons.home size={22}/>, label: 'Серверы', active: true },
          { icon: <Icons.users size={22}/>, label: 'Друзья' },
          { icon: <Icons.inbox size={22}/>, label: 'Входящие', badge: 3 },
          { icon: <Icons.user size={22}/>, label: 'Я' },
        ].map((t, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', color: t.active ? 'var(--accent)' : sub, padding: '4px 0', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>{t.icon}</div>
            <div style={{ fontSize: 10, marginTop: 3 }}>{t.label}</div>
            {t.badge && <span style={{ position: 'absolute', top: 2, right: '32%', minWidth: 15, height: 15, borderRadius: 8, background: 'var(--danger)', color: '#fff', fontSize: 9.5, fontWeight: 700, padding: '0 4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

const MobileCall = () => (
  <div style={{ width: '100%', height: '100%', background: `linear-gradient(160deg, oklch(30% 0.1 290), oklch(14% 0.04 268))`, color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
    <div style={{ height: 80 }}/>
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'Geist Mono', letterSpacing: 0.5, textTransform: 'uppercase' }}>входящий hiroo звонок</div>
    <div style={{ marginTop: 28, animation: 'ringPulse 1.6s infinite' }}>
      <Avatar name="Ксения" hue={290} size={140} shape="circle"/>
    </div>
    <div style={{ marginTop: 22, fontSize: 32, fontWeight: 700, letterSpacing: -0.5 }}>Ксения</div>
    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>видеозвонок · 0:07</div>

    <div style={{ flex: 1 }}/>

    <div style={{ width: '100%', padding: '0 28px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><Icons.phoneHang size={28}/></div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Отклонить</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', backdropFilter: 'blur(20px)' }}><Icons.send size={24}/></div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Ответить</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 70, height: 70, borderRadius: '50%', background: 'var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><Icons.phone size={28}/></div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Принять</div>
      </div>
    </div>
  </div>
);

window.MobileChat = MobileChat;
window.MobileVoice = MobileVoice;
window.MobileServers = MobileServers;
window.MobileCall = MobileCall;
