import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOSSIER_INTERDIT_LECTURE, type Maillon } from '../../../../../../lib/gestion/driveLectureFichier';
import { oublierLeDrive } from '../../../../../../lib/gestion/driveMemoire';

/**
 * ══ 🔴🔴 LOT DRIVE-MENU-SUPPRIMER-DUPLIQUER-LOUPE — LA ROUTE QUI MET À LA CORBEILLE, ET SURTOUT CELLE QUI REFUSE ══
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CES TESTS TIENNENT, ET QUE L'ÉCRAN NE PEUT PAS TENIR : le serveur refuse MÊME APPELÉ DIRECTEMENT.
 *
 * L'écran n'affiche pas l'entrée « Supprimer » là où elle serait refusée — c'est du confort, et un écran se
 * modifie. Un vieil onglet, une requête forgée, un `curl` arriveraient encore avec l'identifiant d'un document
 * d'archive dans le corps. C'est LE TEST D'INTRUSION qu'Arno demande, et il est ici.
 *
 * 🔴🔴 LE GARDE EST POSÉ PAR ASCENDANCE DE DOSSIERS, PAS PAR LE NOM. On le prouve dans les deux sens :
 *   · un fichier rangé TROIS niveaux sous « Documents clients scannés », dont le nom ne dit rien → REFUSÉ ;
 *   · un fichier nommé « Documents clients scannés.pdf » rangé ailleurs → ACCEPTÉ (le nom ne protège ni n'accuse).
 *
 * ⚠️ LA CHAÎNE DES PARENTS EST DOUBLÉE, JAMAIS LA RÈGLE : `peutMettreCorbeille` — la vraie — est laissée intacte,
 * et ce sont `chaineParents`, `metadonneesMemo` et `idsProteges` qu'on simule. Doubler le verdict reviendrait à
 * tester notre double.
 *
 * 🔴 ET LA PREUVE LA PLUS IMPORTANTE, À CHAQUE REFUS : `basculerCorbeille` N'A PAS ÉTÉ APPELÉ. Un refus qui se
 * prononce après l'écriture ne protège rien — surtout quand l'écriture retire un document d'un dossier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const gardeMock = vi.fn();
const jetonMock = vi.fn();
const journalDispoMock = vi.fn();
const corbeilleDispoMock = vi.fn();
const protegesMock = vi.fn();
const chaineMock = vi.fn();
const metaMock = vi.fn();
const basculerMock = vi.fn();
const inscrireMock = vi.fn();
const annulablesMock = vi.fn();
const marquerMock = vi.fn();

vi.mock('../../../../../../lib/admin/garde', () => ({
  exigerCompteActif: (...a: unknown[]) => gardeMock(...a),
}));
vi.mock('../../../../../../lib/gestion/jetonCollaborateur', () => ({
  jetonPourRequete: (...a: unknown[]) => jetonMock(...a),
}));
vi.mock('../../../../../../lib/gestion/auteur', () => ({
  auteurDeLaRequete: async () => ({ id: 7, libelle: 'a.jorel@sansvisavis.com' }),
}));
vi.mock('../../../../../../lib/gestion/schema', () => ({
  journalMouvementDriveDisponible: () => journalDispoMock(),
  corbeilleDriveDisponible: () => corbeilleDispoMock(),
}));
vi.mock('../../../../../../lib/gestion/driveVerdict', () => ({
  idsProteges: (...a: unknown[]) => protegesMock(...a),
}));
vi.mock('../../../../../../lib/gestion/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../lib/gestion/drive')>()),
  chaineParents: (_j: string, depart: string) => chaineMock(depart),
}));
vi.mock('../../../../../../lib/gestion/driveMemoire', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../lib/gestion/driveMemoire')>()),
  metadonneesMemo: (_s: string, _j: string, id: string) => metaMock(id),
}));
vi.mock('../../../../../../lib/gestion/driveCorbeilleReel', () => ({
  basculerCorbeille: (...a: unknown[]) => basculerMock(...a),
}));
vi.mock('../../../../../../lib/gestion/driveMouvementRepo', () => ({
  inscrireMouvement: (...a: unknown[]) => inscrireMock(...a),
  mouvementsAnnulables: (...a: unknown[]) => annulablesMock(...a),
  marquerAnnule: (...a: unknown[]) => marquerMock(...a),
}));

import { GET, POST } from './route';

/**
 * L'ARBORESCENCE D'ESSAI :
 *   racine ── GESTION LOCATIVE ── Documents clients scannés ── 1 actifs ── DUPONT ── avis.pdf
 *                              └─ Base de données locative ── Travaux ── bail.pdf
 *                              └─ « Documents clients scannés.pdf » (un FICHIER, hors archive : le piège du nom)
 */
const ARBRE: Record<string, { nom: string; parentId: string | null; dossier: boolean }> = {
  racine: { nom: 'Drive partagé', parentId: null, dossier: true },
  drive: { nom: 'GESTION LOCATIVE', parentId: 'racine', dossier: true },
  interdit: { nom: DOSSIER_INTERDIT_LECTURE, parentId: 'drive', dossier: true },
  n1: { nom: '1 actifs', parentId: 'interdit', dossier: true },
  n2: { nom: 'DUPONT', parentId: 'n1', dossier: true },
  aF: { nom: 'avis.pdf', parentId: 'n2', dossier: false },
  base: { nom: 'Base de données locative', parentId: 'drive', dossier: true },
  travaux: { nom: 'Travaux', parentId: 'base', dossier: true },
  bail: { nom: 'bail.pdf', parentId: 'travaux', dossier: false },
  piege: { nom: `${DOSSIER_INTERDIT_LECTURE}.pdf`, parentId: 'travaux', dossier: false },
};

const MIME_DOSSIER = 'application/vnd.google-apps.folder';

function chaineDepuis(depart: string): Maillon[] {
  const out: Maillon[] = [];
  let courant: string | null = depart;
  for (let i = 0; i < 32 && courant !== null; i += 1) {
    const n: { nom: string; parentId: string | null; dossier: boolean } | undefined = ARBRE[courant];
    if (n === undefined) break;
    out.push({ id: courant, nom: n.nom, parentId: n.parentId });
    courant = n.parentId;
  }
  return out;
}

const demande = (corps: unknown): Request =>
  new Request('http://local/api/admin/gestion/drive/corbeille', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  });

const jeter = (id: string) => POST(demande({ action: 'corbeille', elements: [{ id, nom: ARBRE[id]?.nom }] }));

beforeEach(() => {
  vi.clearAllMocks();
  oublierLeDrive();
  gardeMock.mockResolvedValue(null);
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'JETON', compteGoogle: 'a.jorel@sansvisavis.com' });
  journalDispoMock.mockResolvedValue(true);
  corbeilleDispoMock.mockResolvedValue(true);
  protegesMock.mockResolvedValue({
    proteges: new Set(['interdit']),
    protegesEtAncetres: new Set(['interdit', 'drive', 'racine']),
    maillons: chaineDepuis('interdit'),
  });
  chaineMock.mockImplementation(async (depart: string) => chaineDepuis(depart));
  metaMock.mockImplementation(async (id: string) => {
    const n = ARBRE[id];
    if (n === undefined) return { ok: false, motif: 'introuvable' };
    return {
      ok: true,
      valeur: { nom: n.nom, typeMime: n.dossier ? MIME_DOSSIER : 'application/pdf', parents: [n.parentId ?? ''] },
    };
  });
  basculerMock.mockResolvedValue({ ok: true, valeur: { id: 'x', nom: 'x', aLaCorbeille: true } });
  inscrireMock.mockResolvedValue(42);
  annulablesMock.mockResolvedValue([]);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE CAS ORDINAIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('un fichier ordinaire', () => {
  it('part à la corbeille, et la ligne de journal est écrite APRÈS Google', async () => {
    const r = await jeter('bail');
    const d = (await r.json()) as { etat: string; faits: unknown[]; refuses: unknown[]; mouvements: number[] };
    expect(d.etat).toBe('ok');
    expect(d.faits).toHaveLength(1);
    expect(d.refuses).toHaveLength(0);
    expect(basculerMock).toHaveBeenCalledWith('JETON', { id: 'bail', versLaCorbeille: true }, expect.anything());
    /**
     * 🔴 LE JOURNAL DIT QUI, QUOI, OÙ, QUAND (Arno). « Où » est le dossier d'ORIGINE — c'est lui qu'on cherchera,
     * et c'est lui que « Annuler » relira. `parentCible` est VIDE : une corbeille n'a pas de destination dans
     * l'arborescence, et écrire le parent des deux côtés aurait été un mensonge inscrit en base.
     */
    expect(inscrireMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'corbeille', driveId: 'bail', nom: 'bail.pdf',
      parentOrigine: 'travaux', parentCible: '', copieDriveId: null,
      auteurId: 7, auteurLibelle: 'a.jorel@sansvisavis.com',
    }));
    expect(d.mouvements).toEqual([42]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 LE TEST D'INTRUSION — « DOCUMENTS CLIENTS SCANNÉS »
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 « Documents clients scannés » est intouchable', () => {
  /** 🔴🔴 TROIS NIVEAUX PLUS BAS, ET SOUS UN NOM QUI NE DIT RIEN : le garde remonte, il ne lit pas le nom. */
  it('🔴🔴 un fichier d’archive est REFUSÉ, et rien n’est écrit', async () => {
    const r = await jeter('aF');
    const d = (await r.json()) as { etat: string; faits: unknown[]; refuses: { motif: string }[] };
    expect(d.etat).toBe('ok');
    expect(d.faits).toHaveLength(0);
    expect(d.refuses[0].motif).toContain(DOSSIER_INTERDIT_LECTURE);
    // 🔴 LA PREUVE QUI COMPTE : aucune écriture n'est partie chez Google, ni aucune ligne de journal.
    expect(basculerMock).not.toHaveBeenCalled();
    expect(inscrireMock).not.toHaveBeenCalled();
  });

  /** 🔴🔴 LE DOSSIER D'ARCHIVE LUI-MÊME, ET CHACUN DE SES ANCÊTRES. */
  it('🔴🔴 l’archive et ses ancêtres sont refusés', async () => {
    for (const id of ['interdit', 'drive']) {
      vi.clearAllMocks();
      beforeEachMocks();
      const r = await jeter(id);
      const d = (await r.json()) as { faits: unknown[]; refuses: unknown[] };
      expect(d.faits).toHaveLength(0);
      expect(d.refuses).toHaveLength(1);
      expect(basculerMock).not.toHaveBeenCalled();
    }
  });

  /**
   * 🔴🔴 ET LE NOM N'ACCUSE PAS NON PLUS. Un fichier nommé « Documents clients scannés.pdf » rangé dans un dossier
   * ordinaire est un fichier ordinaire. Un garde posé sur le nom l'aurait bloqué — et aurait laissé passer tous
   * les documents d'archive, qui ne s'appellent pas ainsi.
   */
  it('🔴🔴 un fichier qui PORTE le nom de l’archive, mais rangé ailleurs, passe', async () => {
    const r = await jeter('piege');
    const d = (await r.json()) as { faits: unknown[]; refuses: unknown[] };
    expect(d.faits).toHaveLength(1);
    expect(d.refuses).toHaveLength(0);
  });

  /** 🔴 ARCHIVE INTROUVABLE ⇒ ON NE TOUCHE À RIEN. Ne pas savoir où elle est, c'est ne pas pouvoir affirmer. */
  it('🔴 si l’archive ne peut pas être située, TOUT est refusé', async () => {
    protegesMock.mockResolvedValue(null);
    const r = await jeter('bail');
    expect(r.status).toBe(409);
    expect(basculerMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 JAMAIS UN DOSSIER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 un dossier ne se met jamais à la corbeille', () => {
  it('🔴🔴 même parfaitement ordinaire, et même demandé directement à la route', async () => {
    const r = await jeter('travaux');
    const d = (await r.json()) as { faits: unknown[]; refuses: { motif: string }[] };
    expect(d.faits).toHaveLength(0);
    expect(d.refuses[0].motif).toContain('DOSSIER');
    expect(basculerMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LES MIGRATIONS, ET LE RESTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('les garde-fous de base', () => {
  it('🔴 sans la migration 295, la route refuse — même appelée directement', async () => {
    corbeilleDispoMock.mockResolvedValue(false);
    const r = await jeter('bail');
    expect(r.status).toBe(409);
    expect(((await r.json()) as { message: string }).message).toContain('295');
    expect(basculerMock).not.toHaveBeenCalled();
  });

  it('🔴 sans le journal (274), la route refuse aussi', async () => {
    journalDispoMock.mockResolvedValue(false);
    const r = await jeter('bail');
    expect(r.status).toBe(409);
    expect(basculerMock).not.toHaveBeenCalled();
  });

  it('la sonde GET dit si le geste est possible', async () => {
    const ok = (await (await GET(new Request('http://local/x'))).json()) as { disponible: boolean };
    expect(ok.disponible).toBe(true);
    corbeilleDispoMock.mockResolvedValue(false);
    const non = (await (await GET(new Request('http://local/x'))).json()) as
      { disponible: boolean; motif: string };
    expect(non.disponible).toBe(false);
    expect(non.motif).toContain('295');
  });

  it('⚠️ une action inconnue est refusée', async () => {
    const r = await POST(demande({ action: 'detruire', elements: [{ id: 'bail' }] }));
    expect(r.status).toBe(422);
    expect(basculerMock).not.toHaveBeenCalled();
  });

  /** ⚠️ UN REFUS DE GOOGLE (droits insuffisants) SE DIT, et n'inscrit rien : le fichier n'a pas bougé. */
  it('⚠️ un refus de Google n’inscrit aucune ligne', async () => {
    basculerMock.mockResolvedValue({ ok: false, motif: 'Google refuse : droits insuffisants.' });
    const r = await jeter('bail');
    const d = (await r.json()) as { faits: unknown[]; refuses: { motif: string }[] };
    expect(d.faits).toHaveLength(0);
    expect(d.refuses[0].motif).toContain('droits insuffisants');
    expect(inscrireMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ ANNULER — LA RESTAURATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 « Annuler » restaure', () => {
  it('🔴 il relit le JOURNAL, sort le fichier de la corbeille et date la ligne annulée', async () => {
    annulablesMock.mockResolvedValue([
      { id: 42, action: 'corbeille', driveId: 'bail', nom: 'bail.pdf', parentOrigine: 'travaux', parentCible: '', copieDriveId: null },
    ]);
    const r = await POST(demande({ action: 'restaurer', mouvements: [42] }));
    const d = (await r.json()) as { etat: string; remis: string[] };
    expect(d.etat).toBe('ok');
    expect(d.remis).toEqual(['bail']);
    expect(basculerMock).toHaveBeenCalledWith('JETON', { id: 'bail', versLaCorbeille: false }, expect.anything());
    expect(inscrireMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'restaurer', driveId: 'bail' }));
    expect(marquerMock).toHaveBeenCalledWith(42);
  });

  /**
   * 🔴🔴 LA RESTAURATION REPASSE PAR LE MÊME VERDICT. Sans cela, « je l'y mets, je l'en sors » deviendrait une
   * porte de sortie de l'archive : il suffirait d'une ligne de journal forgée.
   */
  it('🔴🔴 une restauration vers l’archive est refusée', async () => {
    annulablesMock.mockResolvedValue([
      { id: 43, action: 'corbeille', driveId: 'aF', nom: 'avis.pdf', parentOrigine: 'n2', parentCible: '', copieDriveId: null },
    ]);
    const r = await POST(demande({ action: 'restaurer', mouvements: [43] }));
    const d = (await r.json()) as { remis: string[]; refuses: unknown[] };
    expect(d.remis).toHaveLength(0);
    expect(d.refuses).toHaveLength(1);
    expect(basculerMock).not.toHaveBeenCalled();
  });

  it('⚠️ une ligne déjà annulée n’est plus restaurable', async () => {
    annulablesMock.mockResolvedValue([]);
    const r = await POST(demande({ action: 'restaurer', mouvements: [42] }));
    expect(r.status).toBe(409);
    expect(basculerMock).not.toHaveBeenCalled();
  });
});

/** Les doubles sont reposés à l'identique au milieu d'une boucle qui a appelé `vi.clearAllMocks()`. */
function beforeEachMocks(): void {
  gardeMock.mockResolvedValue(null);
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'JETON', compteGoogle: 'a.jorel@sansvisavis.com' });
  journalDispoMock.mockResolvedValue(true);
  corbeilleDispoMock.mockResolvedValue(true);
  protegesMock.mockResolvedValue({
    proteges: new Set(['interdit']),
    protegesEtAncetres: new Set(['interdit', 'drive', 'racine']),
    maillons: chaineDepuis('interdit'),
  });
  chaineMock.mockImplementation(async (depart: string) => chaineDepuis(depart));
  metaMock.mockImplementation(async (id: string) => {
    const n = ARBRE[id];
    if (n === undefined) return { ok: false, motif: 'introuvable' };
    return {
      ok: true,
      valeur: { nom: n.nom, typeMime: n.dossier ? MIME_DOSSIER : 'application/pdf', parents: [n.parentId ?? ''] },
    };
  });
  inscrireMock.mockResolvedValue(42);
}
