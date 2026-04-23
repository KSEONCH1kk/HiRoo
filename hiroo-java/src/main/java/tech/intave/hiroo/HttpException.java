package tech.intave.hiroo;

/** Thrown by HttpClient when the server returns a non-2xx response. */
public class HttpException extends RuntimeException {
    private final int status;
    private final String body;

    public HttpException(int status, String body) {
        super("HTTP " + status + ": " + body);
        this.status = status;
        this.body = body;
    }

    public int status() { return status; }
    public String body() { return body; }
}
