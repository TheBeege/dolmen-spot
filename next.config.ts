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
              // `data:` lets the PDF export's layout engine (yoga-layout, inside
              // @react-pdf/renderer) read its WebAssembly from the inline data: URI it
              // ships with. data: URLs carry their content in the URL, so this allows
              // no network access. Compiling that WebAssembly relies on script-src
              // 'unsafe-eval'; if that is ever dropped, add 'wasm-unsafe-eval'.
              "connect-src 'self' data: https://www.googleapis.com https://accounts.google.com https://login.microsoftonline.com https://graph.microsoft.com",
              "frame-src https://accounts.google.com https://login.microsoftonline.com",
              "style-src 'self' 'unsafe-inline' https://accounts.google.com",
              "img-src 'self' data:",
            ].join("; "),
          },
        ],
      },
      {
        // The PDF fonts are named after their content (scripts/build-pdf-fonts.py),
        // so a font that changes gets a new URL and browsers can keep each file
        // for good instead of checking for a new version on every export.
        source: "/fonts/pdf/:file([^/]+\\.[0-9a-f]{10}\\.(?:ttf|otf))",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
