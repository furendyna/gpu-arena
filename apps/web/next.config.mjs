import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);

/**
 * Resolve a package's root dir so we can force a single instance of it.
 * Some packages block `./package.json` via "exports", so derive the root from
 * the resolved entry file by locating its node_modules/<name> segment.
 */
function pkgDir(name) {
  const entry = require.resolve(name);
  const marker = path.join("node_modules", ...name.split("/"));
  const idx = entry.lastIndexOf(marker);
  return entry.slice(0, idx + marker.length);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@gpu-arena/shared"],
  webpack: (config) => {
    // The Solana wallet adapter gets installed in multiple node_modules
    // locations in this monorepo, which yields several copies of WalletContext
    // and breaks the connect modal ("read 'wallet' on a WalletContext without
    // providing one"). Pin every import to a single physical copy.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana/wallet-adapter-react": pkgDir("@solana/wallet-adapter-react"),
      "@solana/wallet-adapter-base": pkgDir("@solana/wallet-adapter-base"),
    };
    return config;
  },
};

export default nextConfig;
