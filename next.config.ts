import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        pg: false,
        'pg-native': false,
        'util/types': false,
        ioredis: false,
        bullmq: false
      };
    }
    return config;
  }
};

export default nextConfig;
