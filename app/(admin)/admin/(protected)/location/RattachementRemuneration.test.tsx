// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Apporteur } from '../../../../lib/location/suivi/suivi';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/location/outils' }));
const { ModaleParametresLocation } = await import('./ParametresLocation');
const { ConfirmationsEnregistrement } = await import('./ConfirmationsEnregistrement');

/**
 * 🔴 Arno (24/10/2026) — LE RATTACHEMENT ET LA RÉMUNÉRATION DU COLLÈGUE, UN SEUL FORMULAIRE ; RESTER SUR PLACE APRÈS VALIDATION.
 * (1) la question Oui / Non, obligatoire ; (2) Oui → One shot / Récurrent, taux, durée ; (4) après « Confirmer », la modale reste ouverte,
 * même carte, même panneau, même défilement — et la fenêtre verte de la tuile (dont « Voir la fiche » rechargeait la page) ne s'ouvre
 * plus ; (5) un seul résumé du rattachement. Les vrais composants (l'hôte des confirmations compris), routes simulées, données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const json = (corps: unknown) => ({ ok: true, status: 200, json: async () => corps }) as unknown as Response;
let container: HTMLDivElement;
let root: Root;
let posts: { corps: Record<string, unknown>; entetes: Record<string, string> }[];
let apporteurs: Apporteur[];
const EXTERNE = (o: Partial<Apporteur> = {}): Apporteur => ({ id: 4, nom: 'Hélène Beketov', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Beketov', prenom: 'Hélène',
  baremes: [{ depuis: '2024-01-01', taux: 0.1, ordre: 1 }], collegues: [{ depuis: '0001-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }], remunerations: [], ...o });
const ORPHELIN: Apporteur = { id: 11, nom: 'Hugo Exemple', type: 'partenaire', archive: false, compteId: null, nomFamille: 'Exemple', prenom: 'Hugo', baremes: [], collegues: [], remunerations: [] };

beforeEach(() => {
  delete (window as unknown as { __svavConfirmations?: unknown }).__svavConfirmations;   // l'hôte s'installe sur CE fetch simulé
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; apporteurs = [EXTERNE(), ORPHELIN];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ corps, entetes: Object.fromEntries(new Headers(init.headers).entries()) });
      // Le serveur simulé : le rattachement est fait (la relecture le montre).
      if (corps.action === 'rattachement') apporteurs = apporteurs.map((a) => (a.id === corps.apporteurId ? { ...a, collegues: [{ depuis: '2026-10-24', collegueId: 5, collegueLibelle: 'Paul Collègue' }] } : a));
      return json({ etat: 'ok' });
    }
    if (u.includes('vue=dossiers-apporteur')) return json({ etat: 'ok', data: { aujourdhui: '2026-10-24', dossiers: [] } });
    if (u.includes('vue=cumul-apporteur')) return json({ etat: 'ok', data: { total: { nb: 0, ca: 0, commission: 0 }, parAnnee: [], parMois: [] } });
    if (u.includes('vue=totaux-apporteurs')) return json({ etat: 'ok', data: {} });
    if (u.includes('/suivi')) return json({ etat: 'ok', data: { disponible: true, annuaire: true, interne: true, toujours: true, identite: true, passage: true, nomPrenom: true,
      negociateurs: [], regles: [], retrocessions: [], collegues: [{ id: 2, libelle: 'Arnaud Jorel' }, { id: 5, libelle: 'Paul Collègue' }], apporteurs } });
    return json({ etat: 'ok', data: { destinataires: [], destinatairesSaisis: null, versions: [], aujourdhui: '2026-10-24', manquantes: [], archivage: { mois: 24, disponible: true } } });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await calmer(); };
const saisir = async (el: Element, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const fermee = vi.fn();
const annuaire = async () => {
  await act(async () => { root.render(createElement(Fragment, null, createElement(ConfirmationsEnregistrement), createElement(ModaleParametresLocation, { onFermer: fermee }))); });
  await calmer();
  await clic(container.querySelector('[data-onglet="apporteurs"]')!);
};
const panneau = (id: number) => container.querySelector(`[data-apporteur="${id}"] [data-panneau="rattachement"]`)!;
const ouvrirRattachement = async (id: number) => { await clic(container.querySelector(`[data-apporteur-bouton="${id}"][data-panneau-bouton="rattachement"]`)!); return panneau(id); };
const choisirCollegue = async (p: Element, id: string) => {
  await clic(p.querySelector('[data-rattacher-collegue]')!);
  await clic(p.querySelector(`[data-liste-choix] [data-option="${id}"]`)!);
};

describe('🔴 (1) (2) le formulaire de rattachement : la question, puis les options', () => {
  it('a → c dans cet ordre ; aucun choix par défaut : « Enregistrer le rattachement » inactif tant que la question n’est pas tranchée', async () => {
    await annuaire();
    const p = await ouvrirRattachement(11);
    const f = p.querySelector('[data-formulaire-rattachement="rattacher"]')!;
    const ordre = [...f.querySelectorAll('[data-rattacher-collegue], [data-rattacher-toujours], [data-question-honoraires]')].map((x) =>
      x.hasAttribute('data-rattacher-collegue') ? 'a' : x.hasAttribute('data-rattacher-toujours') ? 'b' : 'c');
    expect(ordre).toEqual(['a', 'b', 'c']);
    await choisirCollegue(p, '5');
    const q = p.querySelector('[data-question-honoraires]')!;
    expect(q.querySelector('span')?.textContent).toBe('Paul Collègue touche des honoraires sur l’activité de cet apporteur ?');
    expect([...q.querySelectorAll('[data-reponse]')].map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Non', 'false'], ['Oui', 'false']]);
    const bouton = p.querySelector('[data-enregistrer-rattachement]') as HTMLButtonElement;
    expect(bouton.textContent).toBe('Enregistrer le rattachement');
    expect(bouton.disabled).toBe(true);
    await clic(bouton);
    expect(posts).toEqual([]);
    await clic(q.querySelector('[data-reponse="non"]')!);
    expect(bouton.disabled).toBe(false);
    expect(p.querySelector('[data-remuneration-taux]')).toBeNull();
  });
  it('Oui : One shot / Récurrent, taux location et gestion, durée du récurrent, effet en direct ; le récapitulatif ; UN envoi', async () => {
    await annuaire();
    const p = await ouvrirRattachement(11);
    await choisirCollegue(p, '5');
    await clic(p.querySelector('[data-rattacher-toujours]')!);
    await saisir(p.querySelector('[data-rattacher-depuis]')!, '2026-11-01');
    await clic(p.querySelector('[data-reponse="oui"]')!);
    expect([...p.querySelectorAll('[data-mode]')].map((b) => b.textContent)).toEqual(['One shot', 'Récurrent']);
    expect(p.querySelector('[data-remuneration-taux]')).not.toBeNull();
    expect(p.querySelector('[data-remuneration-taux-gestion]')).not.toBeNull();
    expect(p.querySelector('[data-duree-recurrent]')).toBeNull();
    await clic(p.querySelector('[data-mode="recurrent"]')!);
    expect(p.querySelector('[data-duree-recurrent]')).not.toBeNull();
    await saisir(p.querySelector('[data-remuneration-taux]')!, '5');
    await saisir(p.querySelector('[data-remuneration-taux-gestion]')!, '10');
    await clic(p.querySelector('[data-duree-indeterminee]')!);
    await saisir(p.querySelector('[data-duree-annees]')!, '3');
    expect(p.querySelector('[data-effet-reglage="collegue"]')).not.toBeNull();
    await clic(p.querySelector('[data-enregistrer-rattachement]')!);
    expect(posts).toEqual([]);
    expect([...p.querySelectorAll('[data-recap-rattachement] [data-recap-ligne]')].map((l) => l.textContent).slice(0, 3)).toEqual([
      'Collègue : Paul Collègue', 'À partir du : 01/11/2026', 'Rémunération : Oui — Récurrent — location 5 %, gestion 10 % / mois, pendant 3 ans']);
    await clic(p.querySelector('[data-recap-confirmer]')!);
    expect(posts.map((x) => x.corps)).toEqual([{ action: 'rattachement', apporteurId: 11, rattachement: { sorte: 'rattacher', collegueId: 5, depuis: '2026-11-01',
      remuneration: { remunere: true, mode: 'recurrent', taux: '5', tauxGestion: '10', dureeAnnees: '3' } } }]);
  });
});

describe('🔴 (4) rester sur place après validation', () => {
  it('la modale reste ouverte, même carte, même panneau, même défilement ; pas de fenêtre verte ; « Rattachement enregistré » près du bouton', async () => {
    await annuaire();
    const p0 = await ouvrirRattachement(4);
    const corps = container.querySelector('.plo-corps') as HTMLElement;
    corps.scrollTop = 420;
    window.scrollTo = vi.fn();
    await choisirCollegue(p0, '5');
    await saisir(p0.querySelector('[data-rattacher-depuis]')!, '2026-10-24');
    await clic(p0.querySelector('[data-reponse="non"]')!);
    await clic(p0.querySelector('[data-enregistrer-rattachement]')!);
    await clic(p0.querySelector('[data-recap-confirmer]')!);
    await calmer();
    expect(posts[0].entetes['x-svav-confirmation']).toBe('propre');            // la carte confirme elle-même
    expect(document.querySelector('[data-modale-issue]')).toBeNull();          // pas de fenêtre verte (son « Voir la fiche » rechargeait la page)
    expect(container.querySelector('[data-modale-parametres]')).not.toBeNull(); // la modale reste ouverte…
    expect(fermee).not.toHaveBeenCalled();
    expect(container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute('data-onglet')).toBe('apporteurs');   // … sur l'annuaire
    const p = panneau(4);                                                        // même carte, même panneau
    expect(p).not.toBeNull();
    expect(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="rattachement"]')?.getAttribute('aria-pressed')).toBe('true');
    expect((container.querySelector('.plo-corps') as HTMLElement).scrollTop).toBe(420);   // même défilement (rien n'a été démonté)
    expect(container.querySelector('.plo-corps')).toBe(corps);
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(p.querySelector('[data-message-carte="4"]')?.textContent).toBe('✓ Rattachement enregistré');
    // La carte se met à jour sur place (relue sans recharger) : le nouveau collègue est dans le résumé.
    expect(p.querySelector('[data-resume-rattachement="4"]')?.textContent).toContain('Paul Collègue');
  });
  it('filtre « À rattacher » : la carte rattachée laisse un message à sa place, le filtre et le tri sont gardés', async () => {
    await annuaire();
    await clic(container.querySelector('[data-filtre-a-rattacher]')!);
    expect([...container.querySelectorAll('[data-apporteur]')].map((x) => x.getAttribute('data-apporteur'))).toEqual(['11']);
    const p = await ouvrirRattachement(11);
    await choisirCollegue(p, '5');
    await clic(p.querySelector('[data-reponse="non"]')!);
    await clic(p.querySelector('[data-enregistrer-rattachement]')!);
    await clic(p.querySelector('[data-recap-confirmer]')!);
    await calmer();
    expect(container.querySelector('[data-filtre-a-rattacher]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-apporteur-sorti-filtre="11"]')?.textContent).toBe('✓ EXEMPLE Hugo : rattachement enregistré — n’apparaît plus dans ce filtre « À rattacher ».');
    expect(container.querySelector('[data-modale-parametres]')).not.toBeNull();
  });
});

describe('🔴 (4 bis) Taux et Fiche : même chose', () => {
  it('« Taux » : après Confirmer, le panneau reste ouvert, « Nouveau taux enregistré » près du bouton, pas de fenêtre verte', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="taux"]')!);
    const t = container.querySelector('[data-apporteur="4"] [data-panneau="taux"]')!;
    await saisir(t.querySelector('[data-version-taux]')!, '12');
    await clic(t.querySelector('[data-enregistrer-version]')!);
    await clic(t.querySelector('[data-recap-confirmer]')!);
    await calmer();
    expect(posts[0].entetes['x-svav-confirmation']).toBe('propre');
    expect(document.querySelector('[data-modale-issue]')).toBeNull();
    expect(container.querySelector('[data-apporteur="4"] [data-panneau="taux"]')).not.toBeNull();
    expect(container.querySelector('[data-apporteur="4"] [data-message-carte="4"]')?.textContent).toBe('✓ Nouveau taux de Hélène Beketov enregistré.');
  });
  it('« Fiche » : après Confirmer, le panneau reste ouvert avec « Fiche enregistrée »', async () => {
    await annuaire();
    await clic(container.querySelector('[data-apporteur-bouton="4"][data-panneau-bouton="fiche"]')!);
    const f = container.querySelector('[data-apporteur="4"] [data-panneau="fiche"]')!;
    await saisir(f.querySelector('[data-fiche-societe]')!, 'Beketov Conseil');
    await clic(f.querySelector('[data-enregistrer-fiche]')!);
    await clic(f.querySelector('[data-recap-confirmer]')!);
    await calmer();
    expect(posts[0].entetes['x-svav-confirmation']).toBe('propre');
    expect(document.querySelector('[data-modale-issue]')).toBeNull();
    expect(container.querySelector('[data-apporteur="4"] [data-panneau="fiche"] [data-message-carte="4"]')?.textContent).toBe('✓ Fiche enregistrée');
  });
});

describe('🔴 (5) un seul résumé du rattachement', () => {
  it('« Rattaché à … » une seule fois hors de l’historique (déroulant) ; la rémunération dans la même ligne', async () => {
    apporteurs = [EXTERNE({ remunerations: [{ depuis: '2021-01-01', remunere: true, mode: 'one_shot', taux: 0.03, tauxGestion: 0, dureeAnnees: null }] }), ORPHELIN];
    await annuaire();
    const p = await ouvrirRattachement(4);
    const horsHistorique = [...p.childNodes].filter((n) => !(n instanceof HTMLDetailsElement)).map((n) => n.textContent ?? '').join(' ');
    expect(horsHistorique.match(/Rattaché à/g)).toHaveLength(1);
    expect(p.querySelectorAll('[data-resume-rattachement]')).toHaveLength(1);
    expect(p.querySelector('[data-resume-rattachement="4"]')?.textContent).toBe('Rattaché à Arnaud Jorel depuis toujours — One shot — location 3 %, gestion 0 %');
    expect(p.querySelector('details[data-historique-rattachement]')?.hasAttribute('open')).toBe(false);
    expect(p.querySelector('[data-historique-remuneration]')?.textContent).toBe('Rémunération : 01/01/2021 → One shot — location 3 %, gestion 0 %');
  });
});
