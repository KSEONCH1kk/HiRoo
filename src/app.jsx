// Main App. Sections: Desktop prototype (live), and design-canvas with variants + mobile screens.

const { useState, useEffect, useRef } = React;

// Parse the persisted tweak defaults
const readTweaks = () => {
  try {
    const txt = document.getElementById('tweaks-config').textContent;
    const json = txt.match(/\{[\s\S]*\}/)[0];
    return JSON.parse(json);
  } catch {return { accent: '#7c5cff', theme: 'dark' };}
};

function App() {
  const t0 = readTweaks();
  const [accent, setAccent] = useState(t0.accent || '#7c5cff');
  const [theme, setTheme] = useState(t0.theme || 'dark');
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [section, setSection] = useState(() => localStorage.getItem('hiroo-section') || 'desktop');

  // Desktop state
  const [activeMode, setActiveMode] = useState('server'); // server, dms, friends, inbox, settings, voice, explore
  const [activeServer, setActiveServer] = useState('s2');
  const [activeChannel, setActiveChannel] = useState('ch4');
  const [activeDM, setActiveDM] = useState('d1');
  const [membersOpen, setMembersOpen] = useState(true);
  const [composer, setComposer] = useState('');
  const [messages, setMessages] = useState(DATA.messages);
  const [dmThread, setDmThread] = useState(DATA.dmThread);
  const [profile, setProfile] = useState(null);
  const [incoming, setIncoming] = useState(false);
  const [cmd, setCmd] = useState(false);

  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(false);
  const [deaf, setDeaf] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [inVoice, setInVoice] = useState(false);

  // persist section
  useEffect(() => {localStorage.setItem('hiroo-section', section);}, [section]);

  // apply theme + accent
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-soft', `${accent}26`);
  }, [theme, accent]);

  // Edit-mode protocol (must register listener BEFORE announcing)
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === '__activate_edit_mode') setTweaksOpen(true);
      if (d.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Cmd+K
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {e.preventDefault();setCmd((c) => !c);}
      if (e.key === 'Escape') {setCmd(false);setProfile(null);}
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const pushEdit = (edits) => {
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
  };
  const onAccent = (v) => {setAccent(v);pushEdit({ accent: v });};
  const onTheme = (v) => {setTheme(v);pushEdit({ theme: v });};

  const server = DATA.servers.find((s) => s.id === activeServer);
  const dm = DATA.dms.find((d) => d.id === activeDM) || DATA.dms[0];

  const onSend = () => {
    if (!composer.trim()) return;
    if (activeMode === 'server') {
      setMessages((m) => [...m, {
        id: 'new' + Date.now(), group: true, author: { name: 'Мирослава', hue: 268 },
        time: new Date().toTimeString().slice(0, 5),
        lines: [{ t: composer }]
      }]);
    } else if (activeMode === 'dms') {
      setDmThread((t) => [...t, { id: 'new' + Date.now(), author: 'me', time: new Date().toTimeString().slice(0, 5), text: composer }]);
    }
    setComposer('');
  };

  const onOpenVoice = () => {setInVoice(true);setActiveMode('voice');};
  const onHangup = () => {setInVoice(false);setActiveMode('server');};

  // ─── Section switcher ───
  const sectionBar =
  <div style={{
    position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
    zIndex: 70, background: 'rgba(10,11,16,0.82)', backdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 999, padding: 4, display: 'flex', gap: 2,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
  }}>
      {[
    { id: 'desktop', label: 'Прототип · Desktop' },
    { id: 'mobile', label: 'Mobile' },
    { id: 'canvas', label: 'Состояния' }].
    map((s) =>
    <div key={s.id} onClick={() => setSection(s.id)} style={{
      padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
      background: section === s.id ? accent : 'transparent',
      color: section === s.id ? '#fff' : 'rgba(255,255,255,0.75)',
      fontFamily: 'Geist'
    }}>{s.label}</div>
    )}
    </div>;


  return (
    <>
      {sectionBar}

      {section === 'desktop' &&
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
          <TitleBar title={
        activeMode === 'server' ? server.name :
        activeMode === 'dms' ? `Личные · ${dm.group ? 'Группа' : dm.name}` :
        activeMode === 'voice' ? `Голос · ${DATA.voice.name}` :
        activeMode === 'friends' ? 'Друзья' :
        activeMode === 'inbox' ? 'Входящие' :
        activeMode === 'settings' ? 'Настройки' : 'HiRoo'
        } />
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', width: 72, flexShrink: 0 }}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                <ServerRail
                servers={DATA.servers}
                activeServer={activeServer}
                activeMode={activeMode}
                onPick={(id) => {setActiveServer(id);setActiveMode('server');}}
                onPickMode={(m) => setActiveMode(m)} />
              
              </div>
              <UserTray me={DATA.me} mic={mic} setMic={setMic} deaf={deaf} setDeaf={setDeaf} onSettings={() => setActiveMode('settings')} inVoice={inVoice} onHangup={onHangup} />
            </div>

            {activeMode === 'server' &&
          <ServerView
            server={server}
            categories={DATA.categories}
            activeChannel={activeChannel}
            onPickChannel={setActiveChannel}
            onOpenVoice={(id) => {setActiveChannel(id);onOpenVoice();}}
            onOpenProfile={setProfile}
            composer={composer} setComposer={setComposer} onSend={onSend}
            membersOpen={membersOpen} setMembersOpen={setMembersOpen}
            messages={messages} />

          }

            {activeMode === 'dms' &&
          <>
                <DMSidebar dms={DATA.dms} activeDM={activeDM} onPick={setActiveDM}
            onOpenFriends={() => setActiveMode('friends')}
            onOpenInbox={() => setActiveMode('inbox')}
            mode="dms" />
            
                <DMView dm={dm} thread={dmThread}
            onCall={() => setIncoming(true)}
            onVideoCall={() => setIncoming(true)}
            onOpenProfile={setProfile}
            composer={composer} setComposer={setComposer} onSend={onSend} />
            
              </>
          }

            {activeMode === 'voice' &&
          <VoiceView
            channelName={DATA.voice.name}
            mic={mic} setMic={setMic}
            cam={cam} setCam={setCam}
            deaf={deaf} setDeaf={setDeaf}
            sharing={sharing} setSharing={setSharing}
            onHangup={onHangup} />

          }

            {activeMode === 'friends' && <FriendsView friends={DATA.friends} onOpenProfile={setProfile} />}
            {activeMode === 'inbox' && <InboxView items={DATA.inbox} onOpenProfile={setProfile} />}
            {activeMode === 'settings' && <SettingsView onClose={() => setActiveMode('server')} accent={accent} onAccentChange={onAccent} theme={theme} onThemeChange={onTheme} />}
            {activeMode === 'explore' && <ExploreView />}
          </div>

          <ProfilePopout user={profile} onClose={() => setProfile(null)} />
          <IncomingCall show={incoming} onAccept={() => {setIncoming(false);onOpenVoice();}} onDecline={() => setIncoming(false)} />
          <CommandPalette show={cmd} onClose={() => setCmd(false)} />

          {/* bottom helper */}
          <div style={{ position: 'fixed', left: 88, bottom: 14, zIndex: 30, display: 'flex', gap: 8 }}>
            <div onClick={() => setCmd(true)} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(20,22,30,0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'Geist Mono', cursor: 'pointer' }}>
              ⌘K · поиск
            </div>
            <div onClick={() => setIncoming(true)} style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(20,22,30,0.8)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 11.5, color: 'var(--text-2)', fontFamily: 'Geist Mono', cursor: 'pointer' }}>
              📞 входящий
            </div>
          </div>
        </div>
      }

      {section === 'mobile' && <MobileSection />}
      {section === 'canvas' && <CanvasSection accent={accent} onAccent={onAccent} />}

      <TweaksPanel show={tweaksOpen} accent={accent} onAccentChange={onAccent} theme={theme} onThemeChange={onTheme} />
    </>);

}

// ─── Explore placeholder ───
const ExploreView = () =>
<div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-1)', padding: 40 }}>
    <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-0)', letterSpacing: -0.6, marginBottom: 8 }}>Обзор серверов</div>
    <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24 }}>Находите сообщества по интересам</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
      {[
    { name: 'Медленные интерфейсы', members: '4.2k', hue: 268, desc: 'UX без анимаций и суеты' },
    { name: 'Шрифтовая лаборатория', members: '12.8k', hue: 32, desc: 'Кириллица, латинка, всякое' },
    { name: 'Собиратели мха', members: '742', hue: 142, desc: 'Тихий клуб ботаников' },
    { name: 'Ночные коты', members: '8.1k', hue: 200, desc: 'Мемы, поддержка, коты' },
    { name: 'Веб-археология', members: '2.3k', hue: 340, desc: 'Интернет до 2005' },
    { name: 'Читальный клуб', members: '987', hue: 48, desc: 'Одна книга в месяц' }].
    map((s, i) =>
    <div key={i} style={{ borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', overflow: 'hidden' }}>
          <div style={{ height: 72, background: `linear-gradient(140deg, oklch(38% 0.1 ${s.hue}), oklch(22% 0.05 ${(s.hue + 30) % 360}))` }} />
          <div style={{ padding: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)' }}>{s.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '4px 0 10px' }}>{s.desc}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>{s.members} участников</div>
          </div>
        </div>
    )}
    </div>
  </div>;


// ─── Mobile section ───
const MobileSection = () =>
<div style={{ minHeight: '100vh', background: 'var(--bg-0)', padding: '80px 40px 60px', display: 'flex', flexWrap: 'wrap', gap: 40, justifyContent: 'center' }}>
    {[
  { title: 'Серверы · каналы', el: <MobileServers /> },
  { title: 'DM · 1:1', el: <MobileChat /> },
  { title: 'Голосовой канал', el: <MobileVoice /> },
  { title: 'Входящий звонок', el: <MobileCall /> }].
  map((s, i) =>
  <div key={i} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'Geist Mono', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.title}</div>
        <IOSDevice dark width={340} height={740}>
          {s.el}
        </IOSDevice>
      </div>
  )}
  </div>;


// ─── Canvas variant section ───
const CanvasSection = () =>
<div style={{ minHeight: '100vh', background: 'var(--bg-0)', padding: '80px 40px 60px' }}>
    <div style={{ maxWidth: 1200, margin: '0 auto', marginBottom: 36 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-0)', letterSpacing: -0.5 }}>Состояния и компоненты</div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 6 }}>
        Мелкие кусочки UI для сверки — чтобы видеть всё одновременно.
      </div>
    </div>

    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 24 }}>

      {/* avatars */}
      <Card title="Аватары · статусы">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
          <Avatar name="Ксения" hue={290} size={48} status="online" />
          <Avatar name="реми" hue={150} size={48} status="idle" />
          <Avatar name="Дэн" hue={20} size={48} status="dnd" />
          <Avatar name="Никита" hue={200} size={48} status="offline" />
          <Avatar name="yaga" hue={310} size={48} ring />
        </div>
      </Card>

      {/* reactions */}
      <Card title="Реакции">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ e: '🔥', n: 4 }, { e: '🫡', n: 2 }, { e: '👏', n: 7 }, { e: '✨', n: 1 }, { e: '💜', n: 12 }].map((r, i) =>
        <div key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 10, background: 'var(--bg-3)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--text-1)' }}>
              <span>{r.e}</span>
              <span style={{ fontFamily: 'Geist Mono', fontSize: 11, color: 'var(--text-2)' }}>{r.n}</span>
            </div>
        )}
        </div>
      </Card>

      {/* buttons */}
      <Card title="Кнопки">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn variant="primary" icon={<Icons.phone size={14} />}>Позвонить</Btn>
          <Btn variant="soft" icon={<Icons.send size={14} />}>Сообщение</Btn>
          <Btn variant="outline">Отмена</Btn>
          <Btn variant="ghost" icon={<Icons.more size={14} />} />
          <Btn danger icon={<Icons.phoneHang size={14} />}>Отклонить</Btn>
        </div>
      </Card>

      {/* toasts */}
      <Card title="Уведомление сообщения">
        <div style={{ padding: 12, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--line-strong)', display: 'flex', gap: 10 }}>
          <Avatar name="Ксения" hue={290} size={36} shape="circle" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Ксения <span style={{ color: 'var(--text-3)', fontWeight: 400, fontFamily: 'Geist Mono', fontSize: 11 }}>· #общий-чат</span></div>
            <div style={{ fontSize: 13, color: 'var(--text-1)', marginTop: 3 }}>ок, тогда в 8 созвонимся</div>
          </div>
        </div>
      </Card>

      {/* speaker tile */}
      <Card title="Говорящий">
        <CameraFeed name="реми" hue={150} speaking style={{ height: 140 }} />
      </Card>

      <Card title="Приглушён">
        <CameraFeed name="Дэн ▲" hue={20} muted style={{ height: 140 }} />
      </Card>

      {/* typing indicator */}
      <Card title="Печатает">
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {[0, 1, 2].map((i) => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-2)', animation: `pulse 1.2s ${i * 0.2}s infinite` }} />)}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Ксения и реми печатают…</span>
        </div>
      </Card>

      {/* channel types */}
      <Card title="Типы каналов">
        {[
      { icon: <Icons.hashtag size={16} />, name: 'общий-чат', desc: 'текст' },
      { icon: <Icons.lock size={16} />, name: 'модераторы', desc: 'приватный' },
      { icon: <Icons.volume size={16} />, name: 'Главная комната', desc: 'голос · 3' },
      { icon: <Icons.sparkle size={16} />, name: 'Стрим пт 20:00', desc: 'событие' }].
      map((c, i) =>
      <div key={i} style={{ padding: '8px 4px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: i < 3 ? '1px solid var(--line)' : 'none' }}>
            <span style={{ color: 'var(--text-2)' }}>{c.icon}</span>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{c.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>{c.desc}</span>
          </div>
      )}
      </Card>

      {/* upload progress */}
      <Card title="Загрузка файла">
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
            <span style={{ color: 'var(--text-1)' }}>обложка-v2.png</span>
            <span style={{ color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>64%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-3)' }}>
            <div style={{ width: '64%', height: '100%', borderRadius: 2, background: 'var(--accent)' }} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'Geist Mono', marginTop: 6 }}>осталось ~4 сек · 2.1 МБ/с</div>
        </div>
      </Card>
    </div>
  </div>;


const Card = ({ title, children }) =>
<div style={{ padding: 20, borderRadius: 14, background: 'var(--bg-1)', border: '1px solid var(--line)' }}>
    <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 14 }}>{title}</div>
    {children}
  </div>;


ReactDOM.createRoot(document.getElementById('root')).render(<App />);