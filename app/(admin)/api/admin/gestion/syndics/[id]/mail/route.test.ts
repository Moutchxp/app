import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * ══ 🔴🔴 LOT MAIL-PREREMPLI-TEXTE-B-ET-NOM-DANS-OBJET — LE NOM DU COMPTE CONNECTÉ ════════════════════════════════════
 * La route lit le compte de la session (même garde qu'avant : droit `gestion`) et passe « Prénom NOM » à la
 * préparation du mail. Voie de secours (sans compte) ou compte sans nom ⇒ aucun nom. Lecture seule.
 */
vi.mock('server-only', () => ({}));
const exigerModule = vi.fn();
vi.mock('../../../../../../../lib/admin/garde', () => ({ exigerModule: (...a: unknown[]) => exigerModule(...a) }));
const trouverCompteParId = vi.fn();
vi.mock('../../../../../../../lib/admin/comptes', () => ({ trouverCompteParId: (...a: unknown[]) => trouverCompteParId(...a) }));
const preparerMailSyndic = vi.fn();
vi.mock('../../../../../../../lib/gestion/mailSyndicRepo', () => ({ preparerMailSyndic: (...a: unknown[]) => preparerMailSyndic(...a) }));
vi.mock('../../../../../../../lib/gestion/syndicRepo', () => ({ syndicsDisponibles: async () => true }));
let coches = new Map<number, boolean>();
vi.mock('../../../../../../../lib/admin/serviceGestion', () => ({ servicesGestion: async () => coches }));

const { GET } = await import('./route');
const appeler = () => GET(new Request('http://x/api/admin/gestion/syndics/40/mail?a=m%40x.fr&lot=176'), { params: Promise.resolve({ id: '40' }) });

beforeEach(() => {
  exigerModule.mockReset().mockResolvedValue({ auteurId: 2 });
  trouverCompteParId.mockReset().mockResolvedValue({ id: 2, prenom: 'Arnaud', nom: 'Jorel' });
  preparerMailSyndic.mockReset().mockResolvedValue({ objet: 'Arnaud JOREL / o', surlignage: [0, 12], corps: 'c', civilites: {} });
  coches = new Map();
});

describe('/syndics/[id]/mail — le nom du compte connecté', () => {
  it('« Arnaud JOREL » est passé à la préparation ; la garde est le droit `gestion`', async () => {
    const r = await appeler();
    expect(r.status).toBe(200);
    expect(exigerModule.mock.calls[0][1]).toBe('gestion');
    expect(trouverCompteParId).toHaveBeenCalledWith(2);
    expect(preparerMailSyndic).toHaveBeenCalledWith(40, 176, ['m@x.fr'], 'Arnaud JOREL');
  });
  it('compte sans nom ⇒ aucun nom', async () => {
    trouverCompteParId.mockResolvedValue({ id: 2, prenom: '', nom: ' ' });
    await appeler();
    expect(preparerMailSyndic.mock.calls[0][3]).toBeNull();
  });
  it('voie de secours (aucun compte) ⇒ aucun nom, aucune lecture de compte', async () => {
    exigerModule.mockResolvedValue({ auteurId: null });
    await appeler();
    expect(trouverCompteParId).not.toHaveBeenCalled();
    expect(preparerMailSyndic.mock.calls[0][3]).toBeNull();
  });
  it('refus de la garde : rendu tel quel, rien n’est préparé', async () => {
    exigerModule.mockResolvedValue({ refus: new Response('non', { status: 403 }) });
    expect((await appeler()).status).toBe(403);
    expect(preparerMailSyndic).not.toHaveBeenCalled();
  });
});

describe('🔴 LOT PROFIL-GESTION — le cartouche selon « Appartient au service gestion »', () => {
  it('compte COCHÉ : le nom est dans l’objet, SANS cartouche (aucun surlignage)', async () => {
    coches = new Map([[2, true]]);
    const r = await (await appeler()).json();
    expect(r.objet).toBe('Arnaud JOREL / o');
    expect(r.surlignage).toBeNull();
  });
  it('compte NON coché : le cartouche reste', async () => {
    coches = new Map([[2, false]]);
    expect((await (await appeler()).json()).surlignage).toEqual([0, 12]);
  });
  it('compte sans nom : comportement inchangé (aucun nom, la préparation décide seule)', async () => {
    trouverCompteParId.mockResolvedValue({ id: 2, prenom: '', nom: '' });
    preparerMailSyndic.mockResolvedValue({ objet: 'Cabinet Criterimmo', surlignage: null, corps: 'c', civilites: {} });
    const r = await (await appeler()).json();
    expect(preparerMailSyndic.mock.calls[0][3]).toBeNull();
    expect([r.objet, r.surlignage]).toEqual(['Cabinet Criterimmo', null]);
  });
});
