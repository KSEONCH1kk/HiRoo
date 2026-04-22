from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class EmbedField:
    name: str
    value: str
    inline: bool = False


@dataclass
class Embed:
    title: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    color: Optional[int] = None
    timestamp: Optional[str] = None
    author_name: Optional[str] = None
    author_icon_url: Optional[str] = None
    footer_text: Optional[str] = None
    footer_icon_url: Optional[str] = None
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    fields: List[EmbedField] = field(default_factory=list)

    def add_field(self, name: str, value: str, inline: bool = False) -> "Embed":
        self.fields.append(EmbedField(name=name, value=value, inline=inline))
        return self

    def to_dict(self) -> dict:
        d: dict = {}
        for k in ("title", "description", "url", "color", "timestamp"):
            v = getattr(self, k)
            if v is not None:
                d[k] = v
        if self.author_name:
            d["author"] = {"name": self.author_name, "icon_url": self.author_icon_url}
        if self.footer_text:
            d["footer"] = {"text": self.footer_text, "icon_url": self.footer_icon_url}
        if self.image_url:
            d["image"] = {"url": self.image_url}
        if self.thumbnail_url:
            d["thumbnail"] = {"url": self.thumbnail_url}
        if self.fields:
            d["fields"] = [
                {"name": f.name, "value": f.value, "inline": f.inline}
                for f in self.fields
            ]
        return d
