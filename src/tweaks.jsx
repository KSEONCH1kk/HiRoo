// Tweaks panel — accent color + light/dark theme.

const TweaksPanel = ({ show, accent, onAccentChange, theme, onThemeChange }) => {
  if (!show) return null;
  const swatches = [
    { hex: '#7c5cff', name: 'Фиалка' },
    { hex: '#b388ff', name: 'Лаванда' },
    { hex: '#3ecf8e', name: 'Мята' },
    { hex: '#4d9bff', name: 'Лёд' },
    { hex: '#ff6b9d', name: 'Пион' },
    { hex: '#f5a524', name: 'Манго' },
    { hex: '#ff5a6a', name: 'Коралл' },
    { hex: '#e8c77d', name: 'Латунь' },
  ];
  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 200,
      width: 280, borderRadius: 14,
      background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
      padding: 14, animation: 'fadeIn 180ms ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-0)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--accent)' }}><Icons.sparkle size={14}/></span>
          Tweaks
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'Geist Mono' }}>hiroo · design</div>
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '10px 0 8px' }}>Тема</div>
      <div style={{ display: 'flex', gap: 6, background: 'var(--bg-0)', borderRadius: 8, padding: 3 }}>
        {['dark', 'light'].map(t => (
          <div key={t} onClick={() => onThemeChange(t)} style={{
            flex: 1, padding: '7px 10px', borderRadius: 6,
            background: theme === t ? 'var(--bg-3)' : 'transparent',
            color: theme === t ? 'var(--text-0)' : 'var(--text-2)',
            fontSize: 12.5, fontWeight: 500, textAlign: 'center', cursor: 'pointer',
          }}>{t === 'dark' ? 'Тёмная' : 'Светлая'}</div>
        ))}
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '14px 0 8px' }}>Акцент</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {swatches.map(s => (
          <div key={s.hex} onClick={() => onAccentChange(s.hex)} style={{ cursor: 'pointer', textAlign: 'center' }}>
            <div style={{
              width: '100%', height: 40, borderRadius: 8, background: s.hex,
              boxShadow: accent === s.hex ? `inset 0 0 0 2px var(--bg-2), inset 0 0 0 4px ${s.hex}` : 'none',
              border: accent === s.hex ? 'none' : '1px solid var(--line)',
            }}/>
            <div style={{ fontSize: 10.5, color: accent === s.hex ? 'var(--text-0)' : 'var(--text-2)', marginTop: 4, fontFamily: 'Geist Mono' }}>{s.name}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 12, fontFamily: 'Geist Mono', lineHeight: 1.5 }}>
        Изменения применяются ко всем экранам прототипа и сохраняются в HTML.
      </div>
    </div>
  );
};

window.TweaksPanel = TweaksPanel;
