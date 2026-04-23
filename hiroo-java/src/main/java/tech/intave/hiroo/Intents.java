package tech.intave.hiroo;

/**
 * Gateway intents. Combine with bitwise OR. Privileged intents
 * (GUILD_MEMBERS, GUILD_PRESENCES, MESSAGE_CONTENT) must be enabled
 * in the bot dashboard before the gateway will accept them.
 */
public final class Intents {
    public static final int GUILDS                   = 1 << 0;
    public static final int GUILD_MEMBERS            = 1 << 1;   // privileged
    public static final int GUILD_BANS               = 1 << 2;
    public static final int GUILD_VOICE_STATES       = 1 << 3;
    public static final int GUILD_PRESENCES          = 1 << 4;   // privileged
    public static final int GUILD_MESSAGES           = 1 << 5;
    public static final int GUILD_MESSAGE_REACTIONS  = 1 << 6;
    public static final int GUILD_MESSAGE_TYPING     = 1 << 7;
    public static final int DIRECT_MESSAGES          = 1 << 8;
    public static final int DIRECT_MESSAGE_REACTIONS = 1 << 9;
    public static final int DIRECT_MESSAGE_TYPING    = 1 << 10;
    public static final int MESSAGE_CONTENT          = 1 << 15;  // privileged
    public static final int GUILD_SCHEDULED_EVENTS   = 1 << 16;

    private Intents() {}

    /** Everything that's free — no privileged intents. */
    public static int defaults() {
        return GUILDS | GUILD_BANS | GUILD_VOICE_STATES
             | GUILD_MESSAGES | GUILD_MESSAGE_REACTIONS | GUILD_MESSAGE_TYPING
             | DIRECT_MESSAGES | DIRECT_MESSAGE_REACTIONS | DIRECT_MESSAGE_TYPING
             | GUILD_SCHEDULED_EVENTS;
    }

    public static int all() {
        return GUILDS | GUILD_MEMBERS | GUILD_BANS | GUILD_VOICE_STATES
             | GUILD_PRESENCES | GUILD_MESSAGES | GUILD_MESSAGE_REACTIONS
             | GUILD_MESSAGE_TYPING | DIRECT_MESSAGES | DIRECT_MESSAGE_REACTIONS
             | DIRECT_MESSAGE_TYPING | MESSAGE_CONTENT | GUILD_SCHEDULED_EVENTS;
    }
}
