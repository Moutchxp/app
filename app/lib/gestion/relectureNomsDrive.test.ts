import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import type { PieceARelire } from './nomUsageRepo';
import type { NomVuDansDrive } from './nomUsagePiece';

/**
 * ══ 🔴🔴 LOT RANGER-INSTANTANE-ET-NOM — RELIRE LES NOMS DRIVE À LA DEMANDE ═══════════════════════════════════
 *
 * Arno : « le balayage sur 3 jours est trop lent. Ajoute une lecture À LA DEMANDE : à l'ouverture d'un fil, d'une
 * modale de pièces ou de la visionneuse […] avec un cache court de 30 s environ. »
 */
const ecrits: { pieceId: number; nom: string }[] = [];
const notes: { ids: string[]; nom: string }[] = [];
const journaux: Record<string, unknown>[] = [];
const alignees: number[] = [];
let lectures = 0;

vi.mock('./nomUsageRepo', async (vrai) => ({
  ...(await vrai<Record<string, unknown>>()),
  ecrireNomUsage: async (pieceId: number, nom: string) => { ecrits.push({ pieceId, nom }); return true; },
  journaliserRenommage: async (o: Record<string, unknown>) => { journaux.push(o); },
  noterNomEcritDansDrive: async (ids: readonly string[], nom: string) => { notes.push({ ids: [...ids], nom }); },
  piecesParIdentifiants: async () => [],
}));
vi.mock('./renommagePieceReel', () => ({
  renommerPiece: async (o: { pieceId: number }) => { alignees.push(o.pieceId); return { etat: 'ok' }; },
}));
/** Chaque identifiant compte UNE lecture : c'est ce qui rend la mémoire de 30 s observable. */
vi.mock('./reprendreNomsDrive', () => ({
  lireNomsDrive: async (_j: string, ids: readonly string[]) => {
    lectures += ids.length;
    return ids.map((id) => ({ driveFileId: id, nom: NOMS[id] ?? '', modifieLe: DATES[id] ?? null }))
      .filter((v) => v.nom !== '');
  },
}));
vi.mock('./driveDelegue', () => ({ jetonPourSubject: async () => ({ ok: true, jeton: 'j' }) }));

const NOMS: Record<string, string> = {};
const DATES: Record<string, string | null> = {};

const {
  nomsDriveMemo, oublierLesNomsDrive, reprendrePourCesPieces, tailleMemoireNoms, MEMOIRE_NOMS_MS,
  PLAFOND_A_LA_DEMANDE,
} = await import('./relectureNomsDrive');

const piece = (o: Partial<PieceARelire> & { copies: PieceARelire['copies'] }): PieceARelire => ({
  pieceId: 1, nomAffiche: '0836_001.pdf', ...o,
});
const copie = (driveFileId: string, nomDrive: string | null): PieceARelire['copies'][number] => ({
  driveFileId, dossierId: 'DOS', dossierNom: 'Test', origine: 'manuel', nomDrive,
});

beforeEach(() => {
  ecrits.length = 0; notes.length = 0; journaux.length = 0; alignees.length = 0; lectures = 0;
  for (const k of Object.keys(NOMS)) delete NOMS[k];
  for (const k of Object.keys(DATES)) delete DATES[k];
  oublierLesNomsDrive();
});

describe('🔴 la mémoire courte des noms', () => {
  it('🔴 deux demandes rapprochées ne paient qu’une lecture', async () => {
    NOMS.D1 = 'Recommandé M Ahmed KHARRAT.pdf';
    await nomsDriveMemo('j', ['D1'], { fetch }, 1_000);
    await nomsDriveMemo('j', ['D1'], { fetch }, 5_000);
    expect(lectures).toBe(1);
    expect(tailleMemoireNoms()).toBe(1);
  });

  /**
   * ⚠️ 30 s, ET PAS DAVANTAGE. Au-delà, un nom changé dans Drive pendant qu'on regarde l'écran ne remonterait pas
   * au geste suivant — et l'on retomberait dans le défaut qu'on répare.
   */
  it('⚠️ passé 30 s, on redemande', async () => {
    NOMS.D1 = 'a.pdf';
    await nomsDriveMemo('j', ['D1'], { fetch }, 1_000);
    await nomsDriveMemo('j', ['D1'], { fetch }, 1_000 + MEMOIRE_NOMS_MS + 1);
    expect(lectures).toBe(2);
  });

  /**
   * ⚠️ UN SILENCE DE GOOGLE EST MÉMORISÉ LUI AUSSI (comme `null`) : sans cela, un fichier mis à la corbeille
   * serait redemandé à CHAQUE ouverture d'écran, éternellement. Au pire, on ignore un renommage 30 secondes.
   */
  it('⚠️ un identifiant muet n’est pas martelé', async () => {
    await nomsDriveMemo('j', ['DISPARU'], { fetch }, 1_000);
    const r = await nomsDriveMemo('j', ['DISPARU'], { fetch }, 2_000);
    expect(lectures).toBe(1);
    expect(r.size).toBe(0);
  });

  it('les identifiants vides ou répétés ne coûtent rien', async () => {
    NOMS.D1 = 'a.pdf';
    await nomsDriveMemo('j', ['D1', 'D1', '  ', ''], { fetch }, 1_000);
    expect(lectures).toBe(1);
  });
});

describe('🔴🔴 la règle de reprise, identique au balayage de fond', () => {
  const relire = (p: readonly PieceARelire[]) => reprendrePourCesPieces(p, 'j', { fetch }, nomsDriveMemo);

  it('🔴 un nom changé dans Drive devient le nom d’usage', async () => {
    NOMS.D1 = 'Recommandé M Ahmed KHARRAT (signé).pdf';
    const b = await relire([piece({ copies: [copie('D1', 'Recommandé M Ahmed KHARRAT.pdf')] })]);
    expect(ecrits).toEqual([{ pieceId: 1, nom: 'Recommandé M Ahmed KHARRAT (signé).pdf' }]);
    expect(b.reprises).toEqual([
      { pieceId: 1, ancien: '0836_001.pdf', nouveau: 'Recommandé M Ahmed KHARRAT (signé).pdf' },
    ]);
  });

  /** 🔴 LE JOURNAL DIT « drive » : en relisant l'historique, « quelqu'un a cliqué le stylo » et « le fichier a été
      renommé dans Google Drive » ne doivent pas se lire pareil. */
  it('🔴 le journal distingue Drive du stylo', async () => {
    NOMS.D1 = 'autre.pdf';
    await relire([piece({ copies: [copie('D1', 'ancien.pdf')] })]);
    expect(journaux[0]).toMatchObject({ source: 'drive', parLibelle: 'Google Drive', par: null });
  });

  /**
   * 🔴🔴 UNE COPIE DONT ON IGNORE CE QU'ON Y A ÉCRIT EST LAISSÉE TRANQUILLE — et on ne va même pas la LIRE.
   * C'est la règle de la migration 286, et c'est ce qui a évité que la première épreuve réelle ne renomme
   * 60 pièces sur 60 d'après leurs préfixes « date — expéditeur — ».
   */
  it('🔴🔴 `nom_drive` nul : rien n’est lu, rien n’est repris', async () => {
    NOMS.D1 = 'n’importe quoi.pdf';
    const b = await relire([piece({ copies: [copie('D1', null)] })]);
    expect(lectures).toBe(0);
    expect(ecrits).toEqual([]);
    expect(b.relues).toBe(0);
  });

  it('⚠️ un nom Drive identique à ce qu’on y a écrit n’est pas un renommage', async () => {
    NOMS.D1 = 'pose.pdf';
    await relire([piece({ copies: [copie('D1', 'pose.pdf')] })]);
    expect(ecrits).toEqual([]);
  });

  /**
   * ══ 🔴🔴 DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE, EN REMETTANT LE NOM D'ORIGINE DANS DRIVE ═══════════════════════
   *
   * Le 30/09/2026 : un nom renommé dans Drive est bien repris ; le REMETTRE ensuite ne l'était plus, et le nom
   * d'usage restait bloqué sur la version renommée.
   *
   * 🔴 LA CAUSE : `nom_drive` — « ce que NOUS avons écrit sur ce fichier » — est la base de comparaison, et on
   * la laissait à sa valeur d'AVANT l'adoption. Le fichier disait donc éternellement « autre chose que ce qu'on
   * y a écrit », et un retour au nom précédent redevenait, lui, « identique » : invisible.
   *
   * 🔴 ADOPTER UN NOM, C'EST LE FAIRE NÔTRE : on le consigne, et le prochain changement se voit — dans les deux
   * sens.
   */
  it('🔴🔴 le nom adopté est consigné au registre, pour que le RETOUR se voie aussi', async () => {
    NOMS.D1 = 'renommé à la main.pdf';
    await relire([piece({ copies: [copie('D1', 'pose.pdf')] })]);
    expect(notes).toContainEqual({ ids: ['D1'], nom: 'renommé à la main.pdf' });
  });

  /** « La plus récemment modifiée gagne » — règle d'arbitrage, pas préférence : deux copies renommées
      différemment sont deux intentions contradictoires. */
  it('🔴 entre deux copies renommées, la plus récente l’emporte', async () => {
    NOMS.D1 = 'vieux.pdf'; DATES.D1 = '2026-09-01T10:00:00Z';
    NOMS.D2 = 'récent.pdf'; DATES.D2 = '2026-09-30T10:00:00Z';
    await relire([piece({ copies: [copie('D1', 'pose.pdf'), copie('D2', 'pose.pdf')] })]);
    expect(ecrits).toEqual([{ pieceId: 1, nom: 'récent.pdf' }]);
    // Les AUTRES copies sont alignées, sans seconde ligne de journal : un seul fait, une seule ligne.
    expect(alignees).toEqual([1]);
    expect(journaux).toHaveLength(1);
  });
});

/**
 * ══ 🔴🔴 UNE SEULE ÉCRITURE DE LA RÈGLE, POUR DEUX DÉCLENCHEURS ══════════════════════════════════════════════
 *
 * Le balayage de fond et la lecture à la demande décident exactement la même chose. Deux copies divergeraient, et
 * ce jour-là l'une reprendrait un nom que l'autre refuse — sur la même pièce, selon l'heure.
 */
describe('🔒 le balayage de fond passe par le même cœur', () => {
  it('🔴 `reprendreNomsDepuisDrive` appelle `reprendrePourCesPieces`', () => {
    const src = readFileSync('app/lib/gestion/reprendreNomsDrive.ts', 'utf8');
    expect(src).toContain('reprendrePourCesPieces');
    // …et il n'a plus sa propre copie de la décision.
    expect(src).not.toContain('nomRepriseDepuisDrive(');
  });

  /** 🔴 LES PIÈCES RANGÉES RÉCEMMENT PASSENT DEVANT (demande d'Arno), sans que la tranche perde ses propriétés. */
  it('🔴 la passe prend les prioritaires PUIS la tranche, sans doublon', () => {
    const src = readFileSync('app/lib/gestion/reprendreNomsDrive.ts', 'utf8');
    expect(src).toContain('piecesPrioritaires()');
    expect(src).toContain('piecesARelire(tranche');
    expect(src).toContain('deLaTranche.filter((p) => !vues.has(p.pieceId))');
  });

  /**
   * ══ 🔴🔴 AU NOM DE QUI L'ON LIT — DÉFAUT TROUVÉ À L'ÉPREUVE RÉELLE ════════════════════════════════════════
   *
   * PREMIÈRE VERSION : lire avec le compte de la relève, comme le balayage de fond. Le renommage fait dans
   * Google Drive n'a PAS été repris, et rien ne l'a dit : le fichier était dans un Drive partagé dont
   * `gestion@criterimmo.fr` n'est pas membre, Google répondait 404, et « introuvable » se lit comme « rien à
   * reprendre ». On lit donc au nom de la personne qui REGARDE l'écran, comme le dépôt écrit au nom de celui
   * qui range.
   */
  it('🔴🔴 la lecture à la demande accepte l’adresse de qui regarde l’écran', () => {
    const src = readFileSync('app/lib/gestion/relectureNomsDrive.ts', 'utf8');
    expect(src).toContain('sujet: string | null = null');
    expect(src).toContain("const adresse = (sujet ?? '').trim() || COMPTE_RELEVE;");
    expect(src).toContain('jetonPourSubject(adresse, deps)');
    const route = readFileSync('app/(admin)/api/admin/gestion/fils/[id]/messages/route.ts', 'utf8');
    expect(route).toContain('etatAccesDrive(request)');
    expect(route).toContain("acces.etat === 'ok' ? acces.adresse : null");
  });

  /** 🔒 ET LA MÉMOIRE PORTE LE SUJET : deux collaborateurs ne voient pas le même Drive. */
  it('🔒 la mémoire des noms est cloisonnée par collaborateur', async () => {
    NOMS.D1 = 'a.pdf';
    await nomsDriveMemo('j', ['D1'], { fetch }, 1_000, 'alice@exemple.fr');
    await nomsDriveMemo('j', ['D1'], { fetch }, 2_000, 'bob@exemple.fr');
    expect(lectures).toBe(2);
  });

  /** ⚠️ LE PLAFOND EXISTE : un écran qui afficherait deux cents pièces ne doit pas lancer deux cents lectures. */
  it('⚠️ la lecture à la demande est bornée', () => {
    expect(PLAFOND_A_LA_DEMANDE).toBeLessThanOrEqual(50);
  });

  /**
   * 🔴 ELLE EST BRANCHÉE LÀ OÙ LES TROIS ÉCRANS D'ARNO LISENT : le fil, le récapitulatif des pièces et la
   * visionneuse sont trois vues de la MÊME réponse. La brancher trois fois l'aurait déclenchée trois fois pour
   * un seul regard.
   */
  it('🔴 la route du fil la déclenche, et ne relit le fil que si un nom a changé', () => {
    const src = readFileSync('app/(admin)/api/admin/gestion/fils/[id]/messages/route.ts', 'utf8');
    expect(src).toContain('relireNomsDesPieces');
    expect(src).toContain('bilan.reprises.length === 0');
  });
});
