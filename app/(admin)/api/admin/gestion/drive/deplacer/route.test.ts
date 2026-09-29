import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOSSIER_INTERDIT_LECTURE, type Maillon } from '../../../../../../lib/gestion/driveLectureFichier';

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
  gardeMock.mockResolvedValue(null);
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'JETON', compteGoogle: 'a.jorel@sansvisavis.com' });
  journalDispoMock.mockResolvedValue(true);
  protegesMock.mockResolvedValue({
    proteges: new Set(['interdit']),
    protegesEtAncetres: new Set(['interdit', 'drive', 'racine']),
    maillons: chaineDepuis('interdit'),
  });
  chaineMock.mockImplementation(async (depart: string) => chaineDepuis(depart));
  metaMock.mockImplementation(async (id: string) => (ARBRE[id] === undefined
    ? { ok: false, motif: 'introuvable' }
    : { ok: true, valeur: { id, nom: ARBRE[id].nom, typeMime: ARBRE[id].dossier ? MIME_DOSSIER : 'application/pdf' } }));
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
