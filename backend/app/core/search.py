def escape_like(s: str) -> str:
    """Escape LIKE/ILIKE wildcards so user input matches literally.
    Pair with `.ilike(..., escape="\\\\")`."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
