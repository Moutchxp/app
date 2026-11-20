import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 🔴🔴 GARDE (Arno, 20/11/2026, « Adresse officielle BAN », lot 2) — UN SEUL ACCÈS SERVEUR À LA BAN POUR RAPPROCHER UNE ADRESSE : `app/lib/adresse/`.
 * Aucun NOUVEAU fichier ne lit `adresse_ban` ni n'appelle l'API Adresse en dehors de ce module. Les fichiers qui le faisaient avant le lot 2 sont
 * listés ici, figés : les lots 7a à 7e les font passer par le module, et les RETIRENT de la liste (elle ne fait que rétrécir). Un usage qui n'est pas
 * un rapprochement d'adresse (le certificat, les statistiques par commune, les contrôles du moteur) peut rester, mais sa place ici se justifie.
 */
const RACINE = path.join(process.cwd(), 'app');
const MODULE = 'app/lib/adresse/';
// 🔴 (lot 7a) la SOURCE UNIQUE du navigateur : le seul endroit côté client qui interroge l'API Adresse (`adresseOfficielle.ts`)
const MODULE_NAVIGATEUR = 'app/components/adresse/';
const AVANT_LE_LOT_2 = new Set([
  // lecture de `adresse_ban` hors rapprochement (moteur, certificat, statistiques, contrôles) — hors du périmètre de la règle
  'app/scripts/obstacles-check.ts', 'app/scripts/faisceaux-check.ts', 'app/scripts/origine-check.ts', 'app/scripts/lidar-axe-check.ts', 'app/scripts/analyse-check.ts',
  'app/lib/admin/morphologieDisque.ts', 'app/lib/admin/sourcesFraicheurRepo.ts', 'app/lib/internaute/extractionRepo.ts', 'app/lib/db/certificatEmission.ts',
  'app/lib/db/adressesProches.ts', 'app/lib/analytics/lecture/geo.ts', 'app/lib/analytics/commune.ts', 'app/(admin)/api/admin/internautes/communes/route.ts',
  // CHARGEMENT de la BAN locale depuis un fichier officiel (lot 3 ter, 20/11/2026) : il remplit la table, il ne rapproche rien
  'app/scripts/ban-csv-import.ts',
  // rapprochements et recherches d'adresse À FAIRE PASSER PAR LE MODULE (lots 7a à 7e)
  'app/lib/permis/plancheParcellesRepo.ts', 'app/lib/gestion/verificationAdresseRepo.ts', 'app/lib/gestion/syndicRepo.ts', 'app/lib/gestion/syndics.ts',
  'app/lib/gestion/parcelleRepo.ts', 'app/(admin)/api/admin/gestion/syndics/adresses/route.ts', 'app/page.tsx',
  'app/(admin)/admin/(protected)/banc-test/BancSaisie.tsx', 'app/(admin)/admin/(protected)/location/choisirAdresseEssai.ts',
  // 🔴 (lot 7a) retirés : `ChampAdresseBan.tsx` et `components/AdresseAutocomplete.tsx`, devenus des emballages du composant unique
]);

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = path.join(dossier, n);
    if (statSync(p).isDirectory()) return n === 'node_modules' || n.startsWith('.') ? [] : fichiers(p);
    return /\.(ts|tsx)$/.test(n) && !/\.(test|itest|guard\.test)\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('🔴 un seul accès à la BAN pour rapprocher une adresse', () => {
  it('aucun nouveau fichier ne lit adresse_ban ni n’appelle l’API Adresse hors de app/lib/adresse/', () => {
    const fautifs = fichiers(RACINE).map((p) => path.relative(process.cwd(), p).split(path.sep).join('/'))
      .filter((f) => !f.startsWith(MODULE) && !f.startsWith(MODULE_NAVIGATEUR) && !AVANT_LE_LOT_2.has(f))
      .filter((f) => /\badresse_ban\b|api-adresse\.data\.gouv\.fr/.test(readFileSync(f, 'utf8')));
    expect(fautifs, 'passez par app/lib/adresse/ (banRepo, rapprochementBan) — une seule règle de rapprochement').toEqual([]);
  });
  it('la liste des exceptions ne garde que des fichiers qui existent (elle ne fait que rétrécir)', () => {
    const disparus = [...AVANT_LE_LOT_2].filter((f) => { try { return !statSync(path.join(process.cwd(), f)).isFile(); } catch { return true; } });
    expect(disparus).toEqual([]);
    // 🔴 (lot 7a) une exception qui n'appelle plus la BAN sort de la liste
    const inutiles = [...AVANT_LE_LOT_2].filter((f) => !/\badresse_ban\b|api-adresse\.data\.gouv\.fr/.test(readFileSync(path.join(process.cwd(), f), 'utf8')));
    expect(inutiles, 'retirez-les de la liste : elle ne fait que rétrécir').toEqual([]);
  });
});
