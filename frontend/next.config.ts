import type { NextConfig } from "next";

// Get basePath from environment variable, default to empty string
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Static export for GitHub Pages
  output: "export",
  basePath: basePath,
  assetPrefix: basePath,
  // Optimize build performance
  webpack: (config, { isServer }) => {
    // Limit module resolution depth to avoid deep dependency analysis
    config.resolve.symlinks = false;
    
    // Optimize module resolution
    config.resolve.modules = ['node_modules'];
    
    // Reduce unnecessary filesystem lookups
    config.resolve.cacheWithContext = false;
    
    // Optimize externalization to reduce bundle size
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    // Limit dependency analysis scope
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
      // Reduce code splitting depth analysis
      splitChunks: {
        ...config.optimization.splitChunks,
        maxAsyncRequests: 20,
        maxInitialRequests: 20,
      },
    };
    
    return config;
  },
  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: false,
  },
  // Disable source maps in production
  productionBrowserSourceMaps: false,
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;


