package tech.intave.hiroo;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thin wrapper over {@link java.net.http.HttpClient} for the HiRoo REST API.
 * Bot tokens are sent as {@code Authorization: Bot <token>}; tokens already
 * carrying the {@code Bot } or {@code Bearer } prefix are used verbatim.
 */
public class HttpClient {
    private final String baseUrl;
    private volatile String token;
    private final java.net.http.HttpClient inner = java.net.http.HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper();

    public HttpClient(String token, String baseUrl) {
        this.token = token;
        this.baseUrl = baseUrl.replaceAll("/$", "");
    }

    public void setToken(String token) { this.token = token; }

    public String authHeader() {
        String t = token == null ? "" : token;
        String lower = t.toLowerCase();
        if (lower.startsWith("bot ") || lower.startsWith("bearer ")) return t;
        return "Bot " + t;
    }

    /**
     * Issue a request. {@code body} may be null, a Jackson-compatible Java
     * value ({@code Map}, {@code List}, {@code String}, etc.), or a pre-
     * serialised JSON string.
     */
    public JsonNode request(String method, String path, Object body) {
        try {
            HttpRequest.Builder req = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .header("Authorization", authHeader())
                .header("User-Agent", "hiroo-java/0.1");
            HttpRequest.BodyPublisher pub = HttpRequest.BodyPublishers.noBody();
            if (body != null) {
                String json = body instanceof String ? (String) body : mapper.writeValueAsString(body);
                pub = HttpRequest.BodyPublishers.ofString(json);
                req.header("Content-Type", "application/json");
            }
            req.method(method, pub);
            HttpResponse<String> res = inner.send(req.build(), HttpResponse.BodyHandlers.ofString());
            int status = res.statusCode();
            String text = res.body();
            if (status == 204 || text == null || text.isEmpty()) {
                if (status >= 400) throw new HttpException(status, "");
                return mapper.nullNode();
            }
            JsonNode node;
            try { node = mapper.readTree(text); }
            catch (Exception parseErr) {
                if (status >= 400) throw new HttpException(status, text);
                throw new RuntimeException("Failed to parse response: " + text, parseErr);
            }
            if (status >= 400) throw new HttpException(status, text);
            return node;
        } catch (HttpException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // ── Messages ─────────────────────────────────────────────────────

    /**
     * Send a message to a server channel (pass {@code channelId}) or a DM
     * (pass {@code dmId}). At least one must be non-null.
     */
    public JsonNode sendMessage(String channelId, String dmId, String content,
                                List<Map<String, Object>> embeds,
                                List<Map<String, Object>> components,
                                String replyToId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", content == null ? "" : content);
        if (embeds != null) body.put("embeds", embeds);
        if (components != null) body.put("components", components);
        if (replyToId != null) body.put("reply_to_id", replyToId);
        if (channelId != null) return request("POST", "/api/channels/" + channelId + "/messages", body);
        if (dmId != null) return request("POST", "/api/dms/" + dmId + "/messages", body);
        throw new IllegalArgumentException("Either channelId or dmId required");
    }

    public JsonNode editMessage(String channelId, String messageId, String content) {
        return request("PATCH", "/api/channels/" + channelId + "/messages/" + messageId,
                       Map.of("content", content));
    }

    public void deleteMessage(String channelId, String messageId) {
        request("DELETE", "/api/channels/" + channelId + "/messages/" + messageId, null);
    }

    public void addReaction(String channelId, String messageId, String emoji) {
        request("POST", "/api/channels/" + channelId + "/messages/" + messageId + "/reactions",
                Map.of("emoji", emoji));
    }

    // ── Channels ─────────────────────────────────────────────────────

    public JsonNode getGuildChannels(String guildId) {
        return request("GET", "/api/servers/" + guildId + "/channels", null);
    }

    /**
     * Create a channel in a server. {@code parentId} nests the new channel
     * in a category. Valid types: {@code text}, {@code voice},
     * {@code announcement}, {@code category}, {@code forum}. Requires
     * MANAGE_CHANNELS.
     */
    public JsonNode createChannel(String guildId, String name, String type,
                                  String topic, boolean isPrivate, String parentId, int position) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("type", type == null ? "text" : type);
        body.put("is_private", isPrivate);
        body.put("position", position);
        if (topic != null) body.put("topic", topic);
        if (parentId != null) body.put("parent_id", parentId);
        return request("POST", "/api/servers/" + guildId + "/channels", body);
    }

    /** Convenience overload for the most common "text channel under a category" case. */
    public JsonNode createTextChannel(String guildId, String name, String parentId) {
        return createChannel(guildId, name, "text", null, false, parentId, 0);
    }

    public JsonNode createVoiceChannel(String guildId, String name, String parentId) {
        return createChannel(guildId, name, "voice", null, false, parentId, 0);
    }

    public JsonNode updateChannel(String guildId, String channelId, Map<String, Object> fields) {
        return request("PATCH", "/api/servers/" + guildId + "/channels/" + channelId, fields);
    }

    public void deleteChannel(String guildId, String channelId) {
        request("DELETE", "/api/servers/" + guildId + "/channels/" + channelId, null);
    }

    public JsonNode getGuilds() {
        return request("GET", "/api/servers", null);
    }

    // ── Commands + Interactions ──────────────────────────────────────

    public JsonNode registerCommand(String applicationId, String type, String name,
                                    String description, List<Map<String, Object>> options,
                                    String guildId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", type);
        body.put("name", name);
        body.put("description", description);
        body.put("options", options == null ? List.of() : options);
        body.put("guild_id", guildId);
        return request("POST", "/api/commands/applications/" + applicationId + "/commands", body);
    }

    public JsonNode interactionCallback(String interactionId, int type, String content,
                                        boolean ephemeral) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("type", type);
        body.put("content", content);
        body.put("ephemeral", ephemeral);
        return request("POST", "/api/interactions/" + interactionId + "/callback", body);
    }

    public JsonNode interactionFollowup(String interactionId, String content) {
        return request("POST", "/api/interactions/" + interactionId + "/followup",
                       Map.of("content", content));
    }

    // ── Messages (extra) ─────────────────────────────────────────────

    public JsonNode editDmMessage(String dmId, String messageId, String content) {
        return request("PATCH", "/api/dms/" + dmId + "/messages/" + messageId,
                       Map.of("content", content));
    }

    public void deleteDmMessage(String dmId, String messageId) {
        request("DELETE", "/api/dms/" + dmId + "/messages/" + messageId, null);
    }

    public void removeReaction(String channelId, String messageId, String emoji) {
        // Reaction deletion uses a query param, not a JSON body.
        String path = "/api/channels/" + channelId + "/messages/" + messageId
                    + "/reactions?emoji=" + java.net.URLEncoder.encode(emoji, java.nio.charset.StandardCharsets.UTF_8);
        request("DELETE", path, null);
    }

    public JsonNode pinMessage(String channelId, String messageId) {
        return request("PUT", "/api/channels/" + channelId + "/messages/" + messageId + "/pin", null);
    }

    public JsonNode unpinMessage(String channelId, String messageId) {
        return request("DELETE", "/api/channels/" + channelId + "/messages/" + messageId + "/pin", null);
    }

    public JsonNode listPinned(String channelId) {
        return request("GET", "/api/channels/" + channelId + "/messages/pinned", null);
    }

    public JsonNode pinDmMessage(String dmId, String messageId) {
        return request("PUT", "/api/dms/" + dmId + "/messages/" + messageId + "/pin", null);
    }

    public JsonNode unpinDmMessage(String dmId, String messageId) {
        return request("DELETE", "/api/dms/" + dmId + "/messages/" + messageId + "/pin", null);
    }

    public JsonNode listDmPinned(String dmId) {
        return request("GET", "/api/dms/" + dmId + "/pinned", null);
    }

    // ── Moderation ───────────────────────────────────────────────────

    public void kickMember(String guildId, String userId) {
        request("DELETE", "/api/servers/" + guildId + "/members/" + userId, null);
    }

    public JsonNode banMember(String guildId, String userId, String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("user_id", userId);
        if (reason != null) body.put("reason", reason);
        return request("POST", "/api/servers/" + guildId + "/bans", body);
    }

    public void unbanMember(String guildId, String userId) {
        request("DELETE", "/api/servers/" + guildId + "/bans/" + userId, null);
    }

    public JsonNode listBans(String guildId) {
        return request("GET", "/api/servers/" + guildId + "/bans", null);
    }

    public JsonNode setTimeout(String guildId, String userId, int durationSeconds, String reason) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("duration_seconds", durationSeconds);
        if (reason != null) body.put("reason", reason);
        return request("PUT", "/api/servers/" + guildId + "/members/" + userId + "/timeout", body);
    }

    public void clearTimeout(String guildId, String userId) {
        request("DELETE", "/api/servers/" + guildId + "/members/" + userId + "/timeout", null);
    }

    public JsonNode updateMember(String guildId, String userId, String nickname, String role) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (nickname != null) body.put("nickname", nickname);
        if (role != null) body.put("role", role);
        return request("PATCH", "/api/servers/" + guildId + "/members/" + userId, body);
    }

    // ── Roles ────────────────────────────────────────────────────────

    public JsonNode listRoles(String guildId) {
        return request("GET", "/api/servers/" + guildId + "/roles", null);
    }

    public JsonNode createRole(String guildId, String name, String color,
                               long permissions, boolean hoist, boolean mentionable) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("permissions", permissions);
        body.put("hoist", hoist);
        body.put("mentionable", mentionable);
        if (color != null) body.put("color", color);
        return request("POST", "/api/servers/" + guildId + "/roles", body);
    }

    public JsonNode updateRole(String guildId, String roleId, Map<String, Object> fields) {
        return request("PATCH", "/api/servers/" + guildId + "/roles/" + roleId, fields);
    }

    public void deleteRole(String guildId, String roleId) {
        request("DELETE", "/api/servers/" + guildId + "/roles/" + roleId, null);
    }

    public JsonNode getMemberRoles(String guildId, String userId) {
        return request("GET", "/api/servers/" + guildId + "/roles/members/" + userId, null);
    }

    public JsonNode setMemberRoles(String guildId, String userId, List<String> roleIds) {
        return request("PUT", "/api/servers/" + guildId + "/roles/members/" + userId,
                       Map.of("role_ids", roleIds));
    }
}
