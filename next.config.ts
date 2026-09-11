import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * Close the back door on the map data files.
   *
   * `/api/data` now checks that the caller holds View in the city a CSV
   * belongs to. That check is worth nothing on its own, because the same
   * files sit in `public/data/` and Next.js serves everything under `public/`
   * as a static URL. Anyone could skip the route entirely and fetch
   * `/data/cafe_info.csv`.
   *
   * beforeFiles runs ahead of the static handler, so this intercepts the URL
   * before the file is ever reached. Nothing is excepted: the gravity score
   * layers used to be fetched straight from `/data/gravity_<city>.geojson`
   * and are now served by `/api/data?type=gravity&city=...`, which applies
   * the same per-city check as everything else.
   *
   * The files stay where they are rather than moving out of `public/`: the
   * server routes read them with fs from `process.cwd()/public/data`, and on
   * Vercel a directory outside `public/` is only bundled into the function if
   * outputFileTracingIncludes says so. Moving them would trade a closed hole
   * for a production-only 404.
   */
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/data/:file*",
          destination: "/api/data-file-blocked",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
