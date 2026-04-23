export class HiRooError extends Error {
  constructor(message) {
    super(message);
    this.name = "HiRooError";
  }
}

export class HTTPError extends HiRooError {
  constructor(status, body) {
    const detail = typeof body === "object" && body !== null ? body.detail ?? JSON.stringify(body) : body;
    super(`HTTP ${status}: ${detail}`);
    this.name = "HTTPError";
    this.status = status;
    this.body = body;
  }
}

export class GatewayError extends HiRooError {
  constructor(message) {
    super(message);
    this.name = "GatewayError";
  }
}
