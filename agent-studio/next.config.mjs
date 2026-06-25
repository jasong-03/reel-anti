/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @twick packages ship ESM + browser-only deps (fabric, WebCodecs); transpile them
  // through Next so they bundle cleanly for the client.
  transpilePackages: ["@twick/studio", "@twick/timeline", "@twick/live-player"],
};

export default nextConfig;
