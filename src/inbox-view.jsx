// Inbox view — mentions, replies, missed calls, events.

const InboxView = ({ items, onOpenProfile }) => {
  const [filter, setFilter] = React.useState('all');
  const chips = [
    { id: 'all', label: 'Всё', n: items.length },
    { id: 'mention', label: 'Упоминания', n: items.filter(i => i.kind === 'mention').length },
    { id: 'reply', label: 'Ответы', n: items.filter(i => i.kind === 'reply').length },
    { id: 'call', label: 'Звонки', n: items.filter(i => i.kind === 'call').length },
    { id: 'event', label: 'События', n: items.filter(i => i.kind === 'event').length },
  ];
  const list = filter === 'all' ? items : items.filter(i => i.kind === filter);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', minWidth: 0 }}>
      <div style={{
        height: 48, flexShrink: 0, padding: '0 16px',
        borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: 'var(--text-2)' }}><Icons.inbox size={20}/></span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-0)' }}>Входящие</span>
        <div style={{ flex: 1 }}/>
        <Btn size="sm" variant="soft">Отметить все прочитанными</Btn>
      </div>
      <div style={{ padding: '14px 28px 0', display: 'flex', gap: 8 }}>
        {chips.map(c => (
          <div key={c.id} onClick={() => setFilter(c.id)} style={{
            padding: '6px 12px', borderRadius: 999,
            border: `1px solid ${filter === c.id ? 'var(--accent)' : 'var(--line-strong)'}`,
            background: filter === c.id ? 'var(--bg-active)' : 'transparent',
            color: filter === c.id ? 'var(--accent)' : 'var(--text-1)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {c.label}
            <span style={{ fontFamily: 'Geist Mono', fontSize: 11, opacity: 0.7 }}>{c.n}</span>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 28px 30px' }}>
        {list.map(i => {
          const kindColor = i.kind === 'mention' ? 'var(--accent)' : i.kind === 'reply' ? 'var(--ok)' : i.kind === 'call' ? (i.missed ? 'var(--danger)' : 'var(--accent-2)') : 'var(--warn)';
          const kindLabel = i.kind === 'mention' ? '@ упоминание' : i.kind === 'reply' ? '↩ ответ' : i.kind === 'call' ? (i.missed ? '✕ пропущенный' : '✓ звонок') : '★ событие';
          return (
            <div key={i.id} style={{
              padding: 14, marginBottom: 10, borderRadius: 12,
              background: 'var(--bg-2)', border: '1px solid var(--line)',
              display: 'flex', gap: 12, cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line-strong)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
            >
              <Avatar name={i.from} hue={i.hue} size={40} shape="circle"/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: kindColor, fontFamily: 'Geist Mono', letterSpacing: 0.3 }}>{kindLabel}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-0)' }}>{i.from}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'Geist Mono' }}>· {i.where}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>{i.time}</span>
                </div>
                {i.text && <div style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.5 }}>{i.text}</div>}
                {i.kind === 'call' && i.missed && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <Btn size="sm" icon={<Icons.phone size={13}/>} variant="soft">Перезвонить</Btn>
                    <Btn size="sm" icon={<Icons.send size={13}/>} variant="soft">Ответить сообщением</Btn>
                  </div>
                )}
                {i.kind === 'event' && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <Btn size="sm" variant="soft">Участвую</Btn>
                    <Btn size="sm" variant="soft">Возможно</Btn>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

window.InboxView = InboxView;
