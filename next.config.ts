import type { NextConfig } from "next";

// ─── Allowed dev origins ───────────────────────────────────────────────
// Allow access from any IP on the LAN during development. In production
// this list is empty (same-origin only) unless LIAFON_ALLOWED_ORIGINS is set.
function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    // Hardcode your LAN IP — Next.js allowedDevOrigins does NOT support
    // CIDR notation, so we must list the exact IP.
    "192.168.29.209",
  ]);
  // Also try to read from .env (manually parsed since Next.js loads .env late)
  try {
    const fs = require("fs");
    const path = require("path");
    for (const envFile of [".env", ".env.local"]) {
      const envPath = path.join(__dirname, envFile);
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq === -1) continue;
          const key = trimmed.slice(0, eq).trim();
          const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
          if (key === "LIAFON_DEV_ORIGIN" && value) {
            for (const o of value.split(",")) {
              const ip = o.trim();
              if (ip) origins.add(ip);
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }
  return [...origins];
}

// Detect Vercel environment. Vercel sets VERCEL=1 and VERCEL_ENV=production|preview|development.
const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  // ─── Output mode ──────────────────────────────────────────────────────
  // IMPORTANT: `output: "standalone"` is intended for self-hosted Node
  // servers (the bundled server.js in this repo). On Vercel it MUST be
  // omitted — Vercel uses its own zero-config serverless deployment and
  // `standalone` produces an unused `.next/standalone/` directory that
  // bloats the deployment and can cause the build to mis-route.
  //
  // We only enable standalone when NOT on Vercel (i.e. self-hosted
  // production with `node server.js`).
  ...(isVercel ? {} : { output: "standalone" as const }),

  // Surface type errors at build time. Previously this was `true`,
  // which silently shipped refactors that broke types to production.
  typescript: {
    ignoreBuildErrors: false,
  },
  // StrictMode catches effect double-invocation, stale closures, and
  // missing cleanups — all real bugs we'd otherwise ship to users.
  reactStrictMode: true,
  // Don't advertise that we're built on Next.js — minor defense in depth.
  poweredByHeader: false,

  // ─── Allow access from any IP on the LAN (dev only) ─────────────────
  allowedDevOrigins: getAllowedDevOrigins(),

  // ─── Headers ─────────────────────────────────────────────────────────
  // SECURITY: previously this set `Access-Control-Allow-Origin: *` on
  // every route. That allows any website to read non-credentialed API
  // responses (e.g. /api/setup leaks first-run status, /api/license
  // leaks license state). We now omit the ACAO header entirely, which
  // restricts cross-origin reads to same-origin only. Cookie auth still
  // works because browsers send SameSite=Lax cookies on same-site
  // navigations and same-origin fetches.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },

  // ─── Vercel-compatible image optimization ────────────────────────────
  // sharp is preinstalled on Vercel; for self-hosted standalone we also
  // install it as a dependency. Leave the default config.
  images: {
    formats: ["image/avif", "image/webp"],
  },

  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
