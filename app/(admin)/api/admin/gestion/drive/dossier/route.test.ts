import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MIME_DOSSIER, type DossierDetail } from '../../../../../../lib/gestion/drive';
import { DOSSIER_INTERDIT_LECTURE } from '../../../../../../lib/gestion/driveLectureFichier';

/**
 * LOT DRIVE-VISUALISER-ET-DOSSIERS — LA ROUTE QUI CRÉE UN DOSSIER, ET SURTOUT CELLE QUI REFUSE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴🔴 CE QUE CES TESTS TIENNENT, ET QUI NE PEUT PAS ÊTRE TENU À L'ÉCRAN : le serveur refuse MÊME APPELÉ DIRECTEMENT.
 * L'écran n'affiche pas le bouton sous « Documents clients scannés » — c'est du confort, et un écran se modifie. Un
 * vieil onglet, une requête forgée, une capture rejouée arriveraient encore avec l'identifiant de l'archive dans le
 * corps. C'est ici que ça se joue, et à trois profondeurs.
 *
 * ⚠️ LA CHAÎNE DES PARENTS EST DOUBLÉE, jamais la règle : `verdictCreer` — la vraie — est laissée intacte, et c'est
 * `chaineParents` qu'on simule. Doubler le verdict reviendrait à tester notre double au lieu de la règle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

const gardeMock = vi.fn();
const jetonMock = vi.fn();
const journalDispoMock = vi.fn();
const journaliserMock = vi.fn();
const lireDossierMock = vi.fn();
const chaineMock = vi.fn();
const arianeMock = vi.fn();
const drivesMock = vi.fn();
const creerMock = vi.fn();
const voisinsMock = vi.fn();

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
  journalDossierDriveDisponible: () => journalDispoMock(),
}));
vi.mock('../../../../../../lib/gestion/dossierCreeRepo', () => ({
  journaliserDossierCree: (...a: unknown[]) => journaliserMock(...a),
}));
vi.mock('../../../../../../lib/gestion/driveCreation', () => ({
  creerDossier: (...a: unknown[]) => creerMock(...a),
  voisinsDuNom: (...a: unknown[]) => voisinsMock(...a),
}));
vi.mock('../../../../../../lib/gestion/drive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../lib/gestion/drive')>()),
  lireDossier: (_j: string, id: string) => lireDossierMock(id),
  filAriane: (...a: unknown[]) => arianeMock(...a),
  listerDrivesAvecId: (...a: unknown[]) => drivesMock(...a),
  // C'est la CHAÎNE qu'on simule, pour que le VRAI verdict la juge.
  chaineParents: (_j: string, depart: string) => chaineMock(depart),
}));

import { GET, POST } from './route';

const dossier = (id: string, nom: string): DossierDetail =>
  ({ id, nom, parents: [], driveId: null, mimeType: MIME_DOSSIER, corbeille: false });

/**
 * L'ARBORESCENCE D'ESSAI. « Documents clients scannés » est sous le Drive partagé, avec trois niveaux dessous ;
 * « Base de données locative » est à côté, et la création y est permise.
 */
const ARBRE: Record<string, { nom: string; parentId: string | null }> = {
  drive: { nom: 'GESTION LOCATIVE', parentId: null },
  interdit: { nom: DOSSIER_INTERDIT_LECTURE, parentId: 'drive' },
  n1: { nom: '1 actifs', parentId: 'interdit' },
  n2: { nom: 'Assayag', parentId: 'n1' },
  n3: { nom: 'Baux 2024', parentId: 'n2' },
  permis: { nom: 'Base de données locative', parentId: 'drive' },
};

function chaineDepuis(depart: string): { id: string; nom: string; parentId: string | null }[] {
  const out: { id: string; nom: string; parentId: string | null }[] = [];
  let courant: string | null = depart;
  for (let i = 0; i < 32 && courant !== null; i += 1) {
    const n: { nom: string; parentId: string | null } | undefined = ARBRE[courant];
    if (n === undefined) break;
    out.push({ id: courant, nom: n.nom, parentId: n.parentId });
    courant = n.parentId;
  }
  return out;
}

const demandeGet = (parent: string, nom: string): Request =>
  new Request(`http://local/api/admin/gestion/drive/dossier?parent=${encodeURIComponent(parent)}`
    + `&nom=${encodeURIComponent(nom)}`);

const demandePost = (corps: unknown): Request =>
  new Request('http://local/api/admin/gestion/drive/dossier', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  });

beforeEach(() => {
  vi.clearAllMocks();
  gardeMock.mockResolvedValue(null);
  jetonMock.mockResolvedValue({ etat: 'ok', jeton: 'JETON', compteGoogle: 'a.jorel@sansvisavis.com' });
  journalDispoMock.mockResolvedValue(true);
  journaliserMock.mockResolvedValue(true);
  chaineMock.mockImplementation(async (depart: string) => chaineDepuis(depart));
  lireDossierMock.mockImplementation(async (id: string) => (ARBRE[id] === undefined
    ? { ok: false, motif: 'Ce dossier n’existe plus dans le Drive.' }
    : { ok: true, valeur: dossier(id, ARBRE[id].nom) }));
  arianeMock.mockImplementation(async (_j: string, id: string) => ({
    ok: true, valeur: chaineDepuis(id).reverse().map((e) => ({ id: e.id, nom: e.nom })),
  }));
  drivesMock.mockResolvedValue({ ok: true, valeur: [] });
  voisinsMock.mockResolvedValue({ ok: true, valeur: [] });
  creerMock.mockResolvedValue({ ok: true, valeur: { id: 'neuf', nom: 'Travaux 2026', lien: null } });
});

describe('🔴🔴 le refus sous « Documents clients scannés » — appel DIRECT à la route', () => {
  it.each([
    ['le dossier interdit lui-même', 'interdit'],
    ['profondeur 1', 'n1'],
    ['profondeur 2', 'n2'],
    ['profondeur 3', 'n3'],
  ])('refuse un POST direct sur %s, sans jamais appeler Google', async (_mot, parent) => {
    const res = await POST(demandePost({ parent, nom: 'Travaux 2026' }));
    expect(res.status).toBe(403);
    const d = (await res.json()) as { etat: string; message: string };
    expect(d.etat).toBe('refus');
    expect(d.message).toContain(DOSSIER_INTERDIT_LECTURE);
    // 🔴 LA PREUVE LA PLUS IMPORTANTE : aucune création n'est partie.
    expect(creerMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it('refuse aussi la PRÉPARATION (GET), pour que l’écran n’ait rien à proposer', async () => {
    const res = await GET(demandeGet('n2', 'Travaux'));
    expect(res.status).toBe(403);
    expect(creerMock).not.toHaveBeenCalled();
  });

  /** ⚠️ NE PAS SAVOIR VAUT INTERDIT : une chaîne qu'on n'a pas su remonter n'autorise rien. */
  it('refuse un parent dont la chaîne de parents est introuvable', async () => {
    chaineMock.mockResolvedValue([]);
    const res = await POST(demandePost({ parent: 'inconnu', nom: 'X' }));
    expect(res.status).toBe(403);
    expect(creerMock).not.toHaveBeenCalled();
  });
});

describe('les autres refus, tous prononcés AVANT d’écrire', () => {
  it('refuse les regroupements du sélecteur, SANS appeler Google du tout', async () => {
    for (const faux of ['svav:drives', 'svav:partages']) {
      const res = await POST(demandePost({ parent: faux, nom: 'X' }));
      expect(res.status, faux).toBe(409);
      expect((await res.json() as { message: string }).message).toContain('regroupement');
    }
    expect(chaineMock).not.toHaveBeenCalled();
    expect(creerMock).not.toHaveBeenCalled();
  });

  it('refuse un parent absent', async () => {
    const res = await POST(demandePost({ nom: 'X' }));
    expect(res.status).toBe(400);
    expect(creerMock).not.toHaveBeenCalled();
  });

  it('refuse un nom vide', async () => {
    const res = await POST(demandePost({ parent: 'permis', nom: '   ' }));
    expect(res.status).toBe(400);
    expect(creerMock).not.toHaveBeenCalled();
  });

  /** 🔴 « Il n'y a jamais de doublon silencieux » — et le refus dit ce qui existe déjà. */
  it('refuse un doublon, même écrit avec une autre casse ou d’autres accents', async () => {
    voisinsMock.mockResolvedValue({ ok: true, valeur: [{ id: 'x', nom: 'Travaux 2026', dossier: true }] });
    const res = await POST(demandePost({ parent: 'permis', nom: 'TRAVAUX  2026' }));
    expect(res.status).toBe(409);
    expect((await res.json() as { message: string }).message).toContain('Travaux 2026');
    expect(creerMock).not.toHaveBeenCalled();
  });

  it('refuse un parent qui n’est pas un dossier', async () => {
    lireDossierMock.mockResolvedValue({
      ok: true, valeur: { ...dossier('permis', 'Un fichier'), mimeType: 'application/pdf' },
    });
    const res = await POST(demandePost({ parent: 'permis', nom: 'X' }));
    expect(res.status).toBe(409);
    expect(creerMock).not.toHaveBeenCalled();
  });

  it('refuse un parent à la corbeille', async () => {
    lireDossierMock.mockResolvedValue({ ok: true, valeur: { ...dossier('permis', 'Vieux'), corbeille: true } });
    const res = await POST(demandePost({ parent: 'permis', nom: 'X' }));
    expect(res.status).toBe(409);
    expect(creerMock).not.toHaveBeenCalled();
  });

  it('refuse une demande illisible', async () => {
    const res = await POST(new Request('http://local/x', { method: 'POST', body: 'pas du json' }));
    expect(res.status).toBe(400);
    expect(creerMock).not.toHaveBeenCalled();
  });
});

/**
 * 🔴🔴 SANS LA MIGRATION 272, RIEN N'EST CRÉÉ. C'est le seul endroit du module où une sonde de schéma conditionne une
 * ÉCRITURE EXTÉRIEURE : un dossier apparu dans le Drive sans ligne de journal serait un dossier que personne ne
 * pourrait expliquer.
 */
describe('🔴 la migration 272 est une CONDITION, pas une commodité', () => {
  it('le POST refuse en 503 et n’appelle jamais Google', async () => {
    journalDispoMock.mockResolvedValue(false);
    const res = await POST(demandePost({ parent: 'permis', nom: 'Travaux 2026' }));
    expect(res.status).toBe(503);
    const d = (await res.json()) as { message: string; journalDisponible: boolean };
    expect(d.journalDisponible).toBe(false);
    expect(d.message).toContain('272');
    expect(creerMock).not.toHaveBeenCalled();
  });

  it('le GET le dit, sans faire échouer l’écran', async () => {
    journalDispoMock.mockResolvedValue(false);
    const res = await GET(demandeGet('permis', 'X'));
    expect(res.status).toBe(200);
    expect((await res.json() as { etat: string }).etat).toBe('indisponible');
  });
});

describe('quand tout est permis', () => {
  /**
   * 🔴 LE CHEMIN COMPLET VIENT DU SERVEUR, lu chez Google — c'est la seule protection contre la faute la plus
   * probable du lot : le bon nom, au mauvais endroit.
   */
  it('le GET rend le nom nettoyé et le chemin COMPLET', async () => {
    const res = await GET(demandeGet('permis', '  Travaux   2026 '));
    expect(res.status).toBe(200);
    const d = (await res.json()) as { etat: string; nom: string; chemin: string; phrase: string };
    expect(d.etat).toBe('ok');
    expect(d.nom).toBe('Travaux 2026');
    expect(d.chemin).toBe('GESTION LOCATIVE › Base de données locative › Travaux 2026');
    expect(d.phrase).toContain(d.chemin);
  });

  it('le POST crée, journalise, et rend l’identifiant du nouveau dossier', async () => {
    const res = await POST(demandePost({ parent: 'permis', nom: 'Travaux 2026' }));
    expect(res.status).toBe(200);
    const d = (await res.json()) as { etat: string; dossier: { id: string }; journalise: boolean; chemin: string };
    expect(d).toMatchObject({ etat: 'ok', journalise: true });
    expect(d.dossier.id).toBe('neuf');

    expect(creerMock).toHaveBeenCalledTimes(1);
    expect(creerMock.mock.calls[0][1]).toEqual({ parentId: 'permis', nom: 'Travaux 2026' });

    // Le journal porte QUI, QUOI, OÙ — et le chemin figé au moment de la création.
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      driveId: 'neuf', parentId: 'permis', nom: 'Travaux 2026',
      auteurId: 7, auteurLibelle: 'a.jorel@sansvisavis.com', compteGoogle: 'a.jorel@sansvisavis.com',
      chemin: 'GESTION LOCATIVE › Base de données locative › Travaux 2026',
    });
  });

  /**
   * ⚠️ LE DOSSIER EXISTE MÊME SI LE JOURNAL A ÉCHOUÉ, et on le DIT. Rendre une erreur ferait recommencer, donc
   * créerait un doublon — et supprimer pour « rattraper » est interdit dans ce lot.
   */
  it('dit franchement qu’un dossier créé n’a pas pu être consigné', async () => {
    journaliserMock.mockResolvedValue(false);
    const res = await POST(demandePost({ parent: 'permis', nom: 'Travaux 2026' }));
    expect(res.status).toBe(200);
    const d = (await res.json()) as { etat: string; journalise: boolean; message: string };
    expect(d).toMatchObject({ etat: 'ok', journalise: false });
    expect(d.message).toContain('créé');
    expect(d.message).toContain('journal');
  });

  it('un refus de Google est rendu tel quel, sans réessai et sans journal', async () => {
    creerMock.mockResolvedValue({ ok: false, motif: 'Google a refusé la création du dossier : …' });
    const res = await POST(demandePost({ parent: 'permis', nom: 'Travaux 2026' }));
    expect(res.status).toBe(502);
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  /**
   * 🔴🔴 DÉFAUT TROUVÉ À L'ÉCRAN LE 28/09/2026, AVANT LA PREMIÈRE CRÉATION RÉELLE.
   *
   * `files.get` appelle « Drive » la racine de TOUS les Drive partagés — le cabinet en a dix. La confirmation
   * annonçait donc « Drive › Base de données locative › … » : elle ne disait PAS dans lequel on allait créer. Or ce
   * chemin est la seule protection contre la faute la plus probable de ce lot — le bon nom, au mauvais endroit — et
   * un chemin qui ne distingue pas dix destinations ne protège de rien.
   */
  it('🔴🔴 la racine d’un Drive PARTAGÉ est nommée, pas appelée « Drive »', async () => {
    arianeMock.mockResolvedValue({
      ok: true,
      valeur: [
        { id: 'drive', nom: 'Drive', driveId: 'drive' },   // ce que `files.get` répond vraiment
        { id: 'permis', nom: 'Base de données locative' },
      ],
    });
    drivesMock.mockResolvedValue({ ok: true, valeur: [{ id: 'drive', nom: 'GESTION LOCATIVE', driveId: 'drive' }] });
    const res = await GET(demandeGet('permis', 'Travaux 2026'));
    expect((await res.json() as { chemin: string }).chemin)
      .toBe('GESTION LOCATIVE › Base de données locative › Travaux 2026');
  });

  /** ⚠️ UN SEUL APPEL DE PLUS, ET SEULEMENT QUAND IL Y A UNE RACINE DE DRIVE PARTAGÉ : jamais dans Mon Drive. */
  it('…et la liste des Drive n’est PAS demandée quand il n’y en a pas à nommer', async () => {
    await GET(demandeGet('permis', 'Travaux 2026'));
    expect(drivesMock).not.toHaveBeenCalled();
  });

  /** Au mieux-effort : un chemin imparfait vaut mieux qu'une création refusée pour un défaut d'affichage. */
  it('garde « Drive » si la liste des Drive ne répond pas, et crée quand même', async () => {
    arianeMock.mockResolvedValue({ ok: true, valeur: [{ id: 'drive', nom: 'Drive', driveId: 'drive' }] });
    drivesMock.mockResolvedValue({ ok: false, motif: 'Drive muet' });
    const res = await POST(demandePost({ parent: 'permis', nom: 'Travaux 2026' }));
    expect(res.status).toBe(200);
    expect((await res.json() as { chemin: string }).chemin).toBe('Drive › Travaux 2026');
  });

  /** Un fil d'Ariane muet ne doit pas faire échouer la création : le chemin est un CONFORT d'affichage. */
  it('crée quand même si le chemin lisible n’a pas pu être lu', async () => {
    arianeMock.mockResolvedValue({ ok: false, motif: 'Drive muet' });
    const res = await POST(demandePost({ parent: 'permis', nom: 'Travaux 2026' }));
    expect(res.status).toBe(200);
    expect((await res.json() as { chemin: string }).chemin).toBe('Mon Drive › Travaux 2026');
  });
});

describe('la garde d’accès passe avant tout', () => {
  it('un refus de la garde arrête la route, sans sonde, sans jeton, sans Google', async () => {
    gardeMock.mockResolvedValue(new Response('non', { status: 403 }));
    const res = await POST(demandePost({ parent: 'permis', nom: 'X' }));
    expect(res.status).toBe(403);
    expect(journalDispoMock).not.toHaveBeenCalled();
    expect(jetonMock).not.toHaveBeenCalled();
    expect(creerMock).not.toHaveBeenCalled();
  });
});
