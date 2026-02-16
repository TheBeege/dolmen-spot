import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com https://apis.google.com",
              "connect-src 'self' https://www.googleapis.com https://accounts.google.com https://login.microsoftonline.com https://graph.microsoft.com",
              "frame-src https://accounts.google.com https://login.microsoftonline.com",
              "style-src 'self' 'unsafe-inline' https://accounts.google.com",
              "img-src 'self' data:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
