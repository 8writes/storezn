import { execSync } from "node:child_process";

// A unique id for this build, so a long-lived tab can tell it's running
// stale code after a deploy and offer to reload (see app/UpdatePrompt.js
// + app/api/version). The server deploy is `git pull && next build`, so
// the commit SHA is the natural version; fall back to the build time.
let buildId;
try {
  buildId = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
} catch {
  buildId = String(Date.now());
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  // /stores was the marketplace's URL before it got renamed - keeps any
  // already-shared/bookmarked links working instead of 404ing.
  async redirects() {
    return [{ source: "/stores", destination: "/marketplace", permanent: true }];
  },
};

export default nextConfig;
