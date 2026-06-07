import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['bosgame', '100.117.75.6'],
  output: 'standalone',
};

export default nextConfig;
