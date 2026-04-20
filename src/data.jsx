// Fake Russian-language data for the prototype.

const DATA = {
  me: {
    id: 'me',
    name: 'Мирослава',
    tag: 'мира',
    status: 'Кодит ночью',
    avatar: { seed: 'mira', hue: 268, label: 'МБ' },
    badges: ['hiroo-pro', 'early'],
  },

  servers: [
    { id: 's1', name: 'Мастерская', short: 'МС', hue: 268, icon: '◈', notif: 3 },
    { id: 's2', name: 'Ночной Кортекс', short: 'НК', hue: 310, icon: '◆', notif: 12, active: true },
    { id: 's3', name: 'Дизайн-братство', short: 'ДБ', hue: 32, icon: '✦' },
    { id: 's4', name: 'Minecraft: Технари', short: 'МТ', hue: 142, icon: '▣', notif: 1 },
    { id: 's5', name: 'Студия 37', short: '37', hue: 200, icon: '◉' },
    { id: 's6', name: 'Рокот', short: 'РК', hue: 5, icon: '◎' },
    { id: 's7', name: 'Читальный клуб', short: 'ЧК', hue: 48, icon: '❋' },
  ],

  categories: [
    {
      id: 'c1', name: 'приветствие', channels: [
        { id: 'ch1', name: 'правила', type: 'text' },
        { id: 'ch2', name: 'объявления', type: 'text', locked: true },
        { id: 'ch3', name: 'представься', type: 'text', unread: true },
      ]
    },
    {
      id: 'c2', name: 'текстовые каналы', channels: [
        { id: 'ch4', name: 'общий-чат', type: 'text', active: true, unread: true },
        { id: 'ch5', name: 'мемы-и-шитпост', type: 'text', unread: true, mentions: 2 },
        { id: 'ch6', name: 'код-и-шрифты', type: 'text' },
        { id: 'ch7', name: 'музыка-дня', type: 'text' },
      ]
    },
    {
      id: 'c3', name: 'голосовые', channels: [
        { id: 'ch8', name: 'Главная комната', type: 'voice', users: 3 },
        { id: 'ch9', name: 'Тихий угол', type: 'voice' },
        { id: 'ch10', name: 'Стримы и шоу', type: 'voice', users: 8, live: true },
      ]
    },
    {
      id: 'c4', name: 'прочее', channels: [
        { id: 'ch11', name: 'настройки', type: 'settings' },
        { id: 'ch12', name: 'архив', type: 'text' },
      ]
    },
  ],

  members: {
    online: [
      { id: 'u1', name: 'Ксения', role: 'модератор', hue: 290, status: 'online', activity: 'Figma — Макет главной' },
      { id: 'u2', name: 'Дэн ▲', role: 'модератор', hue: 20, status: 'online' },
      { id: 'u3', name: 'реми', role: '', hue: 150, status: 'online', activity: 'слушает: Yung Lean' },
      { id: 'u4', name: 'Никита', role: '', hue: 200, status: 'online' },
      { id: 'u5', name: 'yaga.exe', role: '', hue: 310, status: 'idle', activity: 'играет в Balatro' },
      { id: 'u6', name: 'маша 🌙', role: '', hue: 260, status: 'dnd' },
      { id: 'u7', name: 'Артур', role: '', hue: 40, status: 'online' },
      { id: 'u8', name: 'ткач', role: '', hue: 180, status: 'online', activity: 'в голосовом' },
    ],
    offline: [
      { id: 'u9', name: 'Вера', hue: 340, status: 'offline' },
      { id: 'u10', name: 'Юра', hue: 80, status: 'offline' },
      { id: 'u11', name: 'кот в панамке', hue: 120, status: 'offline' },
      { id: 'u12', name: 'лёва', hue: 14, status: 'offline' },
      { id: 'u13', name: 'Алина', hue: 330, status: 'offline' },
    ],
  },

  messages: [
    {
      id: 'm1', group: true, author: { name: 'Ксения', hue: 290, role: 'mod' },
      time: '23:41', new: false,
      lines: [
        { t: 'закинула в дроп-бокс свежие скриншоты макета — посмотрите когда будет минутка 🙌' },
        { t: 'главное — понять, нравится ли движение в шапке. оно щас очень сдержанное.' },
      ]
    },
    {
      id: 'm2', group: true, author: { name: 'реми', hue: 150 },
      time: '23:44', reply: { to: 'Ксения', text: 'закинула в дроп-бокс свежие скриншоты…' },
      lines: [{ t: 'видел, класс. про шапку: у меня ощущение что ещё можно поиграть с инерцией — сейчас будто всё одновременно начинает ехать' }],
    },
    {
      id: 'm3', group: true, author: { name: 'реми', hue: 150 },
      time: '23:44',
      lines: [{ t: 'давайте завтра в 20:00 созвонимся обсудить? голосовая «Главная комната»' }],
      reactions: [{ e: '👍', n: 4 }, { e: '🫡', n: 2 }],
    },
    {
      id: 'mdiv', divider: true, label: '— Новое · сегодня —',
    },
    {
      id: 'm4', group: true, author: { name: 'Дэн ▲', hue: 20, role: 'mod' },
      time: '00:02',
      lines: [{ t: 'напоминание: в пятницу стрим — тема «UI для медленного интернета». @реми принесёт свои заметки.' }],
    },
    {
      id: 'm5', group: false, author: { name: 'Дэн ▲', hue: 20, role: 'mod' },
      time: '00:03',
      lines: [{ t: 'и да, хорошо бы заранее проверить микрофон 🙂' }],
    },
    {
      id: 'm6', group: true, author: { name: 'ткач', hue: 180 },
      time: '00:14',
      lines: [{ t: 'кто-нибудь сейчас в голосовом? залетайте обсудить шрифт, я уже второй час в нём тону' }],
      attachment: { type: 'screenshot', label: 'глифы · ProtoMono-Slab.otf', w: 440, h: 140 },
    },
  ],

  dms: [
    { id: 'd1', name: 'Ксения', hue: 290, last: 'ок, тогда в 8 созвонимся', time: '2м', unread: 2, pinned: true, online: true },
    { id: 'd2', name: 'реми', hue: 150, last: 'фото пришлю вечером', time: '17м', online: true },
    { id: 'd3', name: 'Дэн ▲', hue: 20, last: 'пиши, если что', time: '1ч', typing: true },
    { id: 'dg1', group: true, members: ['Ксения','реми','Дэн','Артур'], hue: 268, last: 'реми: какой формат?', time: '3ч', unread: 7 },
    { id: 'd4', name: 'Артур', hue: 40, last: 'вложения (2)', time: '5ч', online: false },
    { id: 'd5', name: 'yaga.exe', hue: 310, last: 'спасибо 🫶', time: '8ч' },
    { id: 'd6', name: 'маша 🌙', hue: 260, last: 'ок', time: 'вчера' },
    { id: 'dg2', group: true, members: ['Вера','Юра','Алина'], hue: 200, last: 'Вера: встретимся в 7', time: 'вчера' },
    { id: 'd7', name: 'кот в панамке', hue: 120, last: 'меее', time: 'ср' },
    { id: 'd8', name: 'Вера', hue: 340, last: 'поздравляю 🎉', time: 'пн' },
  ],

  dmThread: [
    { id: 'dm1', author: 'Ксения', hue: 290, time: '21:02', text: 'смотри, я накидала два варианта обложки — какой ближе?', },
    { id: 'dm2', author: 'Ксения', hue: 290, time: '21:02', attachment: { type: 'image', label: 'обложка-v1.png', w: 320, h: 200 } },
    { id: 'dm3', author: 'me', time: '21:05', text: 'первый — но шрифт в нём хочется крупнее и жёстче' },
    { id: 'dm4', author: 'me', time: '21:05', text: 'второй слишком «мягкий», теряется ощущение драйва' },
    { id: 'dm5', author: 'Ксения', hue: 290, time: '21:08', text: 'окей принято. сейчас попробую версию с Geist Display 700' },
    { id: 'dm6', author: 'Ксения', hue: 290, time: '21:32', attachment: { type: 'image', label: 'обложка-v2.png', w: 320, h: 200 } },
    { id: 'dm7', author: 'me', time: '21:41', text: 'вот это ДА. это оно.', reactions: [{e: '🔥', n: 2}] },
    { id: 'dm8', author: 'Ксения', hue: 290, time: '21:42', text: 'ураа 🫶 ок, тогда в 8 созвонимся финалить' },
  ],

  voice: {
    name: 'Главная комната',
    server: 'Ночной Кортекс',
    speakers: [
      { id: 'v1', name: 'реми', hue: 150, speaking: true, cam: false },
      { id: 'v2', name: 'Ксения', hue: 290, speaking: false, cam: true, screenshare: true },
      { id: 'v3', name: 'Дэн ▲', hue: 20, speaking: false, cam: false, muted: true },
      { id: 'v4', name: 'Мирослава', hue: 268, speaking: false, cam: false, self: true },
    ]
  },

  inbox: [
    { id: 'i1', kind: 'mention', from: 'Дэн ▲', hue: 20, where: '#общий-чат · Ночной Кортекс', text: '@мира, скинь мне вчерашний черновик — хочу посмотреть до встречи', time: '12м' },
    { id: 'i2', kind: 'reply', from: 'реми', hue: 150, where: '#код-и-шрифты · Ночной Кортекс', text: 'да, абсолютно — у меня та же мысль про засечки', time: '1ч' },
    { id: 'i3', kind: 'call', from: 'Ксения', hue: 290, where: 'пропущенный звонок · 3 мин', time: '3ч', missed: true },
    { id: 'i4', kind: 'mention', from: 'ткач', hue: 180, where: '#мемы-и-шитпост · Ночной Кортекс', text: '@мира смотри что нашёл, точно в твоём духе', time: '5ч' },
    { id: 'i5', kind: 'event', from: 'Мастерская', hue: 268, where: 'новое событие · пятница 19:00', text: '«Медленный интернет» — стрим и обсуждение', time: '1д' },
  ],

  friends: [
    { id: 'f1', name: 'Ксения', hue: 290, status: 'online', activity: 'Figma — Макет главной', since: '2 часа' },
    { id: 'f2', name: 'реми', hue: 150, status: 'online', activity: 'слушает: Yung Lean — Ginseng Strip' },
    { id: 'f3', name: 'Дэн ▲', hue: 20, status: 'online', activity: 'в голосовом · Мастерская' },
    { id: 'f4', name: 'Артур', hue: 40, status: 'online' },
    { id: 'f5', name: 'ткач', hue: 180, status: 'online', activity: 'играет в Factorio' },
    { id: 'f6', name: 'yaga.exe', hue: 310, status: 'idle', activity: 'нет уже 40 минут' },
    { id: 'f7', name: 'маша 🌙', hue: 260, status: 'dnd', activity: 'фокус-режим до 18:00' },
    { id: 'f8', name: 'Никита', hue: 200, status: 'offline' },
    { id: 'f9', name: 'Вера', hue: 340, status: 'offline' },
    { id: 'f10', name: 'кот в панамке', hue: 120, status: 'offline' },
  ],
};

window.DATA = DATA;
