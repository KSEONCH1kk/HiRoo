// Gateway intents. Privileged intents (GUILD_MEMBERS, GUILD_PRESENCES,
// MESSAGE_CONTENT) must be enabled for your bot in the dashboard.
export const Intents = Object.freeze({
  GUILDS:                   1 << 0,
  GUILD_MEMBERS:            1 << 1,   // privileged
  GUILD_BANS:               1 << 2,
  GUILD_VOICE_STATES:       1 << 3,
  GUILD_PRESENCES:          1 << 4,   // privileged
  GUILD_MESSAGES:           1 << 5,
  GUILD_MESSAGE_REACTIONS:  1 << 6,
  GUILD_MESSAGE_TYPING:     1 << 7,
  DIRECT_MESSAGES:          1 << 8,
  DIRECT_MESSAGE_REACTIONS: 1 << 9,
  DIRECT_MESSAGE_TYPING:    1 << 10,
  MESSAGE_CONTENT:          1 << 15,  // privileged
  GUILD_SCHEDULED_EVENTS:   1 << 16,
});

/** All non-privileged intents — sensible default. */
export function defaultIntents() {
  return (
    Intents.GUILDS |
    Intents.GUILD_BANS |
    Intents.GUILD_VOICE_STATES |
    Intents.GUILD_MESSAGES |
    Intents.GUILD_MESSAGE_REACTIONS |
    Intents.GUILD_MESSAGE_TYPING |
    Intents.DIRECT_MESSAGES |
    Intents.DIRECT_MESSAGE_REACTIONS |
    Intents.DIRECT_MESSAGE_TYPING |
    Intents.GUILD_SCHEDULED_EVENTS
  );
}

export function allIntents() {
  let out = 0;
  for (const v of Object.values(Intents)) out |= v;
  return out;
}
