/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @twick packages ship ESM + browser-only deps (fabric, WebCodecs); transpile them
  // through Next so they bundle cleanly for the CLIENT.
  transpilePackages: ["@twick/studio", "@twick/timeline", "@twick/live-player"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // The MCP route runs @twick/timeline HEADLESS on the server (the shared tool
      // executor). Webpack-bundling it server-side mangles React's createContext
      // interop ("createContext is not a function"). Marking it external makes the
      // server runtime `require()` the real package from node_modules — same as the
      // headless test scripts — so the apply path behaves identically on the server
      // and in the browser.
      const externalize = ({ request }, cb) =>
        request === "@twick/timeline" || (request && request.startsWith("@twick/timeline/"))
          ? cb(null, `commonjs ${request}`)
          : cb();
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, externalize]
        : [config.externals, externalize].filter(Boolean);
    }
    return config;
  },
};

export default nextConfig;
