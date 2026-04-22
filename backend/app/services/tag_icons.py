"""Fixed pool of icon keys allowed for server clan tags.

Keys map to FontAwesome solid icons on the frontend (`fa-<key>`). Keeping the
list closed-ended prevents admins from injecting arbitrary CSS class names
and gives the UI a consistent look.
"""

TAG_ICONS: list[str] = [
    "star", "crown", "shield", "shield-halved",
    "bolt", "fire", "flame",
    "rocket", "gamepad", "dice", "chess-knight",
    "heart", "diamond", "gem",
    "ghost", "skull", "dragon", "wand-magic-sparkles",
    "code", "flask", "terminal",
    "music", "headphones",
    "sun", "moon", "cloud", "snowflake",
    "leaf", "tree", "paw",
    "cat", "dog", "fish",
    "feather", "bolt-lightning",
    "anchor", "compass", "map",
    "flag", "mug-hot", "trophy",
]

TAG_ICONS_SET = set(TAG_ICONS)


def is_valid_tag_icon(key: str | None) -> bool:
    return key is not None and key in TAG_ICONS_SET
