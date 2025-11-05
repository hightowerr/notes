import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Explicitly set project root to silence workspace root warning
  outputFileTracingRoot: path.join(__dirname),
  // Externalize native modules for OCR functionality
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native modules that shouldn't be bundled
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('canvas', '@napi-rs/canvas', 'pdf-to-png-converter');
      }
    }

    // Ignore .node files (native binaries)
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });

    return config;
  },
};

export default nextConfig;
