import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — la ROUTE : la sortie d'abord, le mail ensuite ; un échec
 * d'envoi ne transforme JAMAIS une sortie enregistrée en erreur, et il est rendu tel quel (jamais un faux « envoyé »).
 */
vi.mock('../../../../lib/db/client', () => ({ query: vi.fn(), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../lib/location/garde', () => ({ exigerLocation: async () => ({ ok: true }) }));
vi.mock('../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 3, libelle: 'arno@exemple.fr' }) }));
/** Le droit « Gestion », RELU EN BASE par `exigerCompteActif` (simulé) : `null` = accordé, une réponse = refusé. */
let droitGestion = true;
vi.mock('../../../../lib/admin/garde', () => ({
  exigerCompteActif: async (_r: Request, module: string) => (module === 'gestion' && !droitGestion ? new Response(null, { status: 403 }) : null),
}));
const enregistrerSortie = vi.fn();
const notifierSortie = vi.fn();
vi.mock('../../../../lib/location/sortieLocatairesRepo', () => ({
  enregistrerSortie: (...a: unknown[]) => enregistrerSortie(...a),
  notifierSortie: (...a: unknown[]) => notifierSortie(...a),
  rechercherOccupants: vi.fn(async () => []), lireBail: vi.fn(), bauxDuLocataire: vi.fn(),
  corrigerSortie: vi.fn(), annulerSortie: vi.fn(),
}));

/** Arno (05/11/2026) — les mails automatiques du préavis et de la sortie (doublés : rien ne part, aucune base). */
const envoyerMailSortieAdhoc = vi.fn();
const envoyerMailsPreavis = vi.fn();
const apercuMailsPreavis = vi.fn();
vi.mock('../../../../lib/location/mailsPreavisSortieRepo', () => ({
  envoyerMailSortieAdhoc: (...a: unknown[]) => envoyerMailSortieAdhoc(...a),
  envoyerMailsPreavis: (...a: unknown[]) => envoyerMailsPreavis(...a),
  apercuMailsPreavis: (...a: unknown[]) => apercuMailsPreavis(...a),
}));
const enregistrerPreavis = vi.fn();
vi.mock('../../../../lib/location/preavisRepo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/location/preavisRepo')>()),
  enregistrerPreavis: (...a: unknown[]) => enregistrerPreavis(...a),
}));

import { POST } from './route';

const demande = (corps: unknown): Request => new Request('http://localhost/api/admin/location', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
});
const FAITE = { date: '2026-10-31', vacant: true, restants: [], bail: { lotId: 7 }, sortants: [], occupationIds: [11], annexes: [] };

const ORDRE: string[] = [];
beforeEach(() => {
  enregistrerSortie.mockReset(); notifierSortie.mockReset(); droitGestion = true; ORDRE.length = 0;
  envoyerMailSortieAdhoc.mockReset().mockImplementation(async () => { ORDRE.push('adhoc'); return { etat: 'ok', envois: [] }; });
  envoyerMailsPreavis.mockReset(); apercuMailsPreavis.mockReset(); enregistrerPreavis.mockReset();
});

describe('POST sortie-locataires', () => {
  it('échec d’envoi : la sortie reste « ok », et la réponse dit que le mail n’est pas parti', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'ok', data: FAITE });
    notifierSortie.mockResolvedValue({ envoye: false, motif: 'Gmail injoignable', destinataires: ['a@b.fr'], objet: 'x' });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11, '12', 'x'], date: '2026-10-31' }))).json();
    expect(r).toEqual({ etat: 'ok', data: { date: '2026-10-31', vacant: true, restants: [] }, mail: { envoye: false, ignore: false, motif: 'Gmail injoignable' },
      adhoc: { etat: 'ok', envois: [] } });
    expect(enregistrerSortie).toHaveBeenCalledWith({ occupationId: 11, sortants: [11, 12], date: '2026-10-31' }, { id: 3, libelle: 'arno@exemple.fr' });
  });

  it('🔴 décision du 18/10/2026 : SANS le droit Gestion, la validation de sortie est REFUSÉE par le serveur (403), rien n’est écrit', async () => {
    droitGestion = false;
    const res = await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '2026-10-15' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ etat: 'refus', motif: 'La sortie est validée par un utilisateur de la Gestion.' });
    expect(enregistrerSortie).not.toHaveBeenCalled();
    expect(notifierSortie).not.toHaveBeenCalled();
    expect(envoyerMailSortieAdhoc).not.toHaveBeenCalled();
  });

  it('un refus de la sortie : aucun mail', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'refus', motif: 'La date de sortie est obligatoire.' });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '' }))).json();
    expect(r).toEqual({ etat: 'refus', motif: 'La date de sortie est obligatoire.' });
    expect(notifierSortie).not.toHaveBeenCalled();
    expect(envoyerMailSortieAdhoc).not.toHaveBeenCalled();
  });

  it('🔴 Arno (05/11/2026) : le compte rendu déjà en place part TOUJOURS, PUIS l’information ADHOC ; leur issue est rendue', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'ok', data: FAITE });
    notifierSortie.mockImplementation(async () => { ORDRE.push('compte-rendu'); return { envoye: true, motif: null, destinataires: ['a@b.fr'], objet: 'x' }; });
    const envoi = { sorte: 'sortie_adhoc', objet: '[Information] Sortie de locataire(s) — 4 rue Fictive', a: ['gestion.criterimmo@gmail.com'], cc: ['gestion@criterimmo.fr'], envoye: true, motif: null };
    envoyerMailSortieAdhoc.mockImplementation(async () => { ORDRE.push('adhoc'); return { etat: 'ok', envois: [envoi] }; });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '2026-10-31' }))).json();
    expect(ORDRE).toEqual(['compte-rendu', 'adhoc']);
    expect(envoyerMailSortieAdhoc).toHaveBeenCalledWith(FAITE, { id: 3, libelle: 'arno@exemple.fr' });
    expect(r.mail).toEqual({ envoye: true, ignore: false, motif: null });
    expect(r.adhoc).toEqual({ etat: 'ok', envois: [envoi] });
  });

  it('un échec du mail ADHOC ne défait pas la sortie : « ok », avec le motif', async () => {
    enregistrerSortie.mockResolvedValue({ etat: 'ok', data: FAITE });
    notifierSortie.mockResolvedValue({ envoye: true, motif: null, destinataires: [], objet: 'x' });
    envoyerMailSortieAdhoc.mockResolvedValue({ etat: 'sans_schema', motif: 'migration 457' });
    const r = await (await POST(demande({ action: 'sortie-locataires', occupationId: 11, sortants: [11], date: '2026-10-31' }))).json();
    expect(r.etat).toBe('ok');
    expect(r.adhoc).toEqual({ etat: 'sans_schema', motif: 'migration 457' });
  });
});

describe('Arno (05/11/2026) — POST apercu-preavis / enregistrer-preavis + envoyerMails', () => {
  const corps = { occupationIds: [11, '12', 'x'], recuLe: '2026-11-04', choix: { mode: 'mois', duree: 1 } };

  it('l’aperçu : lecture seule — rien n’est enregistré, rien ne part', async () => {
    apercuMailsPreavis.mockResolvedValue({ etat: 'ok', data: { mails: [], sansEmail: [], enGestion: true, dateFin: '2026-12-04', envoiPossible: true } });
    const r = await (await POST(demande({ action: 'apercu-preavis', ...corps }))).json();
    expect(r.etat).toBe('ok');
    expect(apercuMailsPreavis).toHaveBeenCalledWith({ occupationIds: [11, 12], recuLe: '2026-11-04', choix: { mode: 'mois', duree: 1 } }, { id: 3, libelle: 'arno@exemple.fr' });
    expect(enregistrerPreavis).not.toHaveBeenCalled();
    expect(envoyerMailsPreavis).not.toHaveBeenCalled();
  });

  it('« Valider et envoyer » : le préavis D’ABORD, les mails ENSUITE ; leur issue est rendue', async () => {
    enregistrerPreavis.mockImplementation(async () => { ORDRE.push('preavis'); return { etat: 'ok', data: { dateMax: '2026-12-04', preavis: 2 } }; });
    envoyerMailsPreavis.mockImplementation(async () => { ORDRE.push('mails'); return { etat: 'ok', envois: [] }; });
    const r = await (await POST(demande({ action: 'enregistrer-preavis', ...corps, motif: null, envoyerMails: true }))).json();
    expect(ORDRE).toEqual(['preavis', 'mails']);
    expect(envoyerMailsPreavis).toHaveBeenCalledWith({ occupationIds: [11, 12], recuLe: '2026-11-04', choix: { mode: 'mois', duree: 1 } }, { id: 3, libelle: 'arno@exemple.fr' });
    expect(r).toEqual({ etat: 'ok', data: { dateMax: '2026-12-04', preavis: 2 }, mails: { etat: 'ok', envois: [] } });
  });

  it('un préavis REFUSÉ : aucun mail ; sans `envoyerMails` (autres écrans) : aucun mail non plus, comme avant', async () => {
    enregistrerPreavis.mockResolvedValue({ etat: 'refus', motif: 'Saisissez la date de réception du recommandé' });
    await POST(demande({ action: 'enregistrer-preavis', ...corps, envoyerMails: true }));
    enregistrerPreavis.mockResolvedValue({ etat: 'ok', data: { dateMax: '2026-12-04', preavis: 2 } });
    const r = await (await POST(demande({ action: 'enregistrer-preavis', ...corps }))).json();
    expect(r).toEqual({ etat: 'ok', data: { dateMax: '2026-12-04', preavis: 2 } });
    expect(envoyerMailsPreavis).not.toHaveBeenCalled();
  });
});
