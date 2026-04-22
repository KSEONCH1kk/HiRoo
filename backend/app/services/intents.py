"""Bot Gateway Intents — bitfield controlling which events the bot receives.

Modelled after Discord's scheme. Privileged intents (marked below) need to be
enabled in /developers and — eventually — verification to use on >N guilds.
"""
from enum import IntFlag


class Intents(IntFlag):
    GUILDS                  = 1 << 0   # server_create / delete / update, channel_*
    GUILD_MEMBERS           = 1 << 1   # PRIVILEGED — join/leave, presence-free member list
    GUILD_BANS              = 1 << 2
    GUILD_VOICE_STATES      = 1 << 3   # who is in which voice channel
    GUILD_PRESENCES         = 1 << 4   # PRIVILEGED — online/idle/offline
    GUILD_MESSAGES          = 1 << 5   # message create/update/delete in guild channels
    GUILD_MESSAGE_REACTIONS = 1 << 6
    GUILD_MESSAGE_TYPING    = 1 << 7
    DIRECT_MESSAGES         = 1 << 8
    DIRECT_MESSAGE_REACTIONS= 1 << 9
    DIRECT_MESSAGE_TYPING   = 1 << 10
    MESSAGE_CONTENT         = 1 << 15  # PRIVILEGED — actual text/attachments of messages
    GUILD_SCHEDULED_EVENTS  = 1 << 16


PRIVILEGED_INTENTS = (
    Intents.GUILD_MEMBERS | Intents.GUILD_PRESENCES | Intents.MESSAGE_CONTENT
)


def has(flags: int, intent: Intents) -> bool:
    return (flags & int(intent)) == int(intent)


# Mapping used by the bot gateway to decide whether a given websocket event
# should be delivered to a bot based on its intents.
def event_requires_intent(event: str) -> Intents | None:
    mapping = {
        "message_create":        Intents.GUILD_MESSAGES,
        "message_update":        Intents.GUILD_MESSAGES,
        "message_delete":        Intents.GUILD_MESSAGES,
        "reaction_add":          Intents.GUILD_MESSAGE_REACTIONS,
        "reaction_remove":       Intents.GUILD_MESSAGE_REACTIONS,
        "typing_start":          Intents.GUILD_MESSAGE_TYPING,
        "presence_update":       Intents.GUILD_PRESENCES,
        "guild_member_add":      Intents.GUILD_MEMBERS,
        "guild_member_remove":   Intents.GUILD_MEMBERS,
        "voice_state_update":    Intents.GUILD_VOICE_STATES,
        "dm_message_create":     Intents.DIRECT_MESSAGES,
    }
    return mapping.get(event)
