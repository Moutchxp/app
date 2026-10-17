import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * ══ 🔴 GARDE — LE STOCKAGE N'EST JAMAIS DONNÉ À L'EXTÉRIEUR (lot CERTIFICAT-PHOTO, 17/10/2026) ══════════════════════
 *
 * En production, `S3_ENDPOINT` vaut 127.0.0.1 : MinIO tourne sur le serveur et n'est joignable QUE par l'application.
 * C'est sain tant qu'AUCUN lien remis à quelqu'un (mail, agenda, QR, espace client, alerte) ne pointe vers le stockage :
 * chaque téléchargement passe par une route de l'application (session ou jeton), qui relit l'objet et le sert.
 * Inventaire du 17/10/2026 : tâches (`/api/tache/piece?j=`), pièces de permis et alerte GED (route de l'application),
 * espace client (`/api/internaute/espace/certificats/[id]/telecharger`), certificat (PDF joint, QR → `/verifier`),
 * images des mails (intégrées : `cid:` ou `data:`). Aucun lien signé vers le stockage n'est fabriqué.
 *
 * Ce garde échoue si du code (hors tests) se remet à fabriquer une URL signée du stockage, ou lit `S3_ENDPOINT` ailleurs
 * que dans le module de stockage et le contrôle de démarrage : un tel lien pointerait vers 127.0.0.1 depuis l'extérieur.
 */
const RACINE = process.cwd();
const AUTORISES = new Set([
  'app/lib/stockage/index.ts', // définit urlSignee (non appelée) et le client S3
  'app/lib/stockage/config.ts', // lit S3_ENDPOINT
  'app/lib/config/verifierUrlsPubliques.ts', // contrôle de démarrage (nom de la variable seulement)
]);

function fichiers(dossier: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (nom === 'node_modules' || nom.startsWith('.')) continue;
    const p = path.join(dossier, nom);
    if (statSync(p).isDirectory()) out.push(...fichiers(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(nom) && !/\.(test|itest|guard\.test)\.(ts|tsx)$/.test(nom)) out.push(p);
  }
  return out;
}

describe('🔴 garde : aucun lien vers le stockage ne sort de l’application', () => {
  const sources = [...fichiers(path.join(RACINE, 'app')), ...fichiers(path.join(RACINE, 'scripts'))]
    .map((p) => ({ rel: path.relative(RACINE, p), texte: readFileSync(p, 'utf8') }));

  it('personne n’appelle urlSignee ni ne présigne d’URL du stockage', () => {
    const fautifs = sources.filter((f) => /\burlSignee\s*\(|getSignedUrl\s*\(|s3-request-presigner/.test(f.texte)
      && !(f.rel === 'app/lib/stockage/index.ts'));
    expect(fautifs.map((f) => f.rel)).toEqual([]);
  });

  it('S3_ENDPOINT n’est lu que par le module de stockage et le contrôle de démarrage', () => {
    const fautifs = sources.filter((f) => /process\.env\.S3_ENDPOINT|\bS3_ENDPOINT\b/.test(f.texte) && !AUTORISES.has(f.rel));
    expect(fautifs.map((f) => f.rel)).toEqual([]);
  });
});
