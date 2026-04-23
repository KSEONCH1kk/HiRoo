/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "8000" },
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    // hCaptcha требует доступ к нескольким своим доменам: js.hcaptcha.com
    // для загрузчика, newassets.hcaptcha.com для виджета и ресурсов,
    // hcaptcha.com для iframe челленджа, assets.hcaptcha.com на legacy.
    const hcaptcha = {
      script: "https://hcaptcha.com https://*.hcaptcha.com",
      frame:  "https://hcaptcha.com https://*.hcaptcha.com",
      style:  "https://hcaptcha.com https://*.hcaptcha.com",
      connect:"https://hcaptcha.com https://*.hcaptcha.com",
    };
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com ${hcaptcha.script}`,
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com ${hcaptcha.style}`,
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
      "img-src 'self' https: data: blob:",
      "media-src 'self' https: blob:",
      `connect-src 'self' https://hiroo.intave.tech wss://hiroo.intave.tech https://*.livekit.cloud wss://*.livekit.cloud ${hcaptcha.connect}`,
      `frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com ${hcaptcha.frame}`,
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; ");
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy", value: csp },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
