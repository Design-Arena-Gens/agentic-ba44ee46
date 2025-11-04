/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    turbo: {
      resolveAlias: {
        // web-llm optional wasm fallback noise
      }
    }
  }
};

export default nextConfig;
