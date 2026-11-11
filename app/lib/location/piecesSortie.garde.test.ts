import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 🔴🔴 RÈGLE DRIVE ABSOLUE (Arno, 11/11/2026) — LE CODE DES PIÈCES JOINTES DE LA SORTIE NE FAIT QUE LIRE LE DRIVE. Garde STATIQUE : les
 * fichiers du lot n'importent du Drive QUE des fonctions de lecture ; aucun module d'écriture (dépôt, création, déplacement, corbeille,
 * copie, renommage, partage) n'y entre ; aucune méthode d'écriture n'y est émise. « Documents clients scannés » : le verdict de lecture
 * (`verdictJoindre`) est appelé avant toute lecture d'octets.
 */
const FICHIERS = ['app/lib/location/piecesSortieRepo.ts', 'app/(admin)/api/admin/location/pieces-sortie/route.ts', 'app/(admin)/admin/(protected)/location/PiecesSortie.tsx'];
const source = (f: string): string => readFileSync(f, 'utf8');
const LECTURES_DRIVE = new Set(['chaineParents', 'lireMetadonnees', 'listerContenu', 'MIME_DOSSIER', 'verdictJoindre', 'DOSSIER_INTERDIT_LECTURE', 'lireContenuDrive', 'dossierDriveDuLot', 'jetonPourRequete']);
const MODULES_ECRITURE = /driveEcriture|driveMouvement|driveCorbeille|driveCreation|depotDrive|copiePieces|driveDeplacement|raccourciDrive|rangementDossiers|driveDelegue/;

describe('🔴 pièces de la sortie : le Drive en LECTURE SEULE', () => {
  it('aucun module d’écriture Drive importé ; du Drive, seulement des fonctions de lecture', () => {
    for (const f of FICHIERS) {
      const s = source(f);
      expect(s, f).not.toMatch(new RegExp(`from '[^']*(${MODULES_ECRITURE.source})'`));
      for (const m of s.matchAll(/import \{([^}]*)\} from '[^']*\/gestion\/(drive|driveVerdict|driveLectureFichier|pieceDriveLecture|arbreStatutDriveRepo|jetonCollaborateur)'/g)) {
        for (const nom of m[1].split(',').map((x) => x.trim().replace(/^type /, '')).filter(Boolean)) expect(LECTURES_DRIVE.has(nom), `${f} : ${nom}`).toBe(true);
      }
    }
  });
  it('aucune écriture émise vers Google (POST/PATCH/PUT/DELETE, upload, trash, copy, permissions)', () => {
    const repo = source(FICHIERS[0]);
    expect(repo).not.toMatch(/method:\s*'(POST|PATCH|PUT|DELETE)'|upload\/drive|\/copy\b|\/permissions|trashed|deposerFichier|creerDossier|basculerCorbeille|deplacer/);
  });
  it('le verdict « Documents clients scannés » passe AVANT la lecture des octets, et le dossier du bien est vérifié avant d’être listé', () => {
    const repo = source(FICHIERS[0]);
    const corps = repo.slice(repo.indexOf('export async function joindreDepuisDrive'));
    expect(corps.indexOf('verdictJoindre(jeton, id)')).toBeGreaterThan(-1);
    expect(corps.indexOf('verdictJoindre(jeton, id)')).toBeLessThan(corps.indexOf('lireContenuDrive('));
    const dossier = repo.slice(repo.indexOf('async function dossierVerifie'));
    expect(dossier.indexOf('verdictJoindre(jeton, d.driveId)')).toBeGreaterThan(-1);
  });
});
