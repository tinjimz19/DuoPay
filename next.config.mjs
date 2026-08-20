/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  async rewrites() {
    return [
      { source: "/brand", destination: "/brand/index.html" },
      { source: "/brand/", destination: "/brand/index.html" },
    ];
  },
};

export default nextConfig;
