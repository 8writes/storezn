/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  // /stores was the marketplace's URL before it got renamed - keeps any
  // already-shared/bookmarked links working instead of 404ing.
  async redirects() {
    return [{ source: "/stores", destination: "/marketplace", permanent: true }];
  },
};

export default nextConfig;
