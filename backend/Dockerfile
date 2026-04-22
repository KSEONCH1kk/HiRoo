FROM python:3.11-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates unzip \
    && rm -rf /var/lib/apt/lists/*
# Deno — required by modern yt-dlp YouTube extractors to evaluate the player JS.
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y \
    && /usr/local/bin/deno --version
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Tell yt-dlp to auto-fetch the EJS challenge solver from GitHub (needed for
# YouTube's n-sig challenge on current videos).
RUN printf -- '--remote-components ejs:github\n' > /etc/yt-dlp.conf

FROM deps AS final
COPY . .
RUN mkdir -p uploads/avatars

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
