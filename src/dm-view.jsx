// DM view: list of DMs + message thread (1:1 or group).

const DMSidebar = ({ dms, activeDM, onPick, onOpenFriends, onOpenInbox, mode }) => (
  <div style={{
    width: 252, flexShrink: 0, background: 'var(--bg-1)',
    borderRight: '1px solid var(--line)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }}>
    {/* search */}
    <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}>
      <div style={{
        height: 32, background: 'var(--bg-0)', borderRadius: 6,
        border: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
        color: 'var(--text-2)', fontSize: 13,
      }}>
        <Icons.search size={14}/>
        <span>Найти беседу или друга</span>
      </div>
    </div>

    {/* quick nav */}
    <div style={{ padding: '8px 6px', borderBottom: '1px solid var(--line)' }}>
      {[
        { id: 'friends', icon: <Icons.users size={18}/>, label: 'Друзья' },
        { id: 'inbox', icon: <Icons.inbox size={18}/>, label: 'Входящие', badge: 3 },
        { id: 'nitro', icon: <Icons.sparkle size={18}/>, label: 'HiRoo Pro' },
        { id: 'shop', icon: <Icons.gift size={18}/>, label: 'Магазин' },
      ].map(n => (
        <div key={n.id} onClick={() => n.id === 'friends' ? onOpenFriends() : n.id === 'inbox' ? onOpenInbox() : null} style={{
          padding: '7px 10px', borderRadius: 6,
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 14, color: mode === n.id ? 'var(--text-0)' : 'var(--text-1)',
          background: mode === n.id ? 'var(--bg-active)' : 'transparent',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { if (mode !== n.id) e.currentTarget.style.background = 'var(--bg-hover)'; }}
        onMouseLeave={e => { if (mode !== n.id) e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ color: 'var(--text-2)' }}>{n.icon}</span>
          <span style={{ flex: 1 }}>{n.label}</span>
          {n.badge && <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 10, background: 'var(--danger)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n.badge}</span>}
        </div>
      ))}
    </div>

    {/* DM list header */}
    <div style={{ padding: '16px 12px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        Личные сообщения
      </div>
      <Btn size="sm" icon={<Icons.plusSmall size={14}/>} title="Начать беседу"/>
    </div>

    <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>
      {dms.map(d => {
        const isActive = d.id === activeDM;
        return (
          <div key={d.id} onClick={() => onPick(d.id)} style={{
            padding: '7px 8px', borderRadius: 6,
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            background: isActive ? 'var(--bg-active)' : 'transparent',
            position: 'relative',
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
          >
            {d.group
              ? <GroupAvatar members={d.members} hue={d.hue} size={36}/>
              : <Avatar name={d.name} hue={d.hue} size={36} status={d.online ? 'online' : 'offline'} shape="circle"/>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: isActive || d.unread ? 600 : 500, color: 'var(--text-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.group ? d.members.slice(0,3).join(', ') + (d.members.length > 3 ? '…' : '') : d.name}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'Geist Mono', flexShrink: 0 }}>{d.time}</div>
              </div>
              <div style={{ fontSize: 12, color: d.unread ? 'var(--text-1)' : 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                {d.typing ? <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>печатает…</span> : d.last}
              </div>
            </div>
            {d.unread && <div style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.unread}</div>}
            {d.pinned && !d.unread && <span style={{ color: 'var(--text-3)' }}><Icons.pin size={12}/></span>}
          </div>
        );
      })}
    </div>
  </div>
);

const DMHeader = ({ dm, onCall, onVideoCall, onOpenProfile }) => (
  <div style={{
    height: 48, flexShrink: 0, padding: '0 14px',
    borderBottom: '1px solid var(--line)',
    display: 'flex', alignItems: 'center', gap: 12,
    background: 'var(--bg-1)',
  }}>
    {dm.group
      ? <GroupAvatar hue={dm.hue} size={28}/>
      : <Avatar name={dm.name} hue={dm.hue} size={28} status={dm.online ? 'online' : 'offline'} shape="circle"/>
    }
    <div style={{ flex: 1, minWidth: 0 }}>
      <div onClick={() => !dm.group && onOpenProfile({ name: dm.name, hue: dm.hue })} style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)', cursor: dm.group ? 'default' : 'pointer' }}>
        {dm.group ? dm.members.join(', ') : dm.name}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>
        {dm.group ? `${dm.members.length} участников` : dm.online ? 'в сети' : 'не в сети'}
      </div>
    </div>
    <div style={{ display: 'flex', gap: 2 }}>
      <Btn size="sm" icon={<Icons.phone size={16}/>} onClick={onCall} title="Позвонить"/>
      <Btn size="sm" icon={<Icons.video size={16}/>} onClick={onVideoCall} title="Видеозвонок"/>
      <Btn size="sm" icon={<Icons.pushpin size={16}/>}/>
      <Btn size="sm" icon={<Icons.users size={16}/>}/>
    </div>
  </div>
);

const DMMessage = ({ m, prev, onOpenProfile }) => {
  const isMe = m.author === 'me';
  const showHeader = !prev || prev.author !== m.author;
  const hue = isMe ? 268 : (m.hue || 268);
  const name = isMe ? 'Мирослава' : m.author;

  return (
    <div style={{ padding: showHeader ? '8px 20px 2px' : '0 20px 2px 76px' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        {showHeader ? (
          <div style={{ cursor: 'pointer' }} onClick={() => !isMe && onOpenProfile({ name, hue })}>
            <Avatar name={name} hue={hue} size={40}/>
          </div>
        ) : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          {showHeader && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: isMe ? 'var(--accent)' : 'var(--text-0)' }}>{name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>{m.time}</span>
            </div>
          )}
          {m.text && <div style={{ fontSize: 14.5, color: 'var(--text-0)', lineHeight: 1.45 }}>{m.text}</div>}
          {m.attachment && <div style={{ marginTop: 6 }}><ImagePlaceholder w={m.attachment.w} h={m.attachment.h} label={m.attachment.label} hue={hue}/></div>}
          {m.reactions && <Reactions rs={m.reactions}/>}
        </div>
      </div>
    </div>
  );
};

// small inline reactions reusing server-view style
const Reactions2 = ({ rs }) => (
  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
    {rs.map((r, i) => (
      <div key={i} style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '2px 8px', borderRadius: 10,
        background: 'var(--bg-3)', border: '1px solid var(--line)',
        fontSize: 12, color: 'var(--text-1)',
      }}>
        <span>{r.e}</span>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 11, color: 'var(--text-2)' }}>{r.n}</span>
      </div>
    ))}
  </div>
);

const DMIntro = ({ dm }) => (
  <div style={{ padding: '40px 20px 16px', borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {dm.group
        ? <GroupAvatar hue={dm.hue} size={72}/>
        : <Avatar name={dm.name} hue={dm.hue} size={72}/>
      }
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-0)', letterSpacing: -0.5 }}>
          {dm.group ? dm.members.join(', ') : dm.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
          {dm.group
            ? `Это начало группы · создана ${dm.members[0]}`
            : `Это начало истории ваших сообщений с ${dm.name}.`}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <Btn size="sm" variant="outline" icon={<Icons.user size={14}/>}>Профиль</Btn>
          {!dm.group && <Btn size="sm" variant="outline" icon={<Icons.bell size={14}/>}>Уведомления</Btn>}
        </div>
      </div>
    </div>
  </div>
);

const DMView = ({ dm, onCall, onVideoCall, onOpenProfile, composer, setComposer, onSend, thread }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', minWidth: 0 }}>
    <DMHeader dm={dm} onCall={onCall} onVideoCall={onVideoCall} onOpenProfile={onOpenProfile}/>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <DMIntro dm={dm}/>
      {thread.map((m, i) => <DMMessage key={m.id} m={m} prev={thread[i-1]} onOpenProfile={onOpenProfile}/>)}
    </div>
    <MessageComposer value={composer} setValue={setComposer} onSend={onSend} placeholder={`Написать ${dm.group ? 'в группе' : dm.name}`}/>
  </div>
);

window.DMSidebar = DMSidebar;
window.DMView = DMView;
