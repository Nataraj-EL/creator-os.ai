import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["promptfoo"],
  webpack: (config, { isServer }) => {
    config.externals = [...(config.externals || []), "promptfoo"];
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
