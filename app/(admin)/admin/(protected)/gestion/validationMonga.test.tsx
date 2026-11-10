// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement, QUESTION_REFUS_ETAPE, TITRE_REFUS_ETAPE } from './FriseAvancement';
import { CarteVive } from './CarteVive';
import type { CarteEvenement } from '../../../../lib/gestion/fileRepo';
import { ecouterFrise } from '../../../../lib/gestion/signalFrise';

/**
 * ══ 🔴🔴 LOT GESTION-VALIDATION-MONGA (Arno, 10/11/2026) — VALIDER / REFUSER UNE ÉTAPE CRÉÉE PAR UN MAIL MONGA ══════════════
 *
 * Vrais composants, routes simulées (`fetch` doublé : aucune base, aucun envoi). On éprouve :
 *   · une étape Monga en attente : carré ROUGE (`fav-carre--doute`) + ✓/✗ ; une étape à la main n'en a jamais ;
 *   · ✓ : la frise se relit (carré à sa couleur, plus de boutons) et prévient l'écran (`signalFrise`) ;
 *   · ✗ : d'abord la fenêtre d'Arno ; « Annuler » n'envoie rien, « Effacer l'étape » envoie le refus ;
 *   · la vignette de la liste : encadré rouge tant qu'au moins une étape attend, éteint à zéro — commun à l'équipe,
 *     indépendant de « Mis à jour par Monga » (badge par collaborateur, inchangé) ;
 *   · le cas GES-2026-000026, reproduit puis corrigé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Etape = Record<string, unknown>;
const etape = (id: number, p: Etape = {}): Etape => ({
  id, reference: 'MNG-25370', type: 'commentaire', survenuLe: '2026-11-06 14:29:52', heureConnue: true, jourConnu: true,
  heureFin: null, numero: null, rang: null, montantCents: null, texte: null, auteur: null, source: 'monga',
  certitude: 'fiable', statut: 'vif', messageId: null, aEuUnMail: false, filId: null, pieceNom: null, creeParLibelle: null,
  creeLe: '2026-11-06 14:30:48', titre: null, rangDevis: null, rangPose: null, poseChoisie: false, ...p,
});

let container: HTMLDivElement;
let root: Root;
let etapes: Etape[];
let appels: { url: string; methode: string; corps: unknown }[];
let signaux: (number | null)[];
let arreterEcoute: () => void;
beforeEach(() => {
  container = document.createElement('div'); container.className = 'svv-adm-root'; document.body.appendChild(container);
  root = createRoot(container);
  appels = []; signaux = [];
  arreterEcoute = ecouterFrise((id) => { signaux.push(id); });
  Element.prototype.scrollIntoView = vi.fn();
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const methode = (init?.method ?? 'GET').toUpperCase();
    const corps = init?.body ? JSON.parse(String(init.body)) as { geste?: string } : undefined;
    appels.push({ url: String(url), methode, corps });
    const m = /\/etapes\/(\d+)$/.exec(String(url));
    if (m && methode === 'PATCH') {
      // La « base » : ✓ confirme, ✗ retire de la frise (l'étape reste, retirée).
      const id = Number(m[1]);
      etapes = corps?.geste === 'ecarter' ? etapes.filter((x) => x.id !== id)
        : etapes.map((x) => (x.id === id ? { ...x, certitude: 'confirmee' } : x));
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', message: 'Fait.' }) } as unknown as Response;
    }
    if (String(url).includes('/frise')) {
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', ouvert: true, ouvertLe: '2026-11-07 14:28:34+01', etapes }) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ etat: 'ok' }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { arreterEcoute(); act(() => root.unmount()); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

const attendre = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); }); };
const rendreFrise = async () => {
  await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 52 })); });
  await attendre();
};
const boutons = (sorte: 'valider' | 'refuser') => [...document.querySelectorAll(`[data-${sorte}-etape]`)] as HTMLButtonElement[];
/** Le carré qui porte ce bouton, et ses classes. */
const carreDe = (b: Element) => b.closest('li')?.querySelector('.fav-carre') as HTMLElement;
const clic = async (el: Element | null) => { await act(async () => { (el as HTMLElement).click(); }); await attendre(); };
const patchs = () => appels.filter((a) => a.methode === 'PATCH');

/** Le cas GES-2026-000026 tel qu'il est en production le 10/11/2026 (diagnostic `.captures/diagnostic-monga-validation/`). */
const GES_26_PROD = (): Etape[] => [
  etape(682, { type: 'commentaire', messageId: 60959 }),
  etape(683, { type: 'ouverture', certitude: 'a_confirmer' }),               // l'Ouverture Monga, à confirmer (décision du 06/10)
  etape(684, { type: 'devis_recu', survenuLe: '2026-11-06 14:35:29', messageId: 60960 }), // « jugé sûr » à l'époque : fiable
  etape(689, { type: 'devis_accepte', survenuLe: '2026-11-07 00:00:00', source: 'manuelle', reference: null }),
  etape(704, { type: 'rdv_intervention', survenuLe: '2026-11-11 17:00:00', source: 'manuelle', reference: null }), // posé à la main
];

describe('🔴🔴 la frise — une étape Monga en attente : carré rouge et ✓/✗ ; une étape à la main jamais', () => {
  it('le cas GES-26 reproduit : seule l’Ouverture Monga « à confirmer » porte les boutons — le RDV posé à la main n’en a pas', async () => {
    etapes = GES_26_PROD();
    await rendreFrise();
    const v = boutons('valider');
    expect(v).toHaveLength(1);
    expect(carreDe(v[0]).textContent).toContain('Ouverture');
    expect(carreDe(v[0]).classList.contains('fav-carre--doute')).toBe(true);
  });

  it('le cas GES-26 corrigé : un rendez-vous créé PAR UN MAIL MONGA naît à valider — carré rouge et ✓/✗ sur LUI', async () => {
    etapes = [...GES_26_PROD().filter((x) => x.id !== 704),
      etape(900, { type: 'rdv_intervention', survenuLe: '2026-11-11 17:00:00', messageId: 61174, certitude: 'a_confirmer' })];
    await rendreFrise();
    const textes = boutons('valider').map((b) => carreDe(b).textContent ?? '');
    expect(textes).toHaveLength(2);
    expect(textes.some((t) => /rendez-vous/i.test(t) || /RDV/i.test(t) || /intervention/i.test(t))).toBe(true);
    for (const b of boutons('valider')) expect(carreDe(b).classList.contains('fav-carre--doute')).toBe(true);
  });

  it('✓ : l’étape est gardée, ses boutons disparaissent, et l’écran est prévenu (la liste se relit)', async () => {
    etapes = [etape(900, { type: 'rdv_intervention', messageId: 61174, certitude: 'a_confirmer' })];
    await rendreFrise();
    await clic(boutons('valider')[0]);
    expect(patchs()).toEqual([{ url: '/api/admin/gestion/etapes/900', methode: 'PATCH', corps: { geste: 'confirmer' } }]);
    expect(signaux).toContain(52);
    expect(boutons('valider')).toHaveLength(0);
    expect(document.querySelectorAll('.fav-carre--doute')).toHaveLength(0);
    expect(etapes).toHaveLength(1);                                           // gardée
  });

  it('✗ : la fenêtre d’Arno d’abord ; « Annuler » n’envoie rien ; « Effacer l’étape » refuse et le carré quitte la frise', async () => {
    etapes = [etape(900, { type: 'rdv_intervention', messageId: 61174, certitude: 'a_confirmer' })];
    await rendreFrise();
    await clic(boutons('refuser')[0]);
    const fenetre = document.querySelector('[role="dialog"], [role="alertdialog"]') ?? document.body;
    expect(fenetre.textContent).toContain(TITRE_REFUS_ETAPE);
    expect(fenetre.textContent).toContain(QUESTION_REFUS_ETAPE);
    expect(QUESTION_REFUS_ETAPE).toBe('Cette étape sera effacée de la frise chronologique de l’événement. Confirmer ?');
    expect(document.querySelector('[data-confirmer-refus-etape]')?.textContent).toBe('Effacer l’étape');
    expect(patchs()).toHaveLength(0);

    await clic(document.querySelector('[data-annuler-refus-etape]'));
    expect(document.querySelector('[data-confirmer-refus-etape]')).toBeNull();
    expect(patchs()).toHaveLength(0);
    expect(boutons('refuser')).toHaveLength(1);

    await clic(boutons('refuser')[0]);
    await clic(document.querySelector('[data-confirmer-refus-etape]'));
    expect(patchs()).toEqual([{ url: '/api/admin/gestion/etapes/900', methode: 'PATCH', corps: { geste: 'ecarter' } }]);
    expect(signaux).toContain(52);
    expect(boutons('refuser')).toHaveLength(0);
  });
});

const CARTE: CarteEvenement = {
  evenementId: 52, reference: 'GES-2026-000026', objet: 'Intervention changement de lave-linge', demandeur: null,
  adresseLibre: null, etat: 'a_traiter', ouvertLe: '2026-11-07T13:28:34Z', dernierEchangeLe: null, nbFils: 1, nbMailsDeplaces: 0,
  attend: false, derniereEtape: null, derniereEtapeMonga: null, mongaMajLe: null, vuLe: null, mongaRefs: ['MNG-25370'],
  categorie: null, urgence: null, nbRecusNonLus: 0, nouveauteLe: null,
  bien: { cle: '1', adresse: '33 rue Cartault', commune: 'PUTEAUX', proprietaire: null, locataire: null }, nbBiens: 1,
};
const rendreCarte = async (c: CarteEvenement) => {
  await act(async () => {
    root.render(createElement(CarteVive, { carte: c, maintenant: new Date('2026-11-10T09:00:00Z'), onOuvrirBien: () => {}, onGeste: () => {} }));
  });
  await attendre();
};
const item = () => container.querySelector('li.gst-item') as HTMLElement;

describe('🔴🔴 la vignette de la liste — encadré rouge = au moins une étape à valider, pour toute l’équipe', () => {
  it('deux étapes en attente : rouge, et c’est écrit ; une seule restante : toujours rouge ; zéro : éteint', async () => {
    await rendreCarte({ ...CARTE, etapesAValider: 2 });
    expect(item().classList.contains('gst-item--monga')).toBe(true);
    expect(container.querySelector('[data-mot-a-valider]')?.textContent).toBe('2 étapes à valider');
    await rendreCarte({ ...CARTE, etapesAValider: 1 });
    expect(item().classList.contains('gst-item--monga')).toBe(true);
    expect(container.querySelector('[data-mot-a-valider]')?.textContent).toBe('1 étape à valider');
    await rendreCarte({ ...CARTE, etapesAValider: 0 });
    expect(item().classList.contains('gst-item--monga')).toBe(false);
    expect(container.querySelector('[data-mot-a-valider]')).toBeNull();
  });

  it('« Mis à jour par Monga » sans étape à valider : le badge reste (par collaborateur), l’encadré ne s’allume PAS', async () => {
    await rendreCarte({ ...CARTE, etapesAValider: 0, mongaMajLe: '2026-11-09T11:23:49Z', vuLe: null,
      derniereEtape: { type: 'commentaire', titre: null, survenuLe: '2026-11-09T11:22:14Z', heureConnue: true, jourConnu: true, source: 'monga', certitude: 'fiable' } as never });
    expect(item().classList.contains('gst-item--monga')).toBe(false);
    expect(container.textContent).toContain('Mis à jour par Monga');
  });

  it('une route d’avant ce lot (champ absent) : rien ne s’allume', async () => {
    await rendreCarte(CARTE);
    expect(item().classList.contains('gst-item--monga')).toBe(false);
  });
});
