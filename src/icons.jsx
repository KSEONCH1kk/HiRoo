// Icon set — Font Awesome 6 Free (solid + regular).
// Stable API: Icons.name({ size, stroke }) returns an inline FA <i>. `stroke` is ignored
// (FA icons are filled) but kept so existing call sites don't error.

const FaIcon = ({ cls, size = 18, style = {} }) => (
  <i
    className={cls}
    style={{
      fontSize: Math.round(size * 0.82),
      width: size,
      height: size,
      lineHeight: `${size}px`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      ...style,
    }}
    aria-hidden="true"
  />
);

const mk = (cls) => (p = {}) => <FaIcon cls={cls} {...p} />;

const Icons = {
  // nav
  home:        mk('fa-solid fa-house'),
  compass:     mk('fa-solid fa-compass'),
  plus:        mk('fa-solid fa-plus'),
  plusSmall:   mk('fa-solid fa-plus'),
  search:      mk('fa-solid fa-magnifying-glass'),
  hashtag:     mk('fa-solid fa-hashtag'),
  lock:        mk('fa-solid fa-lock'),

  // voice / video
  volume:      mk('fa-solid fa-volume-high'),
  mic:         mk('fa-solid fa-microphone'),
  micOff:      mk('fa-solid fa-microphone-slash'),
  headphones:  mk('fa-solid fa-headphones'),
  headphonesOff: mk('fa-solid fa-headphones-simple'), // no native "off" variant
  video:       mk('fa-solid fa-video'),
  videoOff:    mk('fa-solid fa-video-slash'),
  phone:       mk('fa-solid fa-phone'),
  phoneHang:   mk('fa-solid fa-phone-slash'),
  screen:      mk('fa-solid fa-desktop'),
  screenShare: mk('fa-solid fa-display'),
  noise:       mk('fa-solid fa-wave-square'),
  raise:       mk('fa-solid fa-hand'),

  // ui
  settings:    mk('fa-solid fa-gear'),
  bell:        mk('fa-solid fa-bell'),
  inbox:       mk('fa-solid fa-inbox'),
  users:       mk('fa-solid fa-user-group'),
  user:        mk('fa-solid fa-user'),
  gift:        mk('fa-solid fa-gift'),
  emoji:       mk('fa-regular fa-face-smile'),
  smile:       mk('fa-regular fa-face-smile'),
  gif:         mk('fa-solid fa-image'),
  paperclip:   mk('fa-solid fa-paperclip'),
  send:        mk('fa-solid fa-paper-plane'),
  pin:         mk('fa-solid fa-thumbtack'),
  pushpin:     mk('fa-solid fa-thumbtack'),
  reply:       mk('fa-solid fa-reply'),
  chevronDown: mk('fa-solid fa-chevron-down'),
  chevronRight:mk('fa-solid fa-chevron-right'),
  chevronLeft: mk('fa-solid fa-chevron-left'),
  more:        mk('fa-solid fa-ellipsis'),
  close:       mk('fa-solid fa-xmark'),
  check:       mk('fa-solid fa-check'),
  sparkle:     mk('fa-solid fa-wand-magic-sparkles'),
  expand:      mk('fa-solid fa-up-right-and-down-left-from-center'),
  grid:        mk('fa-solid fa-table-cells-large'),
  min:         mk('fa-solid fa-minus'),
  max:         mk('fa-regular fa-square'),
};

window.Icons = Icons;
