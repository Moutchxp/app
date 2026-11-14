import type { NextConfig } from "next";
import { entetesSecuriteAdmin } from "./app/lib/admin/entetesSecurite";

const nextConfig: NextConfig = {
  /* config options here */
  // pdfkit lit ses métriques standard-14 (.afm) sur disque au runtime via __dirname/data/*.afm
  // (new PDFDocument → lib/font/standard.js). Bundlé par webpack, __dirname pointe dans .next/server
  // et les .afm ne sont pas émis → ENOENT (name "Error"). L'externaliser le laisse en require()
  // depuis node_modules, où les .afm existent. Cf. absent de la liste par défaut de Next (contrairement à sharp).
  // N1-A : pdfjs-dist lit ses fichiers de police/cmaps sur disque et embarque un worker ; l'externaliser le laisse en
  //   require() depuis node_modules (comme pdfkit) pour l'extraction de texte CÔTÉ SERVEUR (worker désactivé à l'appel).
  serverExternalPackages: ['pdfkit', 'pdfjs-dist'],
  // 🔴 Arno (15/11/2026) — + les noms d'hôte de la recette publiée (tunnel), donnés par `RECETTE_ORIGINES_DEV` (posée par `npm run recette`
  //   quand `RECETTE_URL_PUBLIQUE` est fournie) : rien n'est écrit en dur pour un tunnel. Serveur de développement seulement.
  allowedDevOrigins: ['*.trycloudflare.com', 'assembled-mitchell-construct-charms.trycloudflare.com', '192.168.1.164',
    ...(process.env.RECETTE_ORIGINES_DEV ?? '').split(',').map((x) => x.trim()).filter(Boolean)],
  devIndicators: false,
  // AUDIT POINT 7 (15/10/2026) — en-têtes de sécurité de l'ADMIN, posés par l'application (cf. entetesSecurite.ts).
  async headers() {
    return entetesSecuriteAdmin(process.env.NODE_ENV === 'production');
  },
};

export default nextConfig;