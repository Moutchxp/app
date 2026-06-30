import type { NextConfig } from "next";

const nextConfig: any = {
  /* config options here */
  allowedDevOrigins: ['*.trycloudflare.com', 'assembled-mitchell-construct-charms.trycloudflare.com', '192.168.1.164'],
  devIndicators: false,
};

export default nextConfig as NextConfig;