from enum import IntFlag


class Intents(IntFlag):
    GUILDS                   = 1 << 0
    GUILD_MEMBERS            = 1 << 1   # privileged
    GUILD_BANS               = 1 << 2
    GUILD_VOICE_STATES       = 1 << 3
    GUILD_PRESENCES          = 1 << 4   # privileged
    GUILD_MESSAGES           = 1 << 5
    GUILD_MESSAGE_REACTIONS  = 1 << 6
    GUILD_MESSAGE_TYPING     = 1 << 7
    DIRECT_MESSAGES          = 1 << 8
    DIRECT_MESSAGE_REACTIONS = 1 << 9
    DIRECT_MESSAGE_TYPING    = 1 << 10
    MESSAGE_CONTENT          = 1 << 15  # privileged
    GUILD_SCHEDULED_EVENTS   = 1 << 16

    @classmethod
    def none(cls) -> "Intents":
        return cls(0)

    @classmethod
    def default(cls) -> "Intents":
        """Everything that's free — without privileged intents."""
        return cls(
            cls.GUILDS | cls.GUILD_BANS | cls.GUILD_VOICE_STATES |
            cls.GUILD_MESSAGES | cls.GUILD_MESSAGE_REACTIONS |
            cls.GUILD_MESSAGE_TYPING | cls.DIRECT_MESSAGES |
            cls.DIRECT_MESSAGE_REACTIONS | cls.DIRECT_MESSAGE_TYPING |
            cls.GUILD_SCHEDULED_EVENTS
        )

    @classmethod
    def all(cls) -> "Intents":
        out = cls(0)
        for m in cls:
            out |= m
        return out
