// Settings, Friends, Inbox views — lighter implementations.

const SettingsView = ({ onClose, onAccentChange, accent, theme, onThemeChange }) => {
  const [tab, setTab] = React.useState('voice');
  const groups = [
    { label: 'Учётная запись', items: [
      { id: 'account', name: 'Моя учётная запись' },
      { id: 'profile', name: 'Профили' },
      { id: 'privacy', name: 'Конфиденциальность' },
    ]},
    { label: 'Настройки приложения', items: [
      { id: 'appearance', name: 'Внешний вид' },
      { id: 'voice', name: 'Голос и видео' },
      { id: 'notif', name: 'Уведомления' },
      { id: 'keys', name: 'Горячие клавиши' },
      { id: 'lang', name: 'Язык' },
    ]},
    { label: 'Подписка', items: [
      { id: 'pro', name: 'HiRoo Pro' },
      { id: 'boosts', name: 'Бусты серверов' },
    ]},
  ];

  return (
    <div style={{ flex: 1, display: 'flex', background: 'var(--bg-1)', minWidth: 0 }}>
      {/* sidebar */}
      <div style={{ width: 232, padding: '60px 10px 20px', background: 'var(--bg-0)', borderRight: '1px solid var(--line)', overflowY: 'auto' }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 16 }}>
            <div style={{ padding: '4px 10px 6px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{g.label}</div>
            {g.items.map(it => (
              <div key={it.id} onClick={() => setTab(it.id)} style={{
                padding: '7px 10px', borderRadius: 6, fontSize: 14,
                color: tab === it.id ? 'var(--text-0)' : 'var(--text-1)',
                background: tab === it.id ? 'var(--bg-active)' : 'transparent',
                cursor: 'pointer',
              }}>{it.name}</div>
            ))}
          </div>
        ))}
      </div>

      {/* content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '60px 60px 40px', position: 'relative', maxWidth: 780 }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 24, right: 24,
          width: 32, height: 32, borderRadius: '50%',
          background: 'transparent', border: '1.5px solid var(--text-2)',
          color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}><Icons.close size={14}/></button>

        {tab === 'voice' && <VoiceSettings/>}
        {tab === 'appearance' && <AppearanceSettings accent={accent} onAccentChange={onAccentChange} theme={theme} onThemeChange={onThemeChange}/>}
        {tab !== 'voice' && tab !== 'appearance' && <PlaceholderSettings name={tab}/>}
      </div>
    </div>
  );
};

const SettingsH1 = ({ children, sub }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-0)', letterSpacing: -0.4 }}>{children}</div>
    {sub && <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 4 }}>{sub}</div>}
  </div>
);

const SettingsSection = ({ title, children }) => (
  <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid var(--line)' }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>{title}</div>
    {children}
  </div>
);

const Slider = ({ value, onChange, label, suffix = '%' }) => (
  <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
      <span style={{ color: 'var(--text-1)' }}>{label}</span>
      <span style={{ color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>{value}{suffix}</span>
    </div>
    <div style={{ position: 'relative', height: 18 }}>
      <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 4, borderRadius: 2, background: 'var(--bg-3)' }}/>
      <div style={{ position: 'absolute', top: 7, left: 0, width: `${value}%`, height: 4, borderRadius: 2, background: 'var(--accent)' }}/>
      <div style={{
        position: 'absolute', left: `calc(${value}% - 9px)`, top: 0,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      }}/>
      <input type="range" min="0" max="100" value={value} onChange={e => onChange(+e.target.value)}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}/>
    </div>
  </div>
);

const Toggle = ({ on, onChange, label, desc }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
    <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-0)' }}>{label}</div>
      {desc && <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{desc}</div>}
    </div>
    <div onClick={() => onChange(!on)} style={{
      width: 42, height: 24, borderRadius: 12, padding: 2,
      background: on ? 'var(--accent)' : 'var(--bg-3)', cursor: 'pointer',
      transition: 'background 140ms',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform 160ms',
      }}/>
    </div>
  </div>
);

const VoiceSettings = () => {
  const [vol, setVol] = React.useState(78);
  const [mic, setMic] = React.useState(65);
  const [noise, setNoise] = React.useState(true);
  const [echo, setEcho] = React.useState(true);
  const [push, setPush] = React.useState(false);
  return (
    <div>
      <SettingsH1 sub="Настройте микрофон, камеру и качество звука">Голос и видео</SettingsH1>

      <SettingsSection title="Устройство ввода">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>МИКРОФОН</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-0)' }}>MacBook Pro Microphone</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono', marginTop: 2 }}>встроенный · 48kHz</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>ВЫВОД</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-0)' }}>AirPods Pro (2-е)</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono', marginTop: 2 }}>bluetooth · 44.1kHz</div>
          </div>
        </div>
        {/* level meter */}
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line)', marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 10 }}>УРОВЕНЬ МИКРОФОНА</div>
          <div style={{ display: 'flex', gap: 2 }}>
            {[...Array(42)].map((_, i) => {
              const pct = i / 42;
              const active = pct < 0.55;
              const danger = pct > 0.85;
              return <div key={i} style={{
                flex: 1, height: 16, borderRadius: 2,
                background: active
                  ? (danger ? 'var(--danger)' : pct > 0.6 ? 'var(--warn)' : 'var(--ok)')
                  : 'var(--bg-3)',
              }}/>
            })}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <Slider value={mic} onChange={setMic} label="Чувствительность микрофона"/>
          <Slider value={vol} onChange={setVol} label="Громкость вывода"/>
        </div>
      </SettingsSection>

      <SettingsSection title="Режим передачи">
        <Toggle on={!push} onChange={(v) => setPush(!v)} label="Голосовая активация" desc="Автоматически определять речь и передавать звук"/>
        <Toggle on={push} onChange={setPush} label="Push-to-talk" desc="Передавать звук только при зажатой клавише"/>
      </SettingsSection>

      <SettingsSection title="Обработка звука">
        <Toggle on={noise} onChange={setNoise} label="Шумоподавление" desc="Нейросетевая фильтрация фонового шума и ударов клавиш"/>
        <Toggle on={echo} onChange={setEcho} label="Эхоподавление" desc="Удалять отражённый звук когда микрофон улавливает колонки"/>
        <Toggle on={true} onChange={()=>{}} label="Автоматическая регулировка усиления" desc="Подстраивать уровень микрофона под громкость голоса"/>
      </SettingsSection>
    </div>
  );
};

const AccentSwatch = ({ hex, active, onPick }) => (
  <button onClick={onPick} style={{
    width: 38, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer',
    background: hex, boxShadow: active ? `0 0 0 3px var(--bg-1), 0 0 0 5px ${hex}` : 'none',
    transition: 'all 140ms',
  }}/>
);

const AppearanceSettings = ({ accent, onAccentChange, theme, onThemeChange }) => {
  const accents = ['#7c5cff','#3ecf8e','#f5a524','#ff5a6a','#4d9bff','#b388ff','#ff6b9d','#e8c77d'];
  return (
    <div>
      <SettingsH1 sub="Тема, акцент и плотность интерфейса">Внешний вид</SettingsH1>

      <SettingsSection title="Тема">
        <div style={{ display: 'flex', gap: 12 }}>
          {['dark', 'light'].map(t => (
            <div key={t} onClick={() => onThemeChange(t)} style={{
              flex: 1, padding: 4, borderRadius: 12,
              border: theme === t ? '2px solid var(--accent)' : '2px solid var(--line)', cursor: 'pointer',
            }}>
              <div style={{
                height: 84, borderRadius: 8,
                background: t === 'dark' ? '#0b0c11' : '#f6f4ef',
                position: 'relative', overflow: 'hidden',
                boxShadow: 'inset 0 0 0 1px rgba(128,128,128,0.1)',
              }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 18, background: t === 'dark' ? '#11131a' : '#fff' }}/>
                <div style={{ position: 'absolute', left: 18, top: 0, bottom: 0, width: 46, background: t === 'dark' ? '#171924' : '#fff', borderLeft: '1px solid rgba(128,128,128,0.08)' }}/>
                {[12,22,32,42,52,62].map(y => <div key={y} style={{ position: 'absolute', left: 70, top: y, height: 3, width: 70, background: 'rgba(128,128,128,0.15)', borderRadius: 2 }}/>)}
                <div style={{ position: 'absolute', right: 8, top: 8, width: 10, height: 10, borderRadius: 3, background: accent }}/>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)', textAlign: 'center', padding: '8px 0 4px' }}>{t === 'dark' ? 'Тёмная' : 'Светлая'}</div>
            </div>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Акцент">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {accents.map(a => <AccentSwatch key={a} hex={a} active={a === accent} onPick={() => onAccentChange(a)}/>)}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 14 }}>
          Акцент применяется к кнопкам, выделению, ссылкам и индикаторам активности.
        </div>
      </SettingsSection>

      <SettingsSection title="Плотность">
        <Toggle on={false} label="Компактный режим" desc="Уменьшить отступы в списках сообщений"/>
        <Toggle on={true} label="Анимации интерфейса" desc="Плавные переходы между экранами"/>
        <Toggle on={true} label="Показывать отметки времени" desc="Время у каждого сообщения, а не только первого"/>
      </SettingsSection>
    </div>
  );
};

const PlaceholderSettings = ({ name }) => (
  <div>
    <SettingsH1 sub="Раздел в прототипе показан как заглушка">{name}</SettingsH1>
    <div style={{ padding: 40, borderRadius: 14, background: 'var(--bg-2)', border: '1px dashed var(--line-strong)', textAlign: 'center', color: 'var(--text-2)' }}>
      Здесь будут настройки раздела «{name}»
    </div>
  </div>
);

window.SettingsView = SettingsView;
