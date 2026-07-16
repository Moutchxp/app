import type { NextConfig } from "next";

const nextConfig: any = {
  /* config options here */
  // pdfkit lit ses métriques standard-14 (.afm) sur disque au runtime via __dirname/data/*.afm
  // (new PDFDocument → lib/font/standard.js). Bundlé par webpack, __dirname pointe dans .next/server
  // et les .afm ne sont pas émis → ENOENT (name "Error"). L'externaliser le laisse en require()
  // depuis node_modules, où les .afm existent. Cf. absent de la liste par défaut de Next (contrairement à sharp).
  serverExternalPackages: ['pdfkit'],
  allowedDevOrigins: ['*.trycloudflare.com', 'assembled-mitchell-construct-charms.trycloudflare.com', '192.168.1.164'],
  devIndicators: false,
};

export default nextConfig as NextConfig;