import type { NextConfig } from "next";
import path from "node:path";

/** @see https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions */
const nextConfig = {
  serverActions: {
    bodySizeLimit: "4mb",
  },
  turbopack: {
    root: path.resolve(process.cwd()),
  },
} as NextConfig;

export default nextConfig;
