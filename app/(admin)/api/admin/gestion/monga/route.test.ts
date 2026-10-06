import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 3 — ÉPREUVES DE LA ROUTE ═════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce qu'elle tient, et que les épreuves des gestes ne tiennent pas :
 *
 *   ① LE DROIT EST EXIGÉ À CHAQUE VERBE, et l'AUTEUR vient de la SESSION — jamais du navigateur. Ce n'est pas une
 *      précaution de forme : la base REFUSE un lien Monga signé « automatique », et la décision n° 1 d'Arno
 *      (« toujours un clic d'Arno ») se tient à trois étages — l'écran, cette route, la contrainte.
 *   ② L'AIGUILLAGE DU POST. Trois corps possibles, et l'ordre de lecture décide : `delier` d'abord, puis
 *      `evenementId`, puis `messageId + lotCle`. Mal aiguillé, « Annuler » aurait relié une seconde fois.
 *   ③ LA RÉFÉRENCE EST RE-VALIDÉE ICI, pour rendre un mot lisible au lieu d'une erreur de contrainte.
 *   ④ `sans_schema` EST UN ÉTAT RENDU EN 200, et non une panne : l'écran n'affiche alors aucun encart.
 *
 * 🔒 Base et garde MOCKÉES : aucune connexion, aucune écriture possible.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
const garde = vi.fn();
vi.mock('../../../../../lib/admin/garde', () => ({
  exigerCompteActif: (...a: unknown[]) => garde(...a),
}));
const auteur = vi.fn();
vi.mock('../../../../../lib/gestion/auteur', () => ({
  auteurDeLaRequete: (...a: unknown[]) => auteur(...a),
}));
const dispo = vi.fn();
vi.mock('../../../../../lib/gestion/schema', () => ({ mongaDisponible: () => dispo() }));

const encartMonga = vi.fn();
const chercherUnLotMonga = vi.fn();
const interventionsMonga = vi.fn();
vi.mock('../../../../../lib/gestion/mongaRepo', () => ({
  encartMonga: (...a: unknown[]) => encartMonga(...a),
  chercherUnLotMonga: (...a: unknown[]) => chercherUnLotMonga(...a),
  interventionsMonga: (...a: unknown[]) => interventionsMonga(...a),
}));
const relierLaReference = vi.fn();
const creerEvenementEtRelier = vi.fn();
const delierLaReference = vi.fn();
vi.mock('../../../../../lib/gestion/mongaClassement', () => ({
  relierLaReference: (...a: unknown[]) => relierLaReference(...a),
  creerEvenementEtRelier: (...a: unknown[]) => creerEvenementEtRelier(...a),
  delierLaReference: (...a: unknown[]) => delierLaReference(...a),
}));

const { GET, POST, referenceRecue } = await import('./route');

const ARNO = { id: 7, libelle: 'Arnaud JOREL' };
const poste = (corps: unknown) => new Request('http://local/api/admin/gestion/monga', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
});

beforeEach(() => {
  garde.mockReset();
  garde.mockResolvedValue(null); // autorisé par défaut ; le refus est éprouvé explicitement
  auteur.mockReset();
  auteur.mockResolvedValue(ARNO);
  dispo.mockReset();
  dispo.mockResolvedValue(true);
  encartMonga.mockReset();
  encartMonga.mockResolvedValue(null);
  chercherUnLotMonga.mockReset();
  chercherUnLotMonga.mockResolvedValue([]);
  interventionsMonga.mockReset();
  interventionsMonga.mockResolvedValue([]);
  relierLaReference.mockReset();
  relierLaReference.mockResolvedValue({ ok: true, evenementId: '4242', reference: 'MNG-23987', classes: 4 });
  creerEvenementEtRelier.mockReset();
  creerEvenementEtRelier.mockResolvedValue({ ok: true, evenementId: '777', reference: 'MNG-23987', classes: 4 });
  delierLaReference.mockReset();
  delierLaReference.mockResolvedValue({ ok: true, liensRetires: 2, mailsRemis: 2, nomRemis: null, evenementVide: true });
});

describe('① le droit, et l’auteur de la session', () => {
  it('🔴🔴 le GET et le POST exigent tous deux le module « gestion »', async () => {
    garde.mockResolvedValue(new Response('non', { status: 403 }));
    expect((await GET(new Request('http://local/api/admin/gestion/monga?message=1'))).status).toBe(403);
    expect((await POST(poste({ reference: 'MNG-23987', delier: true }))).status).toBe(403);
    expect(garde.mock.calls.every((c) => c[1] === 'gestion')).toBe(true);
    // 🔴 ET RIEN N'A ÉTÉ LU NI ÉCRIT : le refus passe AVANT tout.
    expect(encartMonga).not.toHaveBeenCalled();
    expect(delierLaReference).not.toHaveBeenCalled();
  });

  it('🔴🔴 L’AUTEUR VIENT DE LA SESSION, et le corps de la requête ne peut pas le choisir', async () => {
    await POST(poste({ reference: 'MNG-23987', evenementId: 4242, auteur: { id: 1, libelle: 'automatique' } }));
    expect(relierLaReference).toHaveBeenCalledWith(
      expect.objectContaining({ auteur: ARNO, reference: 'MNG-23987', evenementId: '4242' }));
    /* ⚠️ Le `auteur` glissé dans le corps est purement ignoré : il n'arrive nulle part. */
    const passe = relierLaReference.mock.calls[0][0] as { auteur: { libelle: string } };
    expect(passe.auteur.libelle).toBe('Arnaud JOREL');
  });
});

describe('② l’aiguillage du POST', () => {
  it('🔴 « delier » PASSE AVANT TOUT : « Annuler » ne doit jamais relier une seconde fois', async () => {
    /* Un corps qui porte LES DEUX (le cas d'un écran qui réenvoie son état) doit délier, pas relier. */
    const res = await POST(poste({ reference: 'MNG-23987', delier: true, evenementId: 4242 }));
    expect(res.status).toBe(200);
    expect(delierLaReference).toHaveBeenCalledTimes(1);
    expect(relierLaReference).not.toHaveBeenCalled();
  });

  it('un `evenementId` relie à un événement existant', async () => {
    const res = await POST(poste({ reference: 'MNG-23987', evenementId: 4242 }));
    expect(await res.json()).toMatchObject({ etat: 'ok', classes: 4 });
    expect(creerEvenementEtRelier).not.toHaveBeenCalled();
  });

  it('un `messageId` + un `lotCle` créent l’événement et relient', async () => {
    await POST(poste({ reference: 'MNG-23987', messageId: 57489, lotCle: '27' }));
    expect(creerEvenementEtRelier).toHaveBeenCalledWith(expect.objectContaining({
      reference: 'MNG-23987', messageId: '57489', lotCle: '27', auteur: ARNO,
    }));
  });

  it('⚠️ ni l’un ni l’autre ⇒ 422 avec un mot utile, et aucune écriture', async () => {
    const res = await POST(poste({ reference: 'MNG-23987' }));
    expect(res.status).toBe(422);
    expect((await res.json()).erreur).toContain('Choisissez un événement existant');
    expect(relierLaReference).not.toHaveBeenCalled();
    expect(creerEvenementEtRelier).not.toHaveBeenCalled();
  });

  it('un refus du geste est rendu en 409 avec SON motif, jamais avalé', async () => {
    relierLaReference.mockResolvedValue({ ok: false, motif: 'L’intervention MNG-23987 est déjà reliée.' });
    const res = await POST(poste({ reference: 'MNG-23987', evenementId: 4242 }));
    expect(res.status).toBe(409);
    expect((await res.json()).erreur).toContain('déjà reliée');
  });
});

describe('③ la référence est re-validée ici', () => {
  it('🔴 elle normalise la casse et refuse tout le reste', () => {
    expect(referenceRecue('mng-23987')).toBe('MNG-23987');
    expect(referenceRecue('  MNG-20354 ')).toBe('MNG-20354');
    expect(referenceRecue('MNG-123')).toBeNull(); // trois chiffres : ce n'est pas une référence
    expect(referenceRecue('MNG-1234567')).toBeNull();
    expect(referenceRecue('GES-2026-000042')).toBeNull();
    expect(referenceRecue('')).toBeNull();
    expect(referenceRecue(null)).toBeNull();
    expect(referenceRecue(42)).toBeNull();
    // ⚠️ Pas d'injection possible : la forme est close.
    expect(referenceRecue("MNG-23987'; DROP TABLE gestion_message; --")).toBeNull();
  });

  it('un POST sans référence valable est refusé en 422, avant tout geste', async () => {
    const res = await POST(poste({ reference: 'pas une référence', delier: true }));
    expect(res.status).toBe(422);
    expect(delierLaReference).not.toHaveBeenCalled();
  });
});

describe('④ les lectures, et l’état « sans_schema »', () => {
  it('🔴 sans la migration 311, on rend un ÉTAT en 200 — pas une erreur', async () => {
    dispo.mockResolvedValue(false);
    const res = await GET(new Request('http://local/api/admin/gestion/monga?message=1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ etat: 'sans_schema' });
    expect(encartMonga).not.toHaveBeenCalled();
  });

  it('?message=N rend l’encart ; `null` n’est pas une erreur', async () => {
    const res = await GET(new Request('http://local/api/admin/gestion/monga?message=57489'));
    expect(await res.json()).toEqual({ etat: 'ok', encart: null });
    expect(encartMonga).toHaveBeenCalledWith('57489');
  });

  it('?cherche=… rend les lots trouvés ; ?aRelier=1 les interventions à relier', async () => {
    await GET(new Request('http://local/api/admin/gestion/monga?cherche=Ternes'));
    expect(chercherUnLotMonga).toHaveBeenCalledWith('Ternes');
    await GET(new Request('http://local/api/admin/gestion/monga?aRelier=1'));
    expect(interventionsMonga).toHaveBeenCalledWith({ reliees: false });
  });

  it('⚠️ un mail inconnu est refusé en 422, pas en 500', async () => {
    const res = await GET(new Request('http://local/api/admin/gestion/monga'));
    expect(res.status).toBe(422);
  });

  it('⚠️ une base muette rend 503, et le dit — jamais une liste vide', async () => {
    encartMonga.mockRejectedValue(new Error('base muette'));
    const res = await GET(new Request('http://local/api/admin/gestion/monga?message=1'));
    expect(res.status).toBe(503);
    expect((await res.json()).erreur).toContain('base n’a pas répondu');
  });
});
