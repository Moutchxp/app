import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOSSIER_INTERDIT_LECTURE, type Maillon } from '../../../../../../lib/gestion/driveLectureFichier';
import { oublierLeDrive } from '../../../../../../lib/gestion/driveMemoire';

/**
 * LOT DRIVE-DEPLACER — LA ROUTE QUI DÉPLACE, ET SURTOUT CELLE QUI REFUSE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CES TESTS TIENNENT, ET QUE L'ÉCRAN NE PEUT PAS TENIR : le serveur refuse MÊME APPELÉ DIRECTEMENT.
 *
 * L'écran n'offre pas le geste là où il sera refusé — c'est du confort, et un écran se modifie. Un vieil onglet, une
 * requête forgée, un `curl` arriveraient encore avec l'identifiant de l'archive dans le corps. Arno demande le refus
 * « par chaque voie : glisser, Cmd+X/V, clic droit, appel direct à la route » : les trois premières voies passent
 * TOUTES par cette route et par ce corps de requête — c'est donc ici, une fois, que la preuve se fait pour les
 * quatre.
 *
 * ⚠️ LA CHAÎNE DES PARENTS EST DOUBLÉE, JAMAIS LA RÈGLE : `peutMouvoir` — la vraie — est laissée intacte, et c'est
 * `chaineParents` et `idsProteges` qu'on simule. Doubler le verdict reviendrait à tester notre double.
 *
 * 🔴 ET LA PREUVE LA PLUS IMPORTANTE, À CHAQUE REFUS : `deplacerVers` N'A PAS ÉTÉ APPELÉ. Un refus qui se prononce
 * après l'écriture ne protège rien.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const gardeMock = vi.fn();
const jetonMock = vi.fn();
const journalDispoMock = vi.fn();
const protegesMock = vi.fn();
const chaineMock = vi.fn();
const metaMock = vi.fn();
const listerMock = vi.fn();
const deplacerMock = vi.fn();
const copierMock = vi.fn();
const creerCopieMock = vi.fn();
const inscrireMock = vi.fn();
const annulablesMock = vi.fn();
const marquerMock = vi.fn();
/**
 * 🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — LE REFLET EN BASE D'UN DÉPLACEMENT. Un déplacement met à jour les parents
 * de l'entrée EXISTANTE du registre et de l'index ; il n'en crée jamais une seconde. Les trois écritures sont
 * doublées pour être OBSERVÉES — jamais pour être supposées.
 */
const registreDeplaceMock = vi.fn();
const indexParentMock = vi.fn();
const indexVusMock = vi.fn();

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
}));
vi.mock('../../../../../../lib/gestion/driveVerdict', () => ({
  idsProteges: (...a: unknown[]) => protegesMock(...a),
}));
vi.mock('../../../../../../lib/gestion/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../lib/gestion/drive')>()),
  chaineParents: (_j: string, depart: string) => chaineMock(depart),
  lireMetadonnees: (_j: string, id: string) => metaMock(id),
  listerContenu: (_j: string, o: { parentId: string }) => listerMock(o.parentId),
}));
vi.mock('../../../../../../lib/gestion/driveMouvement', () => ({
  deplacerVers: (...a: unknown[]) => deplacerMock(...a),
  copierFichier: (...a: unknown[]) => copierMock(...a),
  creerDossierPourCopie: (...a: unknown[]) => creerCopieMock(...a),
}));
vi.mock('../../../../../../lib/gestion/driveMouvementRepo', () => ({
  inscrireMouvement: (...a: unknown[]) => inscrireMock(...a),
  mouvementsAnnulables: (...a: unknown[]) => annulablesMock(...a),
  marquerAnnule: (...a: unknown[]) => marquerMock(...a),
}));

vi.mock('../../../../../../lib/gestion/driveRepo', () => ({
  deplacerCopieAuRegistre: (...a: unknown[]) => registreDeplaceMock(...a),
}));
vi.mock('../../../../../../lib/gestion/empreinteDriveRepo', () => ({
  noterParentDeplace: (...a: unknown[]) => indexParentMock(...a),
  noterFichiersVus: (...a: unknown[]) => indexVusMock(...a),
}));

import { GET, POST } from './route';

/**
 * L'ARBORESCENCE D'ESSAI :
 *   (racine du Drive partagé)
 *   └── GESTION LOCATIVE (drive) ── Documents clients scannés (interdit) ── 1 actifs (n1) ── DUPONT (n2) ── avis (aF)
 *                                └─ Base de données locative (base) ── Travaux (travaux)
 *                                └─ bail.pdf (bail, dans base)
 *
 * ⚠️ « GESTION LOCATIVE » N'EST PAS LA RACINE ICI, ET C'EST EXPRÈS : c'est le seul moyen d'éprouver l'interdit ④.
 * Un élément à la racine d'un Drive est refusé plus tôt, pour une autre raison (il n'a pas de parent à quitter) —
 * et ce refus-là, qui tombe juste, masquerait celui qu'on veut prouver.
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
  bail: { nom: 'bail.pdf', parentId: 'base', dossier: false },
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
  new Request('http://local/api/admin/gestion/drive/deplacer', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  });

beforeEach(() => {
  vi.clearAllMocks();
  /**
   * 🔴 LA MÉMOIRE COURTE DU DRIVE EST VIDÉE ENTRE DEUX TESTS, et c'est indispensable : elle vit au niveau du
   * module, donc elle survit d'un test à l'autre. Un test qui hériterait de la chaîne mémorisée par le précédent
   * ne prouverait plus rien de ce qu'il croit prouver — et surtout, il masquerait une régression de sécurité.
   */
  oublierLeDrive();
  gardeMock.mockResolvedValue(null);
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'JETON', compteGoogle: 'a.jorel@sansvisavis.com' });
  journalDispoMock.mockResolvedValue(true);
  // 🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — le reflet rend « rien n'a changé » par défaut : les épreuves qui s'y
  //   intéressent l'observent, les autres ne doivent pas en dépendre.
  registreDeplaceMock.mockResolvedValue(0);
  indexParentMock.mockResolvedValue(0);
  indexVusMock.mockResolvedValue(0);
  protegesMock.mockResolvedValue({
    proteges: new Set(['interdit']),
    protegesEtAncetres: new Set(['interdit', 'drive', 'racine']),
    maillons: chaineDepuis('interdit'),
  });
  chaineMock.mockImplementation(async (depart: string) => chaineDepuis(depart));
  /**
   * ⚠️ LES MÉTADONNÉES PORTENT DÉSORMAIS `parents`, ET CE N'EST PAS UN DÉTAIL DE FIXTURE (lot DRIVE-DEPLACER-RAPIDE).
   * La route lisait le parent d'un élément en remontant SA chaîne — un appel Google de plus par élément, alors que
   * le `files.get` qu'elle faisait juste après le donnait déjà. Elle le lit maintenant là où il était.
   */
  metaMock.mockImplementation(async (id: string) => (ARBRE[id] === undefined
    ? { ok: false, motif: 'introuvable' }
    : {
      ok: true,
      valeur: {
        id, nom: ARBRE[id].nom, typeMime: ARBRE[id].dossier ? MIME_DOSSIER : 'application/pdf',
        parents: ARBRE[id].parentId === null ? [] : [ARBRE[id].parentId as string],
      },
    }));
  listerMock.mockResolvedValue({ ok: true, valeur: { fichiers: [], tronque: false } });
  deplacerMock.mockResolvedValue({ ok: true, valeur: { id: 'bail', nom: 'bail.pdf', parentId: 'travaux' } });
  copierMock.mockResolvedValue({ ok: true, valeur: { id: 'copie', nom: 'bail.pdf', parentId: 'travaux' } });
  creerCopieMock.mockResolvedValue({ ok: true, valeur: { id: 'copieDossier', nom: 'Travaux', parentId: 'base' } });
  inscrireMock.mockResolvedValue(101);
  annulablesMock.mockResolvedValue([]);
  marquerMock.mockResolvedValue(undefined);
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LES QUATRE INTERDITS, PAR APPEL DIRECT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 « Documents clients scannés » — appel DIRECT à la route', () => {
  for (const action of ['deplacer', 'copier'] as const) {
    it.each([
      ['l’archive elle-même', 'interdit'],
      ['profondeur 1', 'n1'],
      ['profondeur 2', 'n2'],
    ])(`① ${action} VERS %s : refusé, et rien n’est parti chez Google`, async (_mot, cible) => {
      const res = await POST(demande({ action, cible, elements: [{ id: 'bail', nom: 'bail.pdf' }] }));
      const d = (await res.json()) as { etat: string; faits: unknown[]; refuses: { motif: string }[] };

      expect(d.faits).toHaveLength(0);
      expect(d.refuses[0].motif).toContain(DOSSIER_INTERDIT_LECTURE);
      expect(deplacerMock).not.toHaveBeenCalled();
      expect(copierMock).not.toHaveBeenCalled();
      expect(inscrireMock).not.toHaveBeenCalled();
    });

    it.each([
      ['un sous-dossier', 'n1'],
      ['un sous-sous-dossier', 'n2'],
      ['un fichier de l’archive', 'aF'],
    ])(`② ${action} DEPUIS %s : refusé`, async (_mot, source) => {
      const res = await POST(demande({ action, cible: 'travaux', elements: [{ id: source }] }));
      const d = (await res.json()) as { faits: unknown[]; refuses: { motif: string }[] };

      expect(d.faits).toHaveLength(0);
      expect(d.refuses[0].motif).toContain('Rien n’en sort');
      expect(deplacerMock).not.toHaveBeenCalled();
      expect(copierMock).not.toHaveBeenCalled();
    });

    it(`③ ${action} l’archive ELLE-MÊME : refusé`, async () => {
      const res = await POST(demande({ action, cible: 'base', elements: [{ id: 'interdit' }] }));
      const d = (await res.json()) as { refuses: { motif: string }[] };
      expect(d.refuses[0].motif).toContain('ne se déplace pas');
      expect(deplacerMock).not.toHaveBeenCalled();
    });

    /** 🔴🔴 L'INTERDIT ④ : déplacer « GESTION LOCATIVE » emporterait l'archive avec lui. */
    it(`④ ${action} un ANCÊTRE de l’archive : refusé`, async () => {
      const res = await POST(demande({ action, cible: 'travaux', elements: [{ id: 'drive' }] }));
      const d = (await res.json()) as { refuses: { motif: string }[] };
      expect(d.refuses[0].motif).toContain('emporterait l’archive');
      expect(deplacerMock).not.toHaveBeenCalled();
    });
  }

  /**
   * 🔴 NE PAS SAVOIR OÙ EST L'ARCHIVE VAUT INTERDIT POUR TOUT LE MONDE. Si Google ne répond pas à la recherche du
   * dossier protégé, on ne peut affirmer d'AUCUN déplacement qu'il ne la touche pas : on refuse EN BLOC.
   */
  it('archive non localisée : la route refuse TOUT, même un déplacement anodin', async () => {
    protegesMock.mockResolvedValue(null);
    const res = await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(res.status).toBe(409);
    const d = (await res.json()) as { etat: string; message: string };
    expect(d.etat).toBe('refus');
    expect(d.message).toContain('Documents clients scannés');
    expect(deplacerMock).not.toHaveBeenCalled();
  });

  it('une sélection MÊLÉE : l’élément permis passe, l’élément interdit est refusé avec son motif', async () => {
    const res = await POST(demande({
      action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }, { id: 'aF' }],
    }));
    const d = (await res.json()) as { faits: { id: string }[]; refuses: { id: string }[] };
    expect(d.faits.map((f) => f.id)).toEqual(['bail']);
    expect(d.refuses.map((r) => r.id)).toEqual(['aF']);
    expect(deplacerMock).toHaveBeenCalledTimes(1);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-DEPLACER-RAPIDE — LA MÉMOIRE COURTE NE DISPENSE D'AUCUNE VÉRIFICATION
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Le lot a rendu le geste rapide en cessant de REDEMANDER à Google des chaînes de parents qu'il venait de donner.
   C'est exactement le genre d'optimisation qui ouvre un trou : un cache qui répond « oui » à la place du serveur.
   Ces tests-là existent pour qu'elle ne puisse pas le faire. ══════════════════════════════════════════════════ */

describe('🔴🔴 le cache ne peut PAS faire passer une cible interdite', () => {
  /**
   * 🔴 LE CAS QUI COMPTE : la chaîne de la cible est DÉJÀ en mémoire quand la demande arrive — c'est la situation
   * normale, la liste vient de l'afficher. Le verdict doit tomber quand même, et il doit tomber sur la chaîne
   * mémorisée, pas être sauté parce qu'« on connaît déjà cet endroit ».
   */
  it('cible sous l’archive DÉJÀ mémorisée : refusé quand même, et rien ne part', async () => {
    // ① Un premier appel, permis, qui fait entrer « n2 » dans la mémoire courte (c'est une cible qu'on remonte).
    await POST(demande({ action: 'deplacer', cible: 'n2', elements: [{ id: 'bail' }] }));
    expect(deplacerMock).not.toHaveBeenCalled();
    const remonteesApres1 = chaineMock.mock.calls.length;

    // ② Le MÊME appel, maintenant que la chaîne est en cache : le refus doit être identique.
    const res = await POST(demande({ action: 'deplacer', cible: 'n2', elements: [{ id: 'bail' }] }));
    const d = (await res.json()) as { faits: unknown[]; refuses: { motif: string }[] };
    expect(d.faits).toHaveLength(0);
    expect(d.refuses[0].motif).toContain(DOSSIER_INTERDIT_LECTURE);
    expect(deplacerMock).not.toHaveBeenCalled();

    // 🔴 ET LA PREUVE QUE LA MÉMOIRE A BIEN SERVI : le second appel n'a PAS redemandé la chaîne à Google.
    //    Le refus vient donc du cache, et il est aussi ferme que le premier.
    expect(chaineMock.mock.calls.length).toBe(remonteesApres1);
  });

  /**
   * 🔴 ET DANS L'AUTRE SENS : une SOURCE dans l'archive, dont la chaîne du parent est déjà mémorisée parce qu'un
   * voisin vient d'être examiné. Rien n'en sort, cache ou pas.
   */
  it('source dans l’archive avec le parent DÉJÀ mémorisé : refusé quand même', async () => {
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'aF' }] }));
    const remontees = chaineMock.mock.calls.length;
    const res = await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'aF' }] }));
    const d = (await res.json()) as { refuses: { motif: string }[] };
    expect(d.refuses[0].motif).toContain('Rien n’en sort');
    expect(deplacerMock).not.toHaveBeenCalled();
    expect(chaineMock.mock.calls.length).toBe(remontees);
  });

  /**
   * ⚠️ LA MÉMOIRE NE DURE QU'UNE MINUTE, et c'est une propriété de SÉCURITÉ, pas de confort : un rangement fait
   * entre-temps (un dossier déplacé SOUS l'archive) doit être vu. Ici, on vide la mémoire pour rejouer le monde
   * d'après — et la réponse change, ce qui prouve que la mémoire n'est pas une vérité figée.
   */
  it('la mémoire oubliée, la chaîne est redemandée à Google', async () => {
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    const remontees = chaineMock.mock.calls.length;
    oublierLeDrive();
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(chaineMock.mock.calls.length).toBeGreaterThan(remontees);
  });

  /**
   * 🔴 UNE CHAÎNE QU'ON N'A PAS SU REMONTER N'EST JAMAIS MÉMORISÉE — sans quoi un « je ne sais pas » deviendrait
   * un « oui » une minute durant. Elle est redemandée à chaque fois, et elle refuse à chaque fois.
   */
  it('une chaîne incomplète n’est pas mémorisée, et refuse à chaque appel', async () => {
    chaineMock.mockResolvedValue([]);
    for (const tour of [1, 2]) {
      const res = await POST(demande({ action: 'deplacer', cible: 'inconnu', elements: [{ id: 'bail' }] }));
      const d = (await res.json()) as { faits: unknown[]; refuses: { motif: string }[] };
      expect(d.faits, `tour ${tour}`).toHaveLength(0);
      expect(d.refuses[0].motif).toContain('précaution');
    }
    expect(deplacerMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-RETOUCHES-2 — LA MÉMOIRE OUBLIE CE QU'ON VIENT DE CHANGER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   Défaut vu sur le VRAI Drive le 29/09/2026 : la mémoire courte retient le parent d'un élément 60 s. Après un
   déplacement, elle continuait d'affirmer l'ANCIEN parent. Le même appel était refusé à 10 s — « Cet élément est
   déjà dans ce dossier » — et accepté à 70 s, sans que rien n'ait changé ailleurs.

   🔴 ET LE RISQUE N'ÉTAIT PAS QUE LE REFUS : avec un parent périmé, `removeParents` serait parti faux. Or c'est
   le piège même de l'API Drive — sans le BON `removeParents`, `files.update` AJOUTE un parent au lieu de
   déplacer : le fichier se retrouve dans deux dossiers, et l'on croit l'avoir déplacé. ═════════════════════ */

describe('🔴🔴 la mémoire courte n’affirme pas un parent périmé', () => {
  it('🔴🔴 deux déplacements de suite : le second lit le VRAI parent, pas celui d’avant', async () => {
    // ① On déplace « bail » (dans « base ») vers « travaux ».
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(deplacerMock).toHaveBeenCalledWith(
      'JETON', { id: 'bail', parentOrigine: 'base', parentCible: 'travaux' }, expect.anything());

    // ② Le monde a changé : « bail » est maintenant dans « travaux ».
    metaMock.mockImplementation(async (id: string) => (id === 'bail'
      ? { ok: true, valeur: { id, nom: 'bail.pdf', typeMime: 'application/pdf', parents: ['travaux'] } }
      : (ARBRE[id] === undefined
        ? { ok: false, motif: 'introuvable' }
        : {
          ok: true,
          valeur: {
            id, nom: ARBRE[id].nom, typeMime: ARBRE[id].dossier ? MIME_DOSSIER : 'application/pdf',
            parents: ARBRE[id].parentId === null ? [] : [ARBRE[id].parentId as string],
          },
        })));
    deplacerMock.mockClear();

    // ③ On le renvoie dans « base » : le parent lu doit être « travaux », pas « base ».
    const res = await POST(demande({ action: 'deplacer', cible: 'base', elements: [{ id: 'bail' }] }));
    const d = (await res.json()) as { faits: unknown[]; refuses: { motif: string }[] };
    expect(d.refuses).toHaveLength(0);
    expect(d.faits).toHaveLength(1);
    expect(deplacerMock).toHaveBeenCalledWith(
      'JETON', { id: 'bail', parentOrigine: 'travaux', parentCible: 'base' }, expect.anything());
  });

  /** ⚠️ ON OUBLIE MÊME QUAND GOOGLE REFUSE : on ne sait pas toujours ce qu'il a fait avant de refuser. */
  it('un déplacement refusé par Google périme quand même ce qu’on savait', async () => {
    deplacerMock.mockResolvedValue({ ok: false, motif: 'Google a refusé' });
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    metaMock.mockClear();
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    // Les métadonnées ont été REDEMANDÉES : rien n'a été cru sur parole.
    expect(metaMock).toHaveBeenCalledWith('bail');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 LOT DRIVE-DEPLACER-RAPIDE — CE QUE LA PARALLÉLISATION NE DOIT PAS CHANGER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 une sélection multiple : un seul contrôle par dossier, un verdict par élément', () => {
  it('cinq fichiers du MÊME dossier ne remontent la chaîne du parent qu’UNE fois', async () => {
    const cinq = ['bail', 'bail', 'bail', 'bail', 'bail'].map((id) => ({ id }));
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: cinq }));
    // Deux remontées au total : celle de la cible, celle du parent commun. Pas cinq.
    const departs = chaineMock.mock.calls.map((c) => c[0] as string);
    expect(new Set(departs)).toEqual(new Set(['travaux', 'base']));
  });

  /** 🔴 ET CHAQUE ÉLÉMENT GARDE SON VERDICT : un lot mêlé rend autant de réponses que d'éléments. */
  it('un lot mêlé rend un résultat par élément, réussi ou refusé avec son motif', async () => {
    const res = await POST(demande({
      action: 'deplacer', cible: 'travaux',
      elements: [{ id: 'bail' }, { id: 'aF' }, { id: 'interdit' }, { id: 'fantome' }],
    }));
    const d = (await res.json()) as { faits: { id: string }[]; refuses: { id: string; motif: string }[] };
    expect(d.faits.map((f) => f.id)).toEqual(['bail']);
    expect(d.refuses.map((r) => r.id).sort()).toEqual(['aF', 'fantome', 'interdit']);
    // Chaque refus porte SON motif, pas un motif commun.
    expect(new Set(d.refuses.map((r) => r.motif)).size).toBe(3);
    expect(deplacerMock).toHaveBeenCalledTimes(1);
  });

  it('la réponse porte les temps et le nombre d’appels Google réellement partis', async () => {
    const res = await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    const d = (await res.json()) as { temps?: { total?: number; appelsGoogle?: number; securite?: number } };
    expect(typeof d.temps?.total).toBe('number');
    expect(typeof d.temps?.securite).toBe('number');
    expect(typeof d.temps?.appelsGoogle).toBe('number');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE JOURNAL EST OBLIGATOIRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 sans la migration 274, la route refuse tout', () => {
  it('le POST est refusé, avec son motif, et rien ne part chez Google', async () => {
    journalDispoMock.mockResolvedValue(false);
    const res = await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(res.status).toBe(409);
    const d = (await res.json()) as { message: string };
    expect(d.message).toContain('274');
    expect(deplacerMock).not.toHaveBeenCalled();
  });

  it('la sonde GET le DIT, pour que l’écran éteigne le geste au lieu de le laisser échouer', async () => {
    journalDispoMock.mockResolvedValue(false);
    const res = await GET(new Request('http://local/api/admin/gestion/drive/deplacer'));
    const d = (await res.json()) as { etat: string; disponible: boolean; motif: string };
    expect(d.etat).toBe('ok');
    expect(d.disponible).toBe(false);
    expect(d.motif).toContain('274');
  });

  it('avec la migration, la sonde dit oui', async () => {
    const res = await GET(new Request('http://local/api/admin/gestion/drive/deplacer'));
    const d = (await res.json()) as { disponible: boolean; motif: string | null };
    expect(d.disponible).toBe(true);
    expect(d.motif).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LE DÉPLACEMENT ORDINAIRE, LA COPIE, LE DOUBLON
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('le geste ordinaire', () => {
  it('déplace, consigne, et rend de quoi annuler', async () => {
    const res = await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    const d = (await res.json()) as { etat: string; faits: unknown[]; mouvements: number[]; nomCible: string };

    expect(d.etat).toBe('ok');
    expect(d.faits).toHaveLength(1);
    expect(d.nomCible).toBe('Travaux');
    expect(d.mouvements).toEqual([101]);
    // 🔴 LE PARENT D'ORIGINE EST CONSIGNÉ : c'est lui, et lui seul, que relira « Annuler ».
    expect(inscrireMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'deplacer', driveId: 'bail', parentOrigine: 'base', parentCible: 'travaux', copieDriveId: null,
    }));
  });

  /**
   * 🔴 L'ORDRE EST DÉLIBÉRÉ : on déplace CHEZ GOOGLE, puis on inscrit. L'inverse laisserait, en cas de panne entre
   * les deux, un journal qui affirme un déplacement qui n'a pas eu lieu — et « Annuler » irait chercher un fichier
   * là où il n'a jamais été.
   */
  it('l’écriture Drive précède l’inscription au journal', async () => {
    const ordre: string[] = [];
    deplacerMock.mockImplementation(async () => {
      ordre.push('drive');
      return { ok: true, valeur: { id: 'bail', nom: 'bail.pdf', parentId: 'travaux' } };
    });
    inscrireMock.mockImplementation(async () => { ordre.push('journal'); return 101; });
    await POST(demande({ action: 'deplacer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(ordre).toEqual(['drive', 'journal']);
  });

  /**
   * 🔴 LE DOUBLON : Google Drive conserve les DEUX, et c'est ce qu'Arno a demandé. La preuve tient à ce que la
   * copie n'impose PAS de nom — imposer un nom serait techniquement un renommage, et écraser serait une perte.
   */
  it('une copie n’impose aucun nom : les doublons sont conservés tous les deux', async () => {
    await POST(demande({ action: 'copier', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(copierMock).toHaveBeenCalledWith('JETON', { id: 'bail', parentCible: 'travaux' }, expect.anything());
    expect(inscrireMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'copier', copieDriveId: 'copie',
    }));
  });

  it('un déplacement vers le dossier où l’on est déjà est refusé, et le dit', async () => {
    const res = await POST(demande({ action: 'deplacer', cible: 'base', elements: [{ id: 'bail' }] }));
    const d = (await res.json()) as { refuses: { motif: string }[] };
    expect(d.refuses[0].motif).toContain('déjà dans ce dossier');
    expect(deplacerMock).not.toHaveBeenCalled();
  });

  it('une action inconnue est refusée — « supprimer » n’existe pas', async () => {
    const res = await POST(demande({ action: 'supprimer', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(res.status).toBe(422);
    expect(deplacerMock).not.toHaveBeenCalled();
    expect(copierMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   LA COPIE RÉCURSIVE, BORNÉE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('la copie récursive d’un dossier', () => {
  /** Un dossier de `n` fichiers plats, pour éprouver la borne. */
  function dossierDe(n: number): {
    ok: true; valeur: { tronque: boolean; fichiers: { id: string; nom: string; dossier: boolean; typeMime: string }[] };
  } {
    return {
      ok: true,
      valeur: {
        tronque: false,
        fichiers: Array.from({ length: n }, (_, i) => ({
          id: `f${i}`, nom: `p${i}.pdf`, dossier: false, typeMime: 'application/pdf',
        })),
      },
    };
  }

  it('compte AVANT de copier, et annonce le nombre réel', async () => {
    listerMock.mockImplementation(async (parent: string) => (parent === 'travaux' ? dossierDe(12) : dossierDe(0)));
    const res = await POST(demande({ action: 'compter', elements: [{ id: 'travaux', nom: 'Travaux' }] }));
    const d = (await res.json()) as { possible: boolean; elements: number; phrase: string };
    expect(d.possible).toBe(true);
    expect(d.elements).toBe(12);
    expect(d.phrase).toContain('12 éléments');
    // ⚠️ COMPTER N'ÉCRIT RIEN : c'est une lecture de métadonnées, et rien d'autre.
    expect(creerCopieMock).not.toHaveBeenCalled();
    expect(copierMock).not.toHaveBeenCalled();
  });

  it('🔴 au-delà de la borne : refusé EN BLOC, et aucun dossier d’accueil n’est créé', async () => {
    listerMock.mockImplementation(async (parent: string) => (parent === 'travaux' ? dossierDe(201) : dossierDe(0)));
    const res = await POST(demande({ action: 'copier', cible: 'base', elements: [{ id: 'travaux' }] }));
    const d = (await res.json()) as { faits: unknown[]; refuses: { motif: string }[] };
    expect(d.faits).toHaveLength(0);
    expect(d.refuses[0].motif).toContain('200');
    expect(creerCopieMock).not.toHaveBeenCalled();
    expect(copierMock).not.toHaveBeenCalled();
  });

  it('une liste TRONQUÉE refuse la copie : on ne copie pas ce qu’on n’a pas su lire en entier', async () => {
    listerMock.mockResolvedValue({ ok: true, valeur: { fichiers: [], tronque: true } });
    const res = await POST(demande({ action: 'copier', cible: 'base', elements: [{ id: 'travaux' }] }));
    const d = (await res.json()) as { refuses: { motif: string }[] };
    expect(d.refuses[0].motif).toContain('en entier');
    expect(creerCopieMock).not.toHaveBeenCalled();
  });

  it('sous la borne : le dossier d’accueil est créé, puis le contenu est copié', async () => {
    listerMock.mockImplementation(async (parent: string) => (parent === 'travaux' ? dossierDe(3) : dossierDe(0)));
    const res = await POST(demande({ action: 'copier', cible: 'base', elements: [{ id: 'travaux' }] }));
    const d = (await res.json()) as { faits: unknown[] };
    expect(d.faits).toHaveLength(1);
    expect(creerCopieMock).toHaveBeenCalledTimes(1);
    expect(copierMock).toHaveBeenCalledTimes(3);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ANNULER
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 « Annuler »', () => {
  const LIGNE = {
    id: 101, action: 'deplacer' as const, driveId: 'bail', nom: 'bail.pdf',
    parentOrigine: 'base', parentCible: 'travaux', copieDriveId: null,
  };

  /**
   * ⚠️ L'ÉTAT DU DRIVE AU MOMENT DE L'ANNULATION : le bail a DÉJÀ été déplacé, il est donc dans « Travaux ». Le
   * journal, lui, se rappelle qu'il venait de « Base de données locative ». C'est cet écart que « Annuler » répare.
   */
  beforeEach(() => {
    chaineMock.mockImplementation(async (depart: string) => (depart === 'bail'
      ? [{ id: 'bail', nom: 'bail.pdf', parentId: 'travaux' }, ...chaineDepuis('travaux')]
      : chaineDepuis(depart)));
  });

  /**
   * 🔴 LE RETOUR SE LIT DANS LE JOURNAL, jamais dans ce que l'écran affirme. Un écran se recharge, se trompe, se
   * remplace ; une ligne de journal, non.
   */
  it('remet l’élément dans le parent CONSIGNÉ, et non dans celui que l’appel propose', async () => {
    annulablesMock.mockResolvedValue([LIGNE]);
    // L'appel ne porte QUE des numéros de ligne : il n'y a même pas de place pour une destination inventée.
    await POST(demande({ action: 'annuler', mouvements: [101] }));
    expect(deplacerMock).toHaveBeenCalledWith(
      'JETON', { id: 'bail', parentOrigine: 'travaux', parentCible: 'base' }, expect.anything(),
    );
  });

  it('le retour écrit une NOUVELLE ligne et date l’ancienne — rien n’est effacé', async () => {
    annulablesMock.mockResolvedValue([LIGNE]);
    await POST(demande({ action: 'annuler', mouvements: [101] }));
    expect(inscrireMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'deplacer', driveId: 'bail', parentOrigine: 'travaux', parentCible: 'base',
    }));
    expect(marquerMock).toHaveBeenCalledWith(101);
  });

  /** 🔴 LE RETOUR PASSE PAR LE MÊME VERDICT : remettre un élément à sa place n'a droit à aucun régime de faveur. */
  it('un retour VERS l’archive serait refusé comme n’importe quel déplacement', async () => {
    annulablesMock.mockResolvedValue([{ ...LIGNE, parentOrigine: 'n1', parentCible: 'travaux' }]);
    const res = await POST(demande({ action: 'annuler', mouvements: [101] }));
    const d = (await res.json()) as { refuses: { motif: string }[] };
    expect(d.refuses[0].motif).toContain(DOSSIER_INTERDIT_LECTURE);
    expect(deplacerMock).not.toHaveBeenCalled();
    expect(marquerMock).not.toHaveBeenCalled();
  });

  /** ⚠️ UNE COPIE NE S'ANNULE PAS : l'annuler voudrait dire la SUPPRIMER, et l'application ne supprime rien. */
  it('une copie n’est jamais annulable : le repo n’en rend aucune', async () => {
    annulablesMock.mockResolvedValue([]);
    const res = await POST(demande({ action: 'annuler', mouvements: [102] }));
    expect(res.status).toBe(409);
    expect(deplacerMock).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   🔴🔴 LOT DRIVE-NIVEAUX-DEPLACEMENT — UN DÉPLACEMENT SUIT L'ENTRÉE, IL N'EN CRÉE PAS UNE SECONDE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════

   RÈGLE D'ARNO (03/10/2026) : « un DÉPLACEMENT (glisser, “Déposer ici” d'un fichier déjà dans le Drive,
   annulation) met à jour les parents de l'entrée existante du registre et de l'index. Il ne crée jamais une
   seconde entrée. Après un déplacement, un seul emplacement connu : le dernier. Seule une COPIE réelle
   (rangement d'une pièce jointe ou d'une vignette dupliquée) ajoute un emplacement. »

   🔴 LE DÉFAUT MESURÉ : Arno a déplacé « test gigout.pdf » dans la fenêtre Drive ; `files.update` a bien déplacé
   le fichier, et la ligne 26554 du registre a gardé `drive_dossier_id = 1dCY-…` (« Test creation dossier
   drive ») alors que `files.get` rend `1EsD2E_…` (« _MESURE nom immediat »). Le picto du mail annonçait donc un
   chemin FAUX, et ouvrait la fenêtre sur un dossier où le document n'est plus.
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 le reflet d’un déplacement', () => {
  const deplacer = (cible = 'travaux', id = 'bail') =>
    POST(demande({ action: 'deplacer', cible, elements: [{ id }] }));

  it('🔴🔴 le registre et l’index suivent le fichier, vers la CIBLE', async () => {
    const r = await deplacer();
    expect(r.status).toBe(200);
    expect(deplacerMock).toHaveBeenCalled();
    // 🔴 LE PARENT ÉCRIT EST LA CIBLE, et le NOM du dossier voyage avec — sinon le menu dirait un identifiant.
    expect(registreDeplaceMock).toHaveBeenCalledWith('bail', 'travaux', 'Travaux');
    expect(indexParentMock).toHaveBeenCalledWith('bail', 'travaux');
  });

  /**
   * 🔴🔴 LA PREUVE EN NÉGATIF, ET C'EST ELLE QUI PORTE LA RÈGLE : un déplacement n'INSCRIT RIEN de neuf. Ni au
   * registre (pas de second dépôt), ni à l'index (pas de second fichier). Il MET À JOUR, et c'est tout.
   */
  it('🔴🔴 un déplacement n’ajoute AUCUNE entrée', async () => {
    await deplacer();
    expect(indexVusMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 UNE COPIE, ELLE, AJOUTE UN EMPLACEMENT — et la copie neuve entre dans l'index TOUT DE SUITE. C'est la
   * moitié qui manquait au lot PASTILLE-DRIVE-EN-DIRECT : le dépôt d'une PIÈCE indexait sa copie, la copie d'une
   * VIGNETTE DUPLIQUÉE (qui passe par cette route) attendait l'agent `changes.list` — 12 min 37 s mesurées.
   */
  it('🔴🔴 une COPIE indexe le fichier neuf, et ne déplace aucune entrée', async () => {
    copierMock.mockResolvedValue({
      ok: true,
      valeur: {
        id: 'copie', nom: 'bail.pdf', parentId: 'travaux', lien: null,
        md5: 'abc', tailleOctets: 4096, typeMime: 'application/pdf',
        modifieLe: '2026-10-03T20:00:00Z', driveId: 'DRV',
      },
    });
    await POST(demande({ action: 'copier', cible: 'travaux', elements: [{ id: 'bail' }] }));
    expect(indexVusMock).toHaveBeenCalledWith([expect.objectContaining({
      driveFileId: 'copie', md5: 'abc', parentId: 'travaux', estDossier: false, tailleOctets: 4096,
    })]);
    // 🔴 ET SURTOUT : l'ORIGINAL n'a pas bougé, donc aucun reflet de déplacement.
    expect(registreDeplaceMock).not.toHaveBeenCalled();
    expect(indexParentMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 L'ANNULATION EST UN DÉPLACEMENT : même reflet, vers le parent d'ORIGINE. Arno l'a nommée. Sans cela,
   * défaire un déplacement laisserait le registre sur la destination qu'on vient d'abandonner.
   */
  it('🔴🔴 une annulation remet le registre sur le parent d’ORIGINE', async () => {
    /* ⚠️ L'ÉTAT DU DRIVE AU MOMENT DE L'ANNULATION : le bail a DÉJÀ été déplacé, il est donc dans « Travaux ».
       Le journal, lui, se rappelle qu'il venait de « Base de données locative » — c'est cet écart qu'on répare. */
    chaineMock.mockImplementation(async (depart: string) => (depart === 'bail'
      ? [{ id: 'bail', nom: 'bail.pdf', parentId: 'travaux' }, ...chaineDepuis('travaux')]
      : chaineDepuis(depart)));
    annulablesMock.mockResolvedValue([
      { id: 9, action: 'deplacer', driveId: 'bail', nom: 'bail.pdf', parentOrigine: 'base', parentCible: 'travaux', copieDriveId: null },
    ]);
    const r = await POST(demande({ action: 'annuler', mouvements: [9] }));
    expect(r.status).toBe(200);
    expect(registreDeplaceMock).toHaveBeenCalledWith('bail', 'base', 'Base de données locative');
    expect(indexParentMock).toHaveBeenCalledWith('bail', 'base');
  });

  /**
   * ⚠️ UN DOSSIER DÉPLACÉ NE TOUCHE PAS LE REGISTRE DES PIÈCES, et c'est exact : ce registre indexe des FICHIERS
   * déposés, pas des dossiers, et le parent IMMÉDIAT de ses lignes n'a pas changé. L'index, lui, porte aussi les
   * dossiers : son parent à lui suit.
   */
  it('⚠️ déplacer un DOSSIER ne touche pas le registre des pièces, mais bien l’index', async () => {
    deplacerMock.mockResolvedValue({ ok: true, valeur: { id: 'travaux', nom: 'Travaux', parentId: 'drive' } });
    // « Travaux » (sous « Base de données locative ») remonte d'un cran, dans « GESTION LOCATIVE ».
    const r = await POST(demande({ action: 'deplacer', cible: 'drive', elements: [{ id: 'travaux' }] }));
    const d = (await r.json()) as { faits: unknown[] };
    expect(d.faits).toHaveLength(1);
    expect(registreDeplaceMock).not.toHaveBeenCalled();
    expect(indexParentMock).toHaveBeenCalledWith('travaux', 'drive');
  });

  /**
   * ⚠️ AU MIEUX-EFFORT : UNE BASE MUETTE NE FAIT PAS ÉCHOUER LE GESTE. Le fichier EST déplacé chez Google —
   * refuser le geste parce qu'on n'a pas su mettre notre reflet à jour laisserait un fichier déplacé ET une route
   * en échec, c'est-à-dire la pire des deux situations.
   */
  it('⚠️ une base muette ne fait pas échouer le déplacement', async () => {
    const erreur = vi.spyOn(console, 'error').mockImplementation(() => {});
    registreDeplaceMock.mockRejectedValue(new Error('base indisponible'));
    const r = await deplacer();
    expect(r.status).toBe(200);
    const d = (await r.json()) as { faits: unknown[] };
    expect(d.faits).toHaveLength(1);
    erreur.mockRestore();
  });

  /** 🔴 ET UN DÉPLACEMENT REFUSÉ N'ÉCRIT RIEN : le fichier n'a pas bougé, son parent non plus. */
  it('🔴 un déplacement REFUSÉ ne touche ni le registre ni l’index', async () => {
    const r = await POST(demande({ action: 'deplacer', cible: 'n2', elements: [{ id: 'bail' }] }));
    const d = (await r.json()) as { faits?: unknown[]; refuses?: unknown[]; message?: string };
    expect((d.faits ?? []).length + 0).toBe(0);
    expect(deplacerMock).not.toHaveBeenCalled();
    expect(registreDeplaceMock).not.toHaveBeenCalled();
    expect(indexParentMock).not.toHaveBeenCalled();
  });
});
