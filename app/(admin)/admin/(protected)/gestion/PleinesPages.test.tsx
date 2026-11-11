// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GestionVue } from './GestionVue';
import { CLE_TACHES_PLEINE_PAGE } from './TableauTaches';
import { signalerTaches } from './tachesClient';
import { ajouterJours, jourParisDe, type Tache } from '../../../../lib/gestion/taches';

/**
 * 🔴🔴 Arno (10/11/2026, accord explicite pour retirer l'en-tête sur CES DEUX pages) — les pleines pages Préavis et Tâches de la Gestion :
 * sans l'en-tête « Gestion », « ← Retour à la Gestion » ; le lien « Ouvrir en pleine page » sur la ligne Tâches repliée ; la pleine page
 * Tâches avec recherche, tris, filtres cumulables conservés, et les MÊMES données que le bloc. Les vrais écrans, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const AUJ = jourParisDe(new Date());
const tache = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 27, lotCle: '26', adresseBien: '4 rue Fictive', evenement: null, objet: 'x', note: null, jour: AUJ, heure: null, rappels: [], etat: 'a_faire',
  confieeA: 2, confieeALibelle: 'Claire Test', creeLe: '2026-11-01T08:00:00Z', creeParLibelle: 'Arno', majLe: '2026-11-01T08:00:00Z', faiteLe: null, faiteParLibelle: null,
  annuleeLe: null, annuleeParLibelle: null, nbContacts: 0, ...p,
});
const il = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const ECRAN = {
  file: [], filsTotal: 0, fenetreJours: 30, filsTropAnciens: 0, sansSuite: [], sansSuiteTotal: 0, evenements: [], evenementsTotal: 0, evenementsOuverts: 0,
  messagesCaptures: 1, messagesExclus: 0, derniereReleveLe: il(5), dernierMailLe: il(5),
  veille: { derniereLe: il(5), resultat: 'ok', erreur: null, intervalleS: 60, toleranceIntervalles: 10 }, suite: { resultat: null, detail: null, ms: null },
  copie: { derniere: { id: 4, resultat: 'arret', termineLe: il(30), motifArret: 'limite atteinte', echecs: 0, piecesCopiees: 10, vivant: false }, restantes: 1234, motifs: [] },
};
const json = (x: unknown) => ({ ok: true, status: 200, json: async () => x }) as unknown as Response;
let taches: Tache[]; let appels: string[];
let racines: { c: HTMLDivElement; r: Root }[] = [];
beforeEach(() => {
  racines = []; appels = [];
  try { window.localStorage.clear(); } catch { /* sans stockage */ }
  taches = [
    tache({ id: 1, objet: 'Relancer le plombier', jour: ajouterJours(AUJ, -3), creeLe: '2026-10-01T08:00:00Z' }),
    tache({ id: 2, objet: 'Visite', jour: AUJ, heure: '15:00', creeLe: '2026-11-05T08:00:00Z', lotId: null, adresseBien: '' }),
    tache({ id: 3, objet: 'État des lieux', jour: ajouterJours(AUJ, 2), creeLe: '2026-10-20T08:00:00Z', confieeALibelle: 'Paul Test' }),
    tache({ id: 4, objet: 'Clés', jour: ajouterJours(AUJ, 9), creeLe: '2026-11-08T08:00:00Z', adresseBien: '12 rue des Lilas, Paris' }),
  ];
  global.fetch = vi.fn(async (u: string | URL | Request) => {
    const s = decodeURIComponent(String(u)); appels.push(s);
    if (s.includes('preavisEnCours=1')) return json({ etat: 'ok', data: { disponible: true, etatDesLieux: true, planification: true, previsite: true, lignes: [] } });
    if (s.startsWith('/api/admin/location')) return json({ etat: 'ok', data: [] });
    if (s.includes('/api/admin/gestion/taches') && !s.includes('reglage')) return json({ etat: 'ok', taches, moi: 2, tronque: false });
    if (s.includes('reglage')) return json({ etat: 'ok', envoiMail: false, modifiable: false });
    if (s.includes('/empreinte')) return json({ messageMax: 1 });
    if (s.includes('/boite')) return json({ lignes: [], suivant: null, total: null, comptes: {} });
    if (s.includes('/syndics')) return json({ syndics: [] });
    return json(ECRAN);
  }) as unknown as typeof fetch;
});
afterEach(() => { for (const x of racines) { act(() => x.r.unmount()); x.c.remove(); } vi.restoreAllMocks(); });

const calmer = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const gestion = async (adresse: string): Promise<HTMLDivElement> => {
  window.history.replaceState(null, '', `/admin/gestion${adresse}`);
  const c = document.createElement('div'); document.body.appendChild(c); const r = createRoot(c); racines.push({ c, r });
  await act(async () => { r.render(createElement(GestionVue, { location: true })); }); await calmer();
  return c;
};
const clic = async (el: Element | null) => { if (el === null) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const styles = (c: HTMLElement) => [...c.querySelectorAll('style')].map((s) => s.textContent ?? '');
const boutons = (c: HTMLElement) => [...c.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
const ordre = (c: HTMLElement) => [...c.querySelectorAll('.tch-tableau .tch-liste > li')].map((li) => li.textContent ?? '');
const objets = (c: HTMLElement) => ordre(c).map((x) => ['Relancer le plombier', 'Visite', 'État des lieux', 'Clés'].find((o) => x.includes(o)));
const MASQUE_PREAVIS = '.gst-page > .svv-page-head{display:none}';

describe('🔴 1 — pleine page Préavis : sans l’en-tête de la Gestion ; ailleurs, inchangé', () => {
  it('ni « Gestion » ni sa phrase (feuille), ni relève, ni ses quatre boutons, ni les alertes ; « ← Retour à la Gestion » puis le bloc', async () => {
    const c = await gestion('?ecran=preavis');
    expect(styles(c)).toContain(MASQUE_PREAVIS);
    expect(c.querySelector('.gst-bandeau')).toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire', 'À rattacher']) expect(boutons(c)).not.toContain(mot);
    expect(c.textContent).not.toMatch(/Dernière relève|relève automatique est arrêtée|Copie des pièces vers le Drive/i);
    const retour = c.querySelector('.pe-preavis [data-retour-gestion]');
    expect(retour?.textContent).toBe('← Retour à la Gestion');
    expect(retour!.compareDocumentPosition(c.querySelector('.pe-preavis [data-bloc-preavis]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(appels.some((u) => u.includes('/empreinte'))).toBe(false);
    await clic(retour);
    expect(window.location.search).not.toContain('ecran=preavis');
  });
  it('pleine page Tâches : sans l’en-tête de la Gestion, « ← Retour à la Gestion »', async () => {
    const c = await gestion('?ecran=taches');
    expect(c.querySelector('.gst-bandeau')).toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'À rattacher']) expect(boutons(c)).not.toContain(mot);
    expect(c.querySelector('[data-retour-gestion]')?.textContent).toBe('← Retour à la Gestion');
  });
  it('page principale (et écran partagé) : l’en-tête reste, inchangé', async () => {
    for (const adresse of ['', '?ecran=partage']) {
      const c = await gestion(adresse);
      expect(styles(c)).not.toContain(MASQUE_PREAVIS);
      expect(c.textContent).toMatch(/relève automatique est arrêtée/i);
    }
    const s = await gestion('?ecran=syndics');
    expect(s.querySelector('.gst-bandeau')).not.toBeNull();
    for (const mot of ['Relever maintenant', 'Rafraîchir', 'Annuaire', 'À rattacher']) expect(boutons(s)).toContain(mot);
  });
});

describe('🔴 2 — la ligne repliée « Tâches » : « Ouvrir en pleine page », comme sur la ligne « Préavis »', () => {
  it('en bout de ligne, fermée comme ouverte ; ouvre ?ecran=taches', async () => {
    const c = await gestion('?ecran=partage');
    const lien = c.querySelector('[data-bloc-taches="replie"] [data-pleine-page-taches]');
    expect(lien?.textContent).toBe('Ouvrir en pleine page');
    expect(c.querySelector('[data-bloc-preavis-gestion] [data-pleine-page-preavis]')?.textContent).toBe('Ouvrir en pleine page');
    await clic(c.querySelector('[data-repli-taches]'));
    expect(c.querySelector('[data-bloc-taches="ouvert"] [data-pleine-page-taches]')).not.toBeNull();
    await clic(c.querySelector('[data-pleine-page-taches]'));
    expect(window.location.search).toContain('ecran=taches');
    expect(c.querySelector('[data-outils-pleine-page]')).not.toBeNull();
  });
});

describe('🔴 3 — la pleine page Tâches : recherche, tris, filtres cumulables, conservés ; les mêmes données que le bloc', () => {
  it('tri par défaut = l’ordre du bloc ; mêmes tâches, même ordre', async () => {
    const plein = await gestion('?ecran=taches');
    const bloc = await gestion('?ecran=partage');
    await clic(bloc.querySelector('[data-repli-taches]'));
    expect(objets(plein)).toEqual(objets(bloc));
    expect(objets(plein)).toEqual(['Relancer le plombier', 'Visite', 'État des lieux', 'Clés']);
  });
  it.each([
    ['echeance:asc', ['Relancer le plombier', 'Visite', 'État des lieux', 'Clés']], ['echeance:desc', ['Clés', 'État des lieux', 'Visite', 'Relancer le plombier']],
    ['creation:asc', ['Relancer le plombier', 'État des lieux', 'Visite', 'Clés']], ['creation:desc', ['Clés', 'Visite', 'État des lieux', 'Relancer le plombier']],
  ])('tri %s', async (cle, attendu) => {
    const c = await gestion('?ecran=taches');
    await clic(c.querySelector(`[data-tri-taches="${cle}"]`));
    expect(objets(c)).toEqual(attendu);
  });
  it('filtres cumulables : échéance, bien, collaborateur ; recherche', async () => {
    const c = await gestion('?ecran=taches');
    await clic(c.querySelector('[data-filtre-echeance="retard"]'));
    await clic(c.querySelector('[data-filtre-echeance="jour"]'));
    expect(objets(c)).toEqual(['Relancer le plombier', 'Visite']);
    const bien = c.querySelector('[data-filtre-bien]') as HTMLSelectElement;
    await act(async () => { bien.value = 'avec'; bien.dispatchEvent(new Event('change', { bubbles: true })); }); await calmer();
    expect(objets(c)).toEqual(['Relancer le plombier']);
    await clic(c.querySelector('[data-reinitialiser-taches]'));
    const collab = c.querySelector('[data-filtre-collaborateur]') as HTMLSelectElement;
    await act(async () => { collab.value = 'Paul Test'; collab.dispatchEvent(new Event('change', { bubbles: true })); }); await calmer();
    expect(objets(c)).toEqual(['État des lieux']);
    await clic(c.querySelector('[data-reinitialiser-taches]'));
    const champ = c.querySelector('[data-recherche-taches]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'lilas'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(objets(c)).toEqual(['Clés']);
  });
  it('🔴 Arno (11/11/2026, lot C) — filtre par TYPE : Tous / RDV / Tâche ; les tâches d’avant (sans type) sont des « Tâche » ; « Réinitialiser » le remet', async () => {
    taches = taches.map((t) => (t.id === 3 ? { ...t, sorte: 'rdv' as const } : t.id === 2 ? { ...t, sorte: 'tache' as const } : t));
    const c = await gestion('?ecran=taches');
    expect([...c.querySelectorAll('[data-filtre-sorte-choix]')].map((b) => b.textContent)).toEqual(['Tous', 'RDV', 'Tâche']);
    await clic(c.querySelector('[data-filtre-sorte-choix="rdv"]'));
    expect(objets(c)).toEqual(['État des lieux']);
    await clic(c.querySelector('[data-filtre-sorte-choix="tache"]'));
    expect(objets(c)).toEqual(['Relancer le plombier', 'Visite', 'Clés']);
    await clic(c.querySelector('[data-reinitialiser-taches]'));
    expect(objets(c)).toHaveLength(4);
  });
  it('les pastilles et filtres du bloc sont conservés en pleine page', async () => {
    const c = await gestion('?ecran=taches');
    expect(c.querySelector('[data-filtre-qui="confiees"]')).not.toBeNull();
    expect(c.querySelector('[data-filtre-statut="refusee"]')).not.toBeNull();
    expect(c.querySelector('[data-action="creer-tache"]')).not.toBeNull();
  });
  it('le tri et les filtres choisis sont conservés au retour sur la page', async () => {
    const c = await gestion('?ecran=taches');
    await clic(c.querySelector('[data-tri-taches="creation:desc"]'));
    await clic(c.querySelector('[data-filtre-echeance="plus_tard"]'));
    await clic(c.querySelector('[data-filtre-echeance="proche"]'));
    expect(JSON.parse(window.localStorage.getItem(CLE_TACHES_PLEINE_PAGE) ?? '{}')).toMatchObject({ tri: { cle: 'creation', sens: 'desc' }, filtres: { echeances: ['plus_tard', 'proche'] } });
    const d = await gestion('?ecran=taches');
    expect(d.querySelector('[data-tri-taches="creation:desc"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(d.querySelector('[data-filtre-echeance="proche"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(objets(d)).toEqual(['Clés', 'État des lieux']);
  });
  it('mise à jour : un geste signalé (et le retour sur l’onglet) relit la même source que le bloc', async () => {
    const c = await gestion('?ecran=taches');
    taches = [...taches, tache({ id: 5, objet: 'Nouvelle', jour: ajouterJours(AUJ, 20) })];
    await act(async () => { signalerTaches(); }); await calmer();
    expect(ordre(c).some((x) => x.includes('Nouvelle'))).toBe(true);
    taches = taches.filter((x) => x.id !== 5);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); }); await calmer();
    expect(ordre(c).some((x) => x.includes('Nouvelle'))).toBe(false);
  });
});
