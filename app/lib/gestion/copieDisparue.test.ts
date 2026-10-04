import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { copieVivanteAvec, estDisparition, motifDisparition } from './copieDisparue';

/**
 * ══ 🔴🔴 UNE COPIE DU REGISTRE A DISPARU DU DRIVE ════════════════════════════════════════════════════════════
 *
 * ARNO (01/10/2026), à propos des fichiers « _MESURE » qu'il supprime lui-même : « l'app ne doit pas trébucher
 * quand une copie de son registre a disparu du Drive (404 à la relecture de nom, au rangement ou à l'aperçu) :
 * marque la copie “disparue” dans le registre, cesse de la relire, utilise les autres copies, et n'affiche
 * jamais d'erreur à Arno pour ça. »
 */
describe('🔴 ce qui compte comme une disparition — et ce qui n’en est pas', () => {
  it('🔴 404 : le fichier n’existe plus', () => {
    expect(estDisparition(404)).toBe(true);
    expect(motifDisparition(404)).toContain('introuvable');
  });

  /** Le fichier existe, mais nous n'avons plus le droit de le lire : cette copie ne nous sert plus non plus. */
  it('🔴 403 : plus lisible — et le motif le dit AUTREMENT', () => {
    expect(estDisparition(403)).toBe(true);
    expect(motifDisparition(403)).toContain('droits');
    expect(motifDisparition(403)).not.toBe(motifDisparition(404));
  });

  /**
   * 🔴🔴 LA FAUTE À NE PAS COMMETTRE. Google occupé ou muet dit « réessaie », pas « le fichier n'est plus là ».
   * Marquer sur un 503 écarterait des lectures une copie parfaitement vivante — et l'on ne la retrouverait plus.
   */
  it('🔴🔴 429, 500, 503, 401 ne sont PAS des disparitions', () => {
    for (const s of [429, 500, 502, 503, 401, 400]) expect(estDisparition(s)).toBe(false);
  });
});

describe('🔴 le fragment « cette copie existe-t-elle encore ? »', () => {
  it('🔴 AVEC la migration 288 : la colonne est nommée', () => {
    expect(copieVivanteAvec(true, 'd')).toBe('d.disparu_le IS NULL');
  });

  /**
   * 🔴🔴 SANS LA MIGRATION, LA COLONNE N'EST NOMMÉE NULLE PART. La nommer ferait échouer la lecture des pièces
   * ENTIÈRE — donc l'affichage de tout le courrier, pas seulement d'une copie. Règle du module depuis le lot 4a.
   */
  it('🔴🔴 SANS la migration 288 : le SQL est celui d’avant ce lot', () => {
    expect(copieVivanteAvec(false, 'd')).toBe('true');
  });

  it('l’alias est respecté', () => {
    expect(copieVivanteAvec(true, 'gestion_piece_drive')).toBe('gestion_piece_drive.disparu_le IS NULL');
  });
});

/**
 * ══ 🔴🔴 LES QUATRE CHEMINS QU'ARNO NOMME, ET CE QU'ILS FONT DÉSORMAIS ══════════════════════════════════════
 *
 * ⚠️ ÉPROUVÉS SUR LE SOURCE : ces chemins tirent tous `pg` ou Google, et ce qui doit être vrai est un CÂBLAGE —
 * que le marquage soit branché là, et que la lecture écarte les disparues partout.
 */
describe('🔴🔴 « cesse de la relire » : les lectures écartent les copies disparues', () => {
  const LECTURES: [string, string][] = [
    ['le lecteur d’octets (aperçu, téléchargement)', 'app/lib/gestion/octetsPieceCablage.ts'],
    ['la carte d’une pièce', 'app/lib/gestion/carteRepo.ts'],
    ['le registre, la relecture de nom et les tranches', 'app/lib/gestion/nomUsageRepo.ts'],
  ];
  for (const [quoi, fichier] of LECTURES) {
    it(`🔴 ${quoi}`, () => {
      expect(readFileSync(fichier, 'utf8')).toContain('sqlCopieVivante');
    });
  }

  /**
   * 🔴 LE REGISTRE DU RENOMMAGE AUSSI. Offrir au stylo un identifiant mort ne pourrait produire qu'un refus de
   * Google — c'est-à-dire un message d'erreur, précisément ce qu'Arno ne veut pas voir.
   */
  it('🔴 `registreDeLaPiece` n’offre plus un identifiant mort au renommage', () => {
    const src = readFileSync('app/lib/gestion/nomUsageRepo.ts', 'utf8');
    const corps = src.slice(src.indexOf('export async function registreDeLaPiece'),
      src.indexOf('export async function ecrireNomUsage'));
    expect(corps).toContain("sqlCopieVivante('gestion_piece_drive')");
  });
});

describe('🔴🔴 « marque la copie disparue » : les trois écritures sont branchées', () => {
  const MARQUAGES: [string, string][] = [
    ['la relecture de nom (fil, modale, visionneuse)', 'app/lib/gestion/relectureNomsDrive.ts'],
    ['le rangement, quand la copie source a disparu', 'app/lib/gestion/depotDriveReel.ts'],
    ['l’aperçu et le téléchargement', 'app/lib/gestion/octetsPieceCablage.ts'],
  ];
  for (const [quoi, fichier] of MARQUAGES) {
    it(`🔴 ${quoi}`, () => {
      expect(readFileSync(fichier, 'utf8')).toContain('marquerCopieDisparue');
    });
  }

  /**
   * 🔴🔴 « N'AFFICHE JAMAIS D'ERREUR À ARNO POUR ÇA ». Le marquage est lancé sans être attendu (`void`), et
   * `marquerCopieDisparue` ne lève jamais : un chemin de LECTURE ne doit pas devenir une panne parce qu'on n'a
   * pas su noter une disparition.
   */
  it('🔴🔴 le marquage ne peut pas faire échouer la lecture qui l’a déclenché', () => {
    const repo = readFileSync('app/lib/gestion/nomUsageRepo.ts', 'utf8');
    const corps = repo.slice(repo.indexOf('export async function marquerCopieDisparue'));
    expect(corps).toContain('catch');
    expect(corps).toContain('return false');
    // …et il est IDEMPOTENT : une copie déjà marquée garde sa première date, la seule intéressante.
    expect(corps).toContain('disparu_le IS NULL');
    for (const f of ['app/lib/gestion/relectureNomsDrive.ts', 'app/lib/gestion/depotDriveReel.ts',
      'app/lib/gestion/octetsPieceCablage.ts']) {
      expect(readFileSync(f, 'utf8')).toContain('void marquerCopieDisparue(');
    }
  });

  /**
   * 🔴 « UTILISE LES AUTRES COPIES ». Au rangement, une copie source disparue ne fait pas échouer le dépôt : la
   * voie des octets prend le relais (éprouvé dans `depotDrive.test.ts`). À la lecture, `lireOctetsPiece`
   * poursuit vers MinIO puis vers le message d'origine.
   */
  it('🔴 le rangement retombe sur les octets, le lecteur poursuit sa chaîne', () => {
    expect(readFileSync('app/lib/gestion/depotDrive.ts', 'utf8'))
      .toContain('ET SI LA COPIE ÉCHOUE, ON RETOMBE SUR NOS OCTETS');
    const lecteur = readFileSync('app/lib/gestion/octetsPiece.ts', 'utf8');
    /* ⚠️ Fragment sans la parenthèse fermante : l'appel porte un 3e argument depuis le lot
       PHOTOS-ET-INTERNE-INVERSE (le repère d'une pièce sans nom). Ce garde surveille la CHAÎNE DE RECOURS,
       pas la signature de l'appel. */
    expect(lecteur).toContain('deps.gmail(p.messageIdRfc, p.nomOrigine ?? p.nomFichier');
  });
});

/**
 * ⚠️ LE MODULE EST PUR : il est lisible par un composant du navigateur, et ne doit donc tirer ni `./schema`, ni
 * `../db/client`, ni `pg`. La version qui les mêlait a été attrapée par le garde de frontière en une seconde.
 */
describe('🔒 la frontière client', () => {
  it('🔒 `copieDisparue.ts` n’importe ni la base ni la sonde', () => {
    const src = readFileSync('app/lib/gestion/copieDisparue.ts', 'utf8');
    expect(src).not.toContain("from './schema'");
    expect(src).not.toContain("from '../db/client'");
  });
});

/** ⚠️ La sonde existe, et elle porte sur la BONNE colonne. */
describe('⚠️ la sonde de la migration 288', () => {
  it('nomme `gestion_piece_drive.disparu_le`', () => {
    const src = readFileSync('app/lib/gestion/schema.ts', 'utf8');
    expect(src).toContain("colonneExiste('gestion_piece_drive', 'disparu_le')");
  });
});
