// Server view: channel sidebar, message area, member panel.

const ChannelSidebar = ({ server, categories, activeChannel, onPick, onOpenVoice }) => {
  const [collapsed, setCollapsed] = React.useState({});
  const toggle = (id) => setCollapsed(s => ({...s, [id]: !s[id]}));

  return (
    <div style={{
      width: 252, flexShrink: 0,
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--line)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* server header */}
      <div style={{
        height: 48, padding: '0 14px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)', letterSpacing: -0.1 }}>
          {server.name}
        </div>
        <div style={{ color: 'var(--text-2)', display: 'flex' }}><Icons.chevronDown size={16}/></div>
      </div>

      {/* boosts/events banner */}
      <div style={{ padding: '10px 10px 0' }}>
        <div style={{
          padding: '10px 12px', borderRadius: 10,
          background: 'var(--bg-2)', border: '1px solid var(--line)',
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
        }}>
          <div style={{ color: 'var(--accent)' }}><Icons.sparkle size={18}/></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-0)' }}>События · 2 новых</div>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>стрим в пт · вечеринка в сб</div>
          </div>
        </div>
      </div>

      {/* channel list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 6px 14px' }}>
        {categories.map(cat => {
          const isCol = collapsed[cat.id];
          return (
            <div key={cat.id} style={{ marginBottom: 4 }}>
              <div onClick={() => toggle(cat.id)} style={{
                padding: '10px 6px 6px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', color: 'var(--text-2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  <span style={{ display: 'inline-flex', transform: isCol ? 'rotate(-90deg)' : 'none', transition: 'transform 160ms' }}><Icons.chevronDown size={12}/></span>
                  {cat.name}
                </div>
                <span style={{ opacity: 0.6, display: 'flex' }}><Icons.plusSmall size={14}/></span>
              </div>
              {!isCol && cat.channels.map(ch => {
                const isActive = ch.id === activeChannel;
                const muted = !ch.unread && !isActive;
                const Icon = ch.type === 'voice' ? Icons.volume : ch.locked ? Icons.lock : ch.type === 'settings' ? Icons.settings : Icons.hashtag;
                return (
                  <div key={ch.id}>
                    <div onClick={() => ch.type === 'voice' ? onOpenVoice(ch.id) : onPick(ch.id)} style={{
                      padding: '6px 8px', borderRadius: 6,
                      display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                      background: isActive ? 'var(--bg-active)' : 'transparent',
                      color: isActive ? 'var(--text-0)' : muted ? 'var(--text-2)' : 'var(--text-1)',
                      fontSize: 14, fontWeight: isActive ? 500 : 400,
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Icon size={18} stroke={1.5}/>
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</span>
                      {ch.live && <span style={{
                        fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
                        background: 'var(--danger)', color: '#fff', letterSpacing: 0.5,
                      }}>LIVE</span>}
                      {ch.mentions && <span style={{
                        minWidth: 18, height: 18, padding: '0 5px', borderRadius: 10,
                        background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{ch.mentions}</span>}
                      {ch.unread && !ch.mentions && <div style={{
                        width: 6, height: 6, borderRadius: '50%', background: 'var(--text-0)',
                      }}/>}
                    </div>
                    {/* voice channel — show users */}
                    {ch.type === 'voice' && ch.id === 'ch8' && (
                      <div style={{ padding: '2px 0 6px 26px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {DATA.voice.speakers.slice(0, 3).map(s => (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-1)', padding: '4px 6px', borderRadius: 5 }}>
                            <Avatar name={s.name} hue={s.hue} size={22} shape="circle"/>
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                            {s.muted && <span style={{ color: 'var(--danger)', opacity: 0.7 }}><Icons.micOff size={12}/></span>}
                            {s.screenshare && <span style={{ color: 'var(--ok)' }}><Icons.screen size={12}/></span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MessageAttachment = ({ a }) => {
  if (a.type === 'screenshot' || a.type === 'image') {
    return (
      <div style={{ marginTop: 6 }}>
        <ImagePlaceholder w={a.w} h={a.h} label={a.label} hue={280}/>
      </div>
    );
  }
  return null;
};

const Reactions = ({ rs }) => (
  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
    {rs.map((r, i) => (
      <div key={i} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 10,
        background: 'var(--bg-3)', border: '1px solid var(--line)',
        fontSize: 12, color: 'var(--text-1)', cursor: 'pointer',
      }}>
        <span style={{ fontSize: 13 }}>{r.e}</span>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 11, color: 'var(--text-2)' }}>{r.n}</span>
      </div>
    ))}
    <div style={{
      width: 24, height: 20, borderRadius: 10,
      background: 'transparent', border: '1px dashed var(--line-strong)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-2)', cursor: 'pointer',
    }}><Icons.smile size={12}/></div>
  </div>
);

const Message = ({ m, onOpenProfile }) => {
  if (m.divider) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0 12px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--danger)', opacity: 0.4 }}/>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--danger)', fontFamily: 'Geist Mono', letterSpacing: 0.4 }}>{m.label}</div>
        <div style={{ flex: 1, height: 1, background: 'var(--danger)', opacity: 0.4 }}/>
      </div>
    );
  }
  const roleColor = m.author.role === 'mod' ? 'oklch(70% 0.14 ' + (m.author.hue || 268) + ')' : 'var(--text-0)';
  return (
    <div style={{ padding: m.group ? '8px 16px 2px' : '0 16px 2px 74px', position: 'relative' }} className="msg">
      {m.reply && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginLeft: 40, marginBottom: 2,
          fontSize: 12, color: 'var(--text-2)',
        }}>
          <svg width="22" height="12" viewBox="0 0 22 12" fill="none">
            <path d="M2 12V6a2 2 0 012-2h16" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
          <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>@{m.reply.to}</span>
          <span style={{ opacity: 0.8 }}>{m.reply.text}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        {m.group && (
          <div style={{ cursor: 'pointer' }} onClick={() => onOpenProfile && onOpenProfile(m.author)}>
            <Avatar name={m.author.name} hue={m.author.hue} size={40}/>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {m.group && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: roleColor, cursor: 'pointer' }} onClick={() => onOpenProfile && onOpenProfile(m.author)}>
                {m.author.name}
              </span>
              {m.author.role === 'mod' && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.4, padding: '1px 5px', borderRadius: 3, background: 'var(--accent-soft)', color: 'var(--accent)', textTransform: 'uppercase' }}>МОД</span>}
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>{m.time}</span>
            </div>
          )}
          {m.lines.map((l, i) => (
            <div key={i} style={{
              fontSize: 14.5, color: 'var(--text-0)', lineHeight: 1.45,
              marginTop: m.group && i === 0 ? 2 : 0,
            }}>{l.t}</div>
          ))}
          {m.attachment && <MessageAttachment a={m.attachment}/>}
          {m.reactions && <Reactions rs={m.reactions}/>}
        </div>
      </div>
    </div>
  );
};

const MessageComposer = ({ placeholder, value, setValue, onSend }) => (
  <div style={{ padding: '0 16px 20px' }}>
    <div style={{
      background: 'var(--bg-2)', borderRadius: 12,
      border: '1px solid var(--line)',
      padding: '8px 10px', display: 'flex', alignItems: 'flex-end', gap: 8,
    }}>
      <Btn size="sm" icon={<Icons.plus size={18}/>} title="Добавить"/>
      <input
        value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        placeholder={placeholder}
        style={{
          flex: 1, background: 'transparent', border: 'none', outline: 'none',
          color: 'var(--text-0)', fontSize: 14.5, padding: '7px 4px',
          fontFamily: 'inherit',
        }}
      />
      <Btn size="sm" icon={<Icons.gif size={18}/>}/>
      <Btn size="sm" icon={<Icons.gift size={18}/>}/>
      <Btn size="sm" icon={<Icons.emoji size={18}/>}/>
      <Btn size="sm" variant={value.trim() ? 'primary' : 'ghost'} icon={<Icons.send size={15}/>} onClick={onSend} title="Отправить"/>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 4px 0', fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>
      <span>markdown: **жирный** *курсив* `код`</span>
      <span>enter — отправить · shift+enter — перенос</span>
    </div>
  </div>
);

const ChannelHeader = ({ channel, onToggleMembers, membersOpen }) => (
  <div style={{
    height: 48, flexShrink: 0, padding: '0 16px',
    borderBottom: '1px solid var(--line)',
    display: 'flex', alignItems: 'center', gap: 14,
    background: 'var(--bg-1)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
      <span style={{ color: 'var(--text-2)' }}><Icons.hashtag size={20}/></span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)' }}>{channel.name}</span>
      <span style={{ width: 1, height: 18, background: 'var(--line-strong)', margin: '0 4px' }}/>
      <span style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        обсуждаем всё подряд · будьте аккуратны друг с другом
      </span>
    </div>
    <div style={{ display: 'flex', gap: 2 }}>
      <Btn size="sm" icon={<Icons.bell size={16}/>} title="Уведомления"/>
      <Btn size="sm" icon={<Icons.pushpin size={16}/>} title="Закреплённое"/>
      <Btn size="sm" icon={<Icons.users size={16}/>} active={membersOpen} onClick={onToggleMembers} title="Участники"/>
      <div style={{ width: 1, background: 'var(--line)', margin: '6px 4px' }}/>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--bg-2)', borderRadius: 6,
        padding: '0 10px', height: 28, border: '1px solid var(--line)',
        color: 'var(--text-2)', fontSize: 12, width: 180,
      }}>
        <Icons.search size={14}/>
        <span>Поиск</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'Geist Mono', fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-3)' }}>⌘K</span>
      </div>
    </div>
  </div>
);

const MembersPanel = ({ online, offline, onOpenProfile }) => (
  <div style={{
    width: 240, flexShrink: 0, background: 'var(--bg-1)',
    borderLeft: '1px solid var(--line)',
    overflowY: 'auto', padding: '14px 8px',
  }}>
    <div style={{ padding: '4px 10px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
      В сети — {online.length}
    </div>
    {online.map(u => (
      <div key={u.id} onClick={() => onOpenProfile(u)} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Avatar name={u.name} hue={u.hue} size={32} status={u.status} shape="circle"/>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 500, color: u.role === 'модератор' ? 'oklch(70% 0.14 ' + u.hue + ')' : 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {u.name}
          </div>
          {u.activity && (
            <div style={{ fontSize: 11, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'Geist Mono' }}>
              {u.activity}
            </div>
          )}
        </div>
      </div>
    ))}
    <div style={{ padding: '16px 10px 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
      Не в сети — {offline.length}
    </div>
    {offline.map(u => (
      <div key={u.id} onClick={() => onOpenProfile(u)} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 10px', borderRadius: 6, cursor: 'pointer', opacity: 0.5,
      }}>
        <Avatar name={u.name} hue={u.hue} size={32} shape="circle"/>
        <div style={{ fontSize: 13.5, color: 'var(--text-1)' }}>{u.name}</div>
      </div>
    ))}
  </div>
);

const ServerView = ({ server, categories, activeChannel, onPickChannel, onOpenVoice, onOpenProfile, composer, setComposer, onSend, membersOpen, setMembersOpen, messages }) => {
  const channel = categories.flatMap(c => c.channels).find(c => c.id === activeChannel) || { name: 'общий-чат' };
  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}>
      <ChannelSidebar server={server} categories={categories} activeChannel={activeChannel} onPick={onPickChannel} onOpenVoice={onOpenVoice}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', minWidth: 0 }}>
        <ChannelHeader channel={channel} onToggleMembers={() => setMembersOpen(!membersOpen)} membersOpen={membersOpen}/>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
          {messages.map(m => <Message key={m.id} m={m} onOpenProfile={onOpenProfile}/>)}
        </div>
        <MessageComposer value={composer} setValue={setComposer} onSend={onSend} placeholder={`Написать в #${channel.name}`}/>
      </div>
      {membersOpen && <MembersPanel online={DATA.members.online} offline={DATA.members.offline} onOpenProfile={onOpenProfile}/>}
    </div>
  );
};

window.ServerView = ServerView;
window.Message = Message;
window.MessageComposer = MessageComposer;
