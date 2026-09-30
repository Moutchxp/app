import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireNomsDrive, reprendreNomsDepuisDrive, UNE_PASSE_SUR } from './reprendreNomsDrive';
import { trancheDuMoment, TRANCHES } from './nomUsageRepo';

/**
 * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — RENOMMÉ DANS GOOGLE DRIVE, REPRIS PAR L'APP ═════════════════════════════
 *
 * ═══ 🔴 CE QUE LA PREMIÈRE VERSION FAISAIT, ET QUE L'ÉPREUVE RÉELLE A RÉFUTÉ ═══════════════════════════════════
 *
 * Elle comparait le nom du fichier dans Drive au nom de la PIÈCE : « différent ⇒ quelqu'un l'a renommé ».
 * Lancée pour de vrai le 30/09/2026, elle a « repris » 60 pièces sur 60.
 *
 * 🔴 LA CAUSE : les copies de « 00 Arrivée des mails » ne portent PAS le nom de la pièce. La copie les nomme
 * « 2026-09-23 — expediteur@exemple.fr — Facture.pdf », exprès, pour qu'un dossier d'arrivée se lise. La
 * comparaison était donc vraie pour les 26 522 copies, et la passe aurait renommé toute la base d'après ses
 * préfixes. Ces épreuves-ci tiennent la règle qui l'a remplacée.
 */
let pieces: unknown[] = [];
let ecrits: { piece: number; nom: string }[] = [];
let journal: { source: string; ancien: string; nouveau: string }[] = [];

vi.mock('./nomUsageRepo', async (original) => {
  const vrai = await original<typeof import('./nomUsageRepo')>();
  return {
    ...vrai,
    piecesARelire: async () => pieces,
    ecrireNomUsage: async (piece: number, nom: string) => { ecrits.push({ piece, nom }); return true; },
    journaliserRenommage: async (o: { source: string; ancienNom: string; nouveauNom: string }) => {
      journal.push({ source: o.source, ancien: o.ancienNom, nouveau: o.nouveauNom });
    },
  };
});
vi.mock('./driveDelegue', () => ({ jetonPourSubject: async () => ({ ok: true, jeton: 'JETON' }) }));
vi.mock('./renommagePieceReel', () => ({ renommerPiece: async () => ({ ok: true, nom: 'x', faits: [], refus: [] }) }));

/** Une copie telle que le registre la connaît. `nomDrive` = ce que l'APPLICATION y a écrit. */
const copie = (id: string, nomDrive: string | null) => ({
  driveFileId: id, dossierId: 'dos', dossierNom: '00 Arrivée des mails', origine: 'copie', nomDrive,
});

const driveRepond = (parId: Record<string, { nom: string; modifieLe?: string }>) => vi.fn(
  async (url: string | URL) => {
    const id = decodeURIComponent(String(url).split('/files/')[1]?.split('?')[0] ?? '');
    const f = parId[id];
    if (f === undefined) return { ok: false, status: 404 } as unknown as Response;
    return {
      ok: true,
      json: async () => ({ id, name: f.nom, modifiedTime: f.modifieLe ?? '2026-09-30T10:00:00Z' }),
    } as unknown as Response;
  });

beforeEach(() => { pieces = []; ecrits = []; journal = []; });

describe('🔴🔴 la règle qui a remplacé la première version', () => {
  /**
   * 🔴🔴 L'ÉPREUVE CENTRALE, celle qui rejoue le défaut : une copie de « 00 Arrivée des mails » porte un préfixe
   * « date — expéditeur — », et l'application n'a JAMAIS écrit son nom. Elle doit être laissée tranquille.
   */
  it('🔴🔴 une copie dont on IGNORE ce qu’on y a écrit n’est JAMAIS reprise', async () => {
    pieces = [{
      pieceId: 1, nomAffiche: 'Facture.pdf',
      copies: [copie('f1', null)],
    }];
    const r = await reprendreNomsDepuisDrive({ tranche: 0 }, {
      fetch: driveRepond({ f1: { nom: '2026-09-23 — expediteur@exemple.fr — Facture.pdf' } }) as never,
    });
    expect(r.reprises).toBe(0);
    expect(ecrits).toEqual([]);
  });

  it('🔴 une copie dont on SAIT ce qu’on y a écrit, et que Drive dit autrement, est reprise', async () => {
    pieces = [{ pieceId: 1, nomAffiche: 'Facture.pdf', copies: [copie('f1', 'Facture.pdf')] }];
    const r = await reprendreNomsDepuisDrive({ tranche: 0 }, {
      fetch: driveRepond({ f1: { nom: 'Facture acquittée.pdf' } }) as never,
    });
    expect(r.reprises).toBe(1);
    expect(ecrits).toEqual([{ piece: 1, nom: 'Facture acquittée.pdf' }]);
  });

  it('⚠️ une copie au nom INCHANGÉ ne déclenche rien', async () => {
    pieces = [{ pieceId: 1, nomAffiche: 'Facture.pdf', copies: [copie('f1', 'Facture.pdf')] }];
    const r = await reprendreNomsDepuisDrive({ tranche: 0 }, {
      fetch: driveRepond({ f1: { nom: 'Facture.pdf' } }) as never,
    });
    expect(r.reprises).toBe(0);
  });

  /** 🔴 LE JOURNAL DIT « drive » : en relisant l'historique, on doit distinguer le stylo de Google Drive. */
  it('🔴 le journal dit d’où vient le renommage', async () => {
    pieces = [{ pieceId: 1, nomAffiche: 'a.pdf', copies: [copie('f1', 'a.pdf')] }];
    await reprendreNomsDepuisDrive({ tranche: 0 }, { fetch: driveRepond({ f1: { nom: 'b.pdf' } }) as never });
    expect(journal).toEqual([{ source: 'drive', ancien: 'a.pdf', nouveau: 'b.pdf' }]);
  });

  /** ⚠️ Un fichier que Drive ne rend plus (corbeille, hors périmètre) n'emporte pas les autres. */
  it('⚠️ un fichier illisible est sauté, les autres continuent', async () => {
    pieces = [
      { pieceId: 1, nomAffiche: 'a.pdf', copies: [copie('disparu', 'a.pdf')] },
      { pieceId: 2, nomAffiche: 'b.pdf', copies: [copie('f2', 'b.pdf')] },
    ];
    const r = await reprendreNomsDepuisDrive({ tranche: 0 }, {
      fetch: driveRepond({ f2: { nom: 'b bis.pdf' } }) as never,
    });
    expect(r.reprises).toBe(1);
    expect(ecrits).toEqual([{ piece: 2, nom: 'b bis.pdf' }]);
  });

  it('⚠️ elle NE LÈVE JAMAIS : appelée en fin de relève, elle ne peut pas faire échouer la passe', async () => {
    pieces = [{ pieceId: 1, nomAffiche: 'a.pdf', copies: [copie('f1', 'a.pdf')] }];
    const r = await reprendreNomsDepuisDrive({ tranche: 0 }, {
      fetch: (() => { throw new Error('réseau coupé'); }) as never,
    });
    expect(r.reprises).toBe(0);
  });
});

/**
 * ══ 🔴 LE BALAYAGE : TOUT EST VU, DANS UN DÉLAI BORNÉ ═════════════════════════════════════════════════════════
 *
 * Deuxième chose que l'épreuve réelle a corrigée : « les plus récemment déposées d'abord » ne classe RIEN sur
 * cette base — 26 522 copies ont été faites la même nuit. La pièce visée s'est retrouvée au rang 24 100, donc
 * jamais relue. Le découpage par tranches garantit qu'aucune pièce ne peut être oubliée.
 */
describe('🔴 le découpage en tranches', () => {
  it('🔴 la tranche ne dépend QUE de l’horloge — sans état à retenir entre deux passes', () => {
    const t0 = trancheDuMoment(0);
    expect(trancheDuMoment(600_000)).toBe((t0 + 1) % TRANCHES);
    // Un redémarrage du travailleur ne remet rien à zéro : c'est l'heure qui décide, pas un compteur.
    expect(trancheDuMoment(1_234_567_890)).toBe(trancheDuMoment(1_234_567_890));
  });

  it('🔴 le tour complet est BORNÉ : toutes les tranches sont atteintes', () => {
    const vues = new Set<number>();
    for (let i = 0; i < TRANCHES; i += 1) vues.add(trancheDuMoment(i * 600_000));
    expect(vues.size).toBe(TRANCHES);
  });

  it('la cadence est écrite, pas devinée', () => {
    expect(UNE_PASSE_SUR).toBe(10);
    // 440 tranches × 10 minutes ≈ 3 jours pour revoir tout le registre.
    expect(TRANCHES).toBe(440);
  });
});

/**
 * 🔴 LE LANGAGE DE REQUÊTE DE DRIVE N'A PAS DE CHAMP `id`. La première version groupait les lectures en un
 * `files.list` avec « id = 'x' or id = 'y' » : syntaxiquement accepté, sémantiquement vide — zéro fichier rendu,
 * sans erreur. C'est le pire des cas, celui qui ne dit rien.
 */
describe('🔴 la lecture des noms', () => {
  it('🔴 un `files.get` par identifiant, jamais un `q` par identifiant', async () => {
    const appels: string[] = [];
    const f = vi.fn(async (url: string | URL) => {
      appels.push(String(url));
      return { ok: true, json: async () => ({ id: 'f1', name: 'n.pdf' }) } as unknown as Response;
    });
    await lireNomsDrive('J', ['f1', 'f2'], { fetch: f as never });
    expect(appels).toHaveLength(2);
    for (const u of appels) {
      expect(u).toContain('/files/');
      expect(u).not.toContain('q=');
    }
    // `fields` réduit aux trois champs dont la décision a besoin : rien de plus ne traverse le réseau.
    expect(appels[0]).toContain('fields=id%2Cname%2CmodifiedTime');
  });

  it('⚠️ un identifiant répété n’est lu qu’une fois', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'f1', name: 'n' }) }) as unknown as Response);
    await lireNomsDrive('J', ['f1', 'f1', ' f1 '], { fetch: f as never });
    expect(f).toHaveBeenCalledTimes(1);
  });

  /** 🔒 ELLE NE FAIT QUE LIRE : aucun verbe d'écriture dans ce module. */
  it('🔒 aucune écriture dans la lecture des noms', () => {
    const src = readFileSync('app/lib/gestion/reprendreNomsDrive.ts', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    expect(code).not.toMatch(/method:\s*'(PATCH|POST|PUT|DELETE)'/);
  });
});
