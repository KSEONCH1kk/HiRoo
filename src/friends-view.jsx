// Friends + Inbox views.

const FriendsView = ({ friends, onOpenProfile }) => {
  const [tab, setTab] = React.useState('online');
  const tabs = [
    { id: 'online', label: 'В сети' },
    { id: 'all', label: 'Все' },
    { id: 'pending', label: 'Входящие', badge: 2 },
    { id: 'blocked', label: 'Заблокированные' },
  ];
  const list = tab === 'online' ? friends.filter(f => f.status === 'online' || f.status === 'idle' || f.status === 'dnd') : friends;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', minWidth: 0 }}>
      {/* header */}
      <div style={{
        height: 48, flexShrink: 0, padding: '0 16px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 16, background: 'var(--bg-1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--text-2)' }}><Icons.users size={20}/></span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)' }}>Друзья</span>
        </div>
        <div style={{ width: 1, height: 18, background: 'var(--line-strong)' }}/>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '5px 10px', borderRadius: 6, fontSize: 13.5, fontWeight: 500,
            color: tab === t.id ? 'var(--text-0)' : 'var(--text-2)',
            background: tab === t.id ? 'var(--bg-active)' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.label}
            {t.badge && <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: 'var(--danger)', color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.badge}</span>}
          </div>
        ))}
        <div style={{
          marginLeft: 8, padding: '5px 11px', borderRadius: 6, fontSize: 13.5, fontWeight: 500,
          background: 'var(--ok)', color: '#fff', cursor: 'pointer',
        }}>+ Добавить друга</div>
      </div>

      {/* body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
          <div style={{ position: 'sticky', top: 0, background: 'var(--bg-1)', paddingBottom: 10 }}>
            <div style={{
              height: 34, background: 'var(--bg-2)', borderRadius: 6,
              border: '1px solid var(--line)', display: 'flex', alignItems: 'center',
              padding: '0 12px', gap: 8, color: 'var(--text-2)', fontSize: 13,
            }}>
              <Icons.search size={14}/>
              <span>Поиск</span>
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.6, margin: '14px 0 8px' }}>
            {tab === 'online' ? 'В сети' : 'Все друзья'} — {list.length}
          </div>
          {list.map(f => (
            <div key={f.id} onClick={() => onOpenProfile(f)} style={{
              padding: '12px 10px',
              display: 'flex', alignItems: 'center', gap: 12,
              borderTop: '1px solid var(--line)', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Avatar name={f.name} hue={f.hue} size={38} status={f.status} shape="circle"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{f.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: 'Geist Mono', marginTop: 1 }}>
                  {f.activity || (f.status === 'online' ? 'в сети' : f.status === 'idle' ? 'не активен' : f.status === 'dnd' ? 'не беспокоить' : 'не в сети')}
                </div>
              </div>
              <Btn size="sm" icon={<Icons.send size={14}/>} variant="soft" title="Сообщение"/>
              <Btn size="sm" icon={<Icons.more size={14}/>} variant="soft"/>
            </div>
          ))}
        </div>

        {/* active now rail */}
        <div style={{ width: 320, background: 'var(--bg-0)', borderLeft: '1px solid var(--line)', padding: 20, overflowY: 'auto' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-0)', marginBottom: 14 }}>Сейчас активно</div>
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>В голосовом</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Avatar name="Дэн" hue={20} size={36} shape="circle"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--text-0)', fontWeight: 500 }}>Дэн ▲</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Мастерская · Планёрка</div>
              </div>
              <Btn size="sm" variant="soft" icon={<Icons.phone size={14}/>}>Зайти</Btn>
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--line)', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Играет</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Avatar name="yaga" hue={310} size={36} shape="circle"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--text-0)', fontWeight: 500 }}>yaga.exe</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Balatro · 47 мин</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Слушает</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <Avatar name="реми" hue={150} size={36} shape="circle"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: 'var(--text-0)', fontWeight: 500 }}>реми</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>Yung Lean — Ginseng Strip</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.FriendsView = FriendsView;
