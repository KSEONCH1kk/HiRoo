// Voice channel view: tiled camera feeds + screenshare + voice controls.

const VoiceControls = ({ mic, setMic, cam, setCam, sharing, setSharing, deaf, setDeaf, onHangup, onRaise, raised }) => (
  <div style={{
    position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'var(--bg-0)', borderRadius: 999,
    border: '1px solid var(--line-strong)',
    padding: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
    zIndex: 10,
  }}>
    <CircleBtn icon={mic ? <Icons.mic size={18}/> : <Icons.micOff size={18}/>} onClick={() => setMic(!mic)} active={!mic} danger={!mic} title="Микрофон"/>
    <CircleBtn icon={cam ? <Icons.video size={18}/> : <Icons.videoOff size={18}/>} onClick={() => setCam(!cam)} active={cam} title="Камера"/>
    <CircleBtn icon={<Icons.screenShare size={18}/>} onClick={() => setSharing(!sharing)} active={sharing} accent={sharing} title="Поделиться экраном"/>
    <CircleBtn icon={deaf ? <Icons.headphonesOff size={18}/> : <Icons.headphones size={18}/>} onClick={() => setDeaf(!deaf)} active={deaf} danger={deaf} title="Звук"/>
    <CircleBtn icon={<Icons.raise size={18}/>} onClick={onRaise} active={raised} title="Поднять руку"/>
    <CircleBtn icon={<Icons.sparkle size={18}/>} title="Активности"/>
    <CircleBtn icon={<Icons.more size={18}/>} title="Ещё"/>
    <div style={{ width: 1, height: 24, background: 'var(--line-strong)', margin: '0 2px' }}/>
    <CircleBtn icon={<Icons.phoneHang size={18}/>} onClick={onHangup} danger title="Отключиться"/>
  </div>
);

const CircleBtn = ({ icon, onClick, active, danger, accent, title }) => (
  <button title={title} onClick={onClick} style={{
    width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: 'pointer',
    background: danger ? 'var(--danger)' : accent ? 'var(--accent)' : active ? 'var(--bg-3)' : 'transparent',
    color: danger || accent ? '#fff' : active ? 'var(--text-0)' : 'var(--text-1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 120ms, transform 80ms',
  }}
  onMouseEnter={e => { if (!danger && !accent && !active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
  onMouseLeave={e => { if (!danger && !accent && !active) e.currentTarget.style.background = 'transparent'; }}
  >{icon}</button>
);

const VoiceView = ({ channelName, sharing, setSharing, mic, setMic, cam, setCam, deaf, setDeaf, onHangup }) => {
  const [raised, setRaised] = React.useState(false);
  const speakers = DATA.voice.speakers;
  const shareFeed = speakers.find(s => s.screenshare);
  const tiled = speakers.filter(s => !s.screenshare || !sharing);

  // when not sharing from my side but Ksenia is sharing, show spotlight
  const inSpotlight = sharing || shareFeed;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', minWidth: 0, position: 'relative' }}>
      {/* header */}
      <div style={{
        height: 48, flexShrink: 0, padding: '0 16px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--bg-1)',
      }}>
        <span style={{ color: 'var(--text-2)' }}><Icons.volume size={20}/></span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)' }}>{channelName}</span>
        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--ok)', color: '#fff', fontWeight: 600, letterSpacing: 0.4 }}>В ЭФИРЕ</span>
        <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>
          {speakers.length} участн. · 22мс · 128kbps
        </span>
        <div style={{ flex: 1 }}/>
        <Btn size="sm" icon={<Icons.grid size={16}/>} active title="Сетка"/>
        <Btn size="sm" icon={<Icons.expand size={16}/>} title="На весь экран"/>
      </div>

      {/* video grid / spotlight */}
      <div style={{ flex: 1, padding: 14, minHeight: 0, display: 'flex', gap: 14, flexDirection: 'column' }}>
        {inSpotlight ? (
          <>
            {/* big screenshare tile */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <CameraFeed
                  name={sharing ? 'Мирослава (вы)' : shareFeed.name}
                  hue={sharing ? 268 : shareFeed.hue}
                  screenshare
                  label="транслирует экран · HD 1080"
                  style={{ position: 'absolute', inset: 0 }}
                />
              </div>
              {/* right column: speaker tiles */}
              <div style={{ width: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {speakers.map(s => (
                  <div key={s.id} style={{ height: 124 }}>
                    <CameraFeed name={s.self ? 'Вы' : s.name} hue={s.hue} muted={s.muted} speaking={s.speaking} style={{ height: '100%' }}/>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div style={{
            flex: 1, display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gridAutoRows: '1fr', gap: 12, minHeight: 0,
          }}>
            {speakers.map(s => (
              <CameraFeed
                key={s.id}
                name={s.self ? 'Вы' : s.name}
                hue={s.hue}
                muted={s.muted}
                speaking={s.speaking}
              />
            ))}
          </div>
        )}

        {/* activity rail */}
        <div style={{
          height: 56, borderRadius: 12, background: 'var(--bg-1)',
          border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', padding: '0 14px', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: 'var(--accent)' }}><Icons.sparkle size={16}/></div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)' }}>Запустить активность</span>
          </div>
          {['Watch Together', 'Poker Night', 'Chess', 'Sketch Heads'].map(n => (
            <div key={n} style={{
              padding: '5px 10px', borderRadius: 6,
              background: 'var(--bg-2)', border: '1px solid var(--line)',
              fontSize: 12, color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'Geist Mono',
            }}>{n}</div>
          ))}
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>
            шифрование end-to-end · opus 48kHz
          </span>
        </div>
      </div>

      <VoiceControls
        mic={mic} setMic={setMic}
        cam={cam} setCam={setCam}
        sharing={sharing} setSharing={setSharing}
        deaf={deaf} setDeaf={setDeaf}
        onHangup={onHangup}
        onRaise={() => setRaised(!raised)}
        raised={raised}
      />
      <div style={{ height: 80 }}/>
    </div>
  );
};

window.VoiceView = VoiceView;
