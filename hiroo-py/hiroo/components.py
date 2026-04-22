"""Interactive message components: buttons, select menus, action rows."""
from dataclasses import dataclass, field
from enum import IntEnum
from typing import List, Optional, Union


class ButtonStyle(IntEnum):
    PRIMARY = 1
    SECONDARY = 2
    SUCCESS = 3
    DANGER = 4
    LINK = 5


@dataclass
class Button:
    label: str
    style: ButtonStyle = ButtonStyle.SECONDARY
    custom_id: Optional[str] = None
    url: Optional[str] = None
    disabled: bool = False
    emoji: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "type": 2,  # button
            "label": self.label,
            "style": int(self.style),
            "disabled": self.disabled,
        }
        if self.style == ButtonStyle.LINK:
            if not self.url:
                raise ValueError("Link button requires url")
            d["url"] = self.url
        else:
            d["custom_id"] = self.custom_id or f"btn_{self.label[:16]}"
        if self.emoji:
            d["emoji"] = self.emoji
        return d


@dataclass
class SelectOption:
    label: str
    value: str
    description: Optional[str] = None
    emoji: Optional[str] = None
    default: bool = False

    def to_dict(self) -> dict:
        d = {"label": self.label, "value": self.value, "default": self.default}
        if self.description: d["description"] = self.description
        if self.emoji: d["emoji"] = self.emoji
        return d


@dataclass
class SelectMenu:
    custom_id: str
    options: List[SelectOption]
    placeholder: Optional[str] = None
    min_values: int = 1
    max_values: int = 1
    disabled: bool = False

    def to_dict(self) -> dict:
        return {
            "type": 3,  # select
            "custom_id": self.custom_id,
            "options": [o.to_dict() for o in self.options],
            "placeholder": self.placeholder,
            "min_values": self.min_values,
            "max_values": self.max_values,
            "disabled": self.disabled,
        }


Component = Union[Button, SelectMenu]


@dataclass
class ActionRow:
    components: List[Component] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"type": 1, "components": [c.to_dict() for c in self.components]}
