package tech.intave.hiroo;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Описание одной опции слэш-команды. Значения {@code type} соответствуют
 * численным кодам ApplicationCommandOptionType (Discord-совместимые):
 * 3 — строка, 4 — целое, 5 — булево, 10 — число с плавающей точкой.
 */
public final class SlashOption {
    public enum Type {
        STRING(3), INTEGER(4), BOOLEAN(5), NUMBER(10);
        public final int id;
        Type(int id) { this.id = id; }
    }

    public final String name;
    public final String description;
    public final Type type;
    public final boolean required;

    public SlashOption(String name, String description, Type type, boolean required) {
        this.name = name;
        this.description = description;
        this.type = type;
        this.required = required;
    }

    public static SlashOption string(String name, String description, boolean required) {
        return new SlashOption(name, description, Type.STRING, required);
    }
    public static SlashOption integer(String name, String description, boolean required) {
        return new SlashOption(name, description, Type.INTEGER, required);
    }
    public static SlashOption bool(String name, String description, boolean required) {
        return new SlashOption(name, description, Type.BOOLEAN, required);
    }
    public static SlashOption number(String name, String description, boolean required) {
        return new SlashOption(name, description, Type.NUMBER, required);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("description", description);
        m.put("type", type.id);
        m.put("required", required);
        return m;
    }
}
