import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  lireOctetsPiece, lireOctetsDesPieces, verifierTaille, ErreurPieceIntrouvable,
  type PieceALire, type DepsOctetsPiece,
} from './octetsPiece';
import { piecesDeLEnvoi } from './piecesEnvoiCablage';

/**
 * ══ 🔴🔴 LOT PJ-APRES-VIDAGE — « LIRE LES OCTETS D'UNE PIÈCE » S'ÉCRIT UNE FOIS ═══════════════════════════════════
 *
 * CE QUE CE FICHIER TIENT, et pourquoi chaque épreuve existe :
 *
 * CONSTAT D'ARNO (fil 3494, 12 pièces) : « Gmail a refusé l'envoi : Les pièces jointes n'ont pas pu être lues :
 * The specified key does not exist. » Les 12 pièces sont VIDÉES de MinIO, toutes avec une copie Drive vérifiée.
 * L'AFFICHAGE savait basculer sur cette copie depuis le lot DRIVE-3 ; l'ENVOI ne le savait pas. Deux écritures de
 * la même règle, une seule à jour.
 *
 * 🔴 L'ÉPREUVE CENTRALE DU LOT est « pièce vidée → transfert réussi, pièce INTACTE (même taille, même empreinte) » :
 * c'est la demande d'Arno mot pour mot, et elle traverse le VRAI assembleur d'un envoi, pas seulement le lecteur.
 */

const md5De = (b: Buffer): string => createHash('md5').update(b).digest('hex');

/** Un PDF de test. On garde ses octets, sa taille et son empreinte : ce sont eux qu'on compare à l'arrivée. */
const CONSTAT = Buffer.from('%PDF-1.4\nconstat du 12 septembre — état des lieux\n%%EOF\n', 'utf8');
const MD5_CONSTAT = md5De(CONSTAT);

const piece = (sur: Partial<PieceALire> = {}): PieceALire => ({
  pieceId: 7,
  nomFichier: 'constat.pdf',
  cleStockage: 'gestion/2026/09/12/constat.pdf',
  stockageVide: false,
  driveFileId: null,
  md5Attendu: null,
  tailleAttendue: null,
  messageIdRfc: null,
  ...sur,
});

/** Des dépendances qui ÉCHOUENT partout. Chaque épreuve n'ouvre QUE la source dont elle parle. */
const depsMuettes = (): DepsOctetsPiece => ({
  minio: vi.fn(async () => { throw new Error('The specified key does not exist'); }),
  drive: vi.fn(async () => ({ ok: false as const, motif: 'aucune copie' })),
});

describe('l’ordre des sources : MinIO, puis NOTRE copie Drive, puis le message d’origine', () => {
  it('MinIO d’abord quand il a encore l’objet — et le Drive n’est PAS ouvert', async () => {
    const deps = { ...depsMuettes(), minio: vi.fn(async () => CONSTAT) };
    const r = await lireOctetsPiece(piece({ driveFileId: 'drv-1' }), deps);
    expect(r.ok && r.source).toBe('minio');
    expect(deps.drive).not.toHaveBeenCalled();
  });

  it('🔴 une pièce VIDÉE ne fait même pas un aller-retour vers MinIO : on sait déjà qu’il n’a plus rien', async () => {
    const deps = {
      ...depsMuettes(),
      drive: vi.fn(async () => ({ ok: true as const, octets: CONSTAT, md5: MD5_CONSTAT })),
    };
    const r = await lireOctetsPiece(
      piece({ stockageVide: true, driveFileId: 'drv-1', md5Attendu: MD5_CONSTAT }), deps);
    expect(r.ok && r.source).toBe('drive');
    expect(deps.minio).not.toHaveBeenCalled();
  });

  it('le message d’origine n’est tenté qu’en DERNIER, et seulement si l’appelant l’a câblé', async () => {
    const gmail = vi.fn(async () => CONSTAT);
    const r = await lireOctetsPiece(
      piece({ stockageVide: true, messageIdRfc: '<abc@mail>' }), { ...depsMuettes(), gmail });
    expect(r.ok && r.source).toBe('gmail');
    /* ⚠️ LOT PHOTOS-ET-INTERNE-INVERSE : un 3e argument est passé depuis ce lot — le repère de secours d'une
       pièce sans nom. Il est FACULTATIF pour le câblage, mais toujours fourni par le lecteur. */
    expect(gmail).toHaveBeenCalledWith('<abc@mail>', 'constat.pdf', { typeMime: null, taille: null });

    // Sans dépendance `gmail`, le recours n'existe pas — et le motif le DIT plutôt que de se taire.
    const sans = await lireOctetsPiece(piece({ stockageVide: true, messageIdRfc: '<abc@mail>' }), depsMuettes());
    expect(sans.ok).toBe(false);
    expect(sans.ok === false && sans.essais.join(' ')).toContain('non consulté par cet écran');
  });
});

describe('🔒 ce que le lecteur REFUSE de servir', () => {
  it('🔴 un fichier REMPLACÉ dans le Drive est refusé : même nom, autres octets', async () => {
    const autre = Buffer.from('un tout autre document', 'utf8');
    const r = await lireOctetsPiece(
      piece({ stockageVide: true, driveFileId: 'drv-1', md5Attendu: MD5_CONSTAT }),
      { ...depsMuettes(), drive: async () => ({ ok: true as const, octets: autre, md5: md5De(autre) }) });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('ne porte plus la même empreinte');
  });

  it('🔴 une source qui rend une TAILLE différente est refusée, empreinte ou pas', async () => {
    const tronque = CONSTAT.subarray(0, 10);
    const r = await lireOctetsPiece(
      piece({ tailleAttendue: CONSTAT.byteLength }), { ...depsMuettes(), minio: async () => tronque });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motif).toContain('la taille ne correspond pas');
  });

  it('un fichier VIDE n’est jamais un document, même si personne n’attendait de taille', () => {
    expect(verifierTaille(Buffer.alloc(0), null)).toContain('fichier vide');
  });

  it('⚠️ une taille INCONNUE ne fait rien échouer — et `undefined` est une taille inconnue', () => {
    expect(verifierTaille(CONSTAT, null)).toBeNull();
    // 🔴 LE DÉFAUT TROUVÉ EN ÉPROUVANT LA ROUTE : un champ oublié vaut `undefined`, et `x === undefined` n'est
    //   jamais vrai pour une longueur — TOUTE pièce était donc déclarée de la mauvaise taille et refusée.
    expect(verifierTaille(CONSTAT, undefined as unknown as number | null)).toBeNull();
    expect(verifierTaille(CONSTAT, Number('pas un nombre'))).toBeNull();
  });

  it('un champ ABSENT ne doit pas faire partir une lecture Drive avec un identifiant vide', async () => {
    const deps = depsMuettes();
    const incomplete = { nomFichier: 'constat.pdf', cleStockage: null } as unknown as PieceALire;
    const r = await lireOctetsPiece(incomplete, deps);
    expect(r.ok).toBe(false);
    expect(deps.drive).not.toHaveBeenCalled();
  });
});

describe('🔴 quand aucune source ne répond, le refus NOMME la pièce et dit ce qu’il a essayé', () => {
  it('le motif porte le nom du fichier et les trois tentatives', async () => {
    const r = await lireOctetsPiece(piece({ driveFileId: 'drv-1' }), depsMuettes());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motif).toContain('« constat.pdf »');
    expect(r.nomFichier).toBe('constat.pdf');
    // « The specified key does not exist » est traduit : c'est le message qu'Arno a reçu, et il n'apprenait rien.
    expect(r.motif).toContain('vidé du stockage');
    expect(r.essais).toHaveLength(3);
  });

  it('🔴 JAMAIS D’ENVOI PARTIEL : une seule pièce introuvable fait échouer TOUTE la liste', async () => {
    const pieces = [piece({ pieceId: 1, nomFichier: 'bail.pdf' }), piece({ pieceId: 2, nomFichier: 'rib.pdf' })];
    const deps = {
      ...depsMuettes(),
      minio: vi.fn(async (cle: string) => {
        if (cle === 'ok') return CONSTAT;
        throw new Error('The specified key does not exist');
      }),
    };
    pieces[0] = { ...pieces[0], cleStockage: 'ok' };
    await expect(lireOctetsDesPieces(pieces, deps)).rejects.toThrow(ErreurPieceIntrouvable);
    await expect(lireOctetsDesPieces(pieces, deps)).rejects.toThrow(/rib\.pdf/);
  });
});

/**
 * ══ 🔴🔴 L'ÉPREUVE DEMANDÉE PAR ARNO, MOT POUR MOT ══════════════════════════════════════════════════════════════
 *
 * « Test : une pièce vidée → transfert réussi avec la pièce intacte (même taille, même empreinte). »
 *
 * ⚠️ ELLE PASSE PAR `piecesDeLEnvoi`, l'assembleur RÉEL d'un envoi — pas seulement par le lecteur. C'est là que le
 * défaut vivait : le lecteur n'existait pas, et l'assembleur appelait MinIO en direct.
 */
describe('🔴🔴 une pièce VIDÉE de MinIO part quand même, et elle part INTACTE', () => {
  it('le transfert réussit, avec la même taille et la même empreinte que l’original', async () => {
    const octetsDuDrive = Buffer.from(CONSTAT); // une COPIE : rien ne doit dépendre de l'identité de l'objet
    const lu = await lireOctetsPiece(
      piece({ stockageVide: true, driveFileId: 'drv-1', md5Attendu: MD5_CONSTAT,
        tailleAttendue: CONSTAT.byteLength }),
      { ...depsMuettes(), drive: async () => ({ ok: true as const, octets: octetsDuDrive, md5: MD5_CONSTAT }) });
    expect(lu.ok).toBe(true);
    if (!lu.ok) return;

    const assemblees = await piecesDeLEnvoi(
      { id: 1, brouillonId: 61, voie: 'transferer', repondAMessageId: null } as never,
      {
        jeton: async () => null,
        duBrouillon: async () => [{
          nom: 'constat.pdf', typeMime: 'application/pdf',
          cleStockage: null, cleStockagePiece: 'gestion/2026/09/12/constat.pdf', pieceId: 7,
        }],
        octets: async () => lu.octets,
        ancre: async () => null,
        original: async () => null,
        objet: async () => null,
      });

    expect(assemblees).toHaveLength(1);
    expect(assemblees[0].nom).toBe('constat.pdf');
    expect(assemblees[0].octets.byteLength).toBe(CONSTAT.byteLength);
    expect(md5De(assemblees[0].octets)).toBe(MD5_CONSTAT);
  });

  it('🔴 et si la copie Drive manque AUSSI, le message ne part PAS — le nom du fichier est dans l’erreur', async () => {
    await expect(piecesDeLEnvoi(
      { id: 1, brouillonId: 61, voie: 'transferer', repondAMessageId: null } as never,
      {
        jeton: async () => null,
        duBrouillon: async () => [{
          nom: 'quittance-juillet.pdf', typeMime: 'application/pdf', cleStockage: null, cleStockagePiece: null,
          pieceId: 9,
        }],
        octets: async (p) => {
          const r = await lireOctetsPiece(piece({ ...p, cleStockage: null, nomFichier: p.nom }), depsMuettes());
          if (!r.ok) throw new Error(r.motif);
          return r.octets;
        },
        ancre: async () => null,
        original: async () => null,
        objet: async () => null,
      })).rejects.toThrow(/quittance-juillet\.pdf/);
  });
});

/**
 * ══ 🔒🔒 LA GARANTIE « Documents clients scannés » NE TIENT PAS À UNE PROMESSE ═══════════════════════════════════
 *
 * Le lecteur ne choisit AUCUN identifiant Drive : il reçoit celui que l'appelant lui donne. La garantie tient donc
 * entièrement à la requête qui le produit — et c'est elle qu'on éprouve, sur son TEXTE, parce qu'il n'existe pas
 * d'autre façon de prouver qu'une condition est bien dans un SQL sans base sous la main.
 */
describe('🔒 l’identifiant Drive ne peut désigner QUE une copie faite par le programme', () => {
  const source = readFileSync(join(process.cwd(), 'app/lib/gestion/octetsPieceCablage.ts'), 'utf8');

  it('la requête exige `origine = \'copie\'` ET `verifie_le IS NOT NULL`', () => {
    const sql = source.replace(/\s+/g, ' ');
    expect(sql).toContain("d.origine = 'copie'");
    expect(sql).toContain('d.verifie_le IS NOT NULL');
  });

  it('l’identifiant ne peut venir que de `gestion_piece_drive`, d’aucune autre table', () => {
    /**
     * ⚠️ ON ÉPROUVE LES `FROM`/`JOIN`, PAS LE FICHIER ENTIER : l'encadré du module NOMME « Documents clients
     * scannés » pour dire qu'il ne le lit pas, et cette phrase doit rester. Interdire le mot interdirait
     * l'explication — on interdit la LECTURE, ce qui n'est pas la même chose.
     */
    const tables = [...source.matchAll(/(?:FROM|JOIN)\s+([a-z_]+)/g)].map((m) => m[1]);
    expect([...new Set(tables)].sort()).toEqual(
      ['gestion_message', 'gestion_piece', 'gestion_piece_drive', 'gestion_piece_vidage']);
  });

  it('⚠️ les deux colonnes facultatives sont SONDÉES avant d’être nommées', () => {
    // Nommer une table absente ferait échouer TOUT envoi, y compris ceux qui marchaient la minute d'avant.
    expect(source).toContain('vidageDisponible()');
    expect(source).toContain('copiePiecesDisponible()');
  });
});

/**
 * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 1 — UNE PIÈCE « (SANS NOM) » SE RETROUVE QUAND MÊME ════════════════
 *
 * CE QUE CES ÉPREUVES TIENNENT, et le défaut EXACT qu'elles auraient attrapé :
 *
 * ⚠️ `lireOctetsPiece` NORMALISE la pièce reçue en la RECOPIANT CHAMP PAR CHAMP. `typeMime` avait été ajouté à
 * `PieceALire` et au dernier recours, mais PAS à cette recopie : le repère arrivait donc toujours vide, le
 * câblage rendait `null` sans regarder les pièces du message, et le refus disait « la pièce n'y a pas été
 * retrouvée » — ce qui était vrai, et n'apprenait rien. Deux essais de rattrapage ont été perdus là.
 *
 * 🔴 LA PREMIÈRE ÉPREUVE EST DONC CELLE DE LA RECOPIE : elle lit le repère REÇU PAR `deps.gmail`, pas le
 * résultat. Un test qui ne regarderait que l'issue passerait dès qu'on triche sur le nom.
 */
describe('🔴🔴 le second repère d’une pièce sans nom traverse bien la normalisation', () => {
  it('🔴 le type annoncé ARRIVE au dernier recours — c’est le champ qui manquait', async () => {
    const vus: Array<{ typeMime?: string | null; taille?: number | null } | undefined> = [];
    const deps: DepsOctetsPiece = {
      ...depsMuettes(),
      gmail: vi.fn(async (_id: string, _nom: string, repere?: { typeMime?: string | null; taille?: number | null }) => {
        vus.push(repere);
        return CONSTAT;
      }),
    };
    const r = await lireOctetsPiece(piece({
      nomFichier: '(sans nom)', cleStockage: null, messageIdRfc: '<m@ex>',
      typeMime: 'image/jpg', tailleAttendue: CONSTAT.length,
    }), deps);
    expect(r.ok).toBe(true);
    expect(vus).toEqual([{ typeMime: 'image/jpg', taille: CONSTAT.length }]);
  });

  it('⚠️ un appelant qui n’annonce aucun type passe un repère VIDE, sans planter — comportement d’avant le lot',
    async () => {
      const vus: Array<{ typeMime?: string | null; taille?: number | null } | undefined> = [];
      const deps: DepsOctetsPiece = {
        ...depsMuettes(),
        gmail: vi.fn(async (_i: string, _n: string, repere?: { typeMime?: string | null; taille?: number | null }) => {
          vus.push(repere); return null;
        }),
      };
      const r = await lireOctetsPiece(
        piece({ cleStockage: null, messageIdRfc: '<m@ex>' }), deps);
      expect(r.ok).toBe(false);
      expect(vus).toEqual([{ typeMime: null, taille: null }]);
    });

  /**
   * 🔴 LE NOM RESTE LA CLÉ. Le couple (type, taille) est un repère de SECOURS : si le nom désigne quelque chose,
   * c'est lui qui gagne — il est plus sûr. Cette épreuve tient l'ordre, pas seulement l'existence du secours.
   */
  it('le nom d’ORIGINE est toujours ce qu’on donne à chercher, le repère ne le remplace pas', async () => {
    const noms: string[] = [];
    const deps: DepsOctetsPiece = {
      ...depsMuettes(),
      gmail: vi.fn(async (_id: string, nom: string) => { noms.push(nom); return CONSTAT; }),
    };
    await lireOctetsPiece(piece({
      nomFichier: 'Quittance', nomOrigine: 'scan_0042.pdf', cleStockage: null,
      messageIdRfc: '<m@ex>', typeMime: 'application/pdf', tailleAttendue: CONSTAT.length,
    }), deps);
    expect(noms).toEqual(['scan_0042.pdf']);
  });
});

/**
 * ══ 🔴 CE QUE LE CÂBLAGE RÉEL FAIT DU REPÈRE — lu dans sa SOURCE, faute de pouvoir ouvrir Gmail en test ════════
 *
 * Le câblage parle à Gmail : une épreuve ne peut pas l'exécuter. On tient donc ses TROIS garde-fous par lecture,
 * parce que leur disparition serait silencieuse et rouvrirait exactement le trou qu'on vient de fermer.
 */
describe('🔒 les garde-fous du repère de secours, dans le câblage', () => {
  const source = readFileSync(join(process.cwd(), 'app/lib/gestion/octetsPieceCablage.ts'), 'utf8');

  it('le secours ne sert QUE pour un nom qui ne désigne rien', () => {
    expect(source).toContain('SANS_NOM');
    expect(source).toContain('if (!SANS_NOM.includes(voulu)) return null;');
  });

  it('🔴 il exige UNE SEULE pièce candidate : deux pièces identiques ne sont jamais départagées au hasard', () => {
    expect(source.replace(/\s+/g, ' ')).toContain('candidats.length === 1');
  });

  it('⚠️ sans type ni taille connus, il ne devine pas — il renonce', () => {
    expect(source.replace(/\s+/g, ' '))
      .toContain('if (type === \'\' || taille === null || taille <= 0) return null;');
  });
});
