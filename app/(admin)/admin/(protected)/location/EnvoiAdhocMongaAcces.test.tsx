// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
import { CreationLocataire } from './CreationLocataire';
import { EVENEMENT_ENVOI_LOCATION } from './EnvoiAdhocMonga';
import { Annuaire } from '../gestion/Annuaire';
import { HistoriqueEnvoisLocation } from '../gestion/HistoriqueEnvoisLocation';

/**
 * 🔴 Arno (21/10/2026) — LE BOUTON « ENVOI ADHOC & MONGA » ACCESSIBLE (la fenêtre existante, réutilisée telle quelle) :
 *   A1 « Nouveau locataire » : « Enregistrer et envoyer à ADHOC & MONGA » enregistre comme « Enregistrer » PUIS ouvre la fenêtre
 *      du bail créé — jamais en cas d'échec ; « Enregistrer » seul ne l'ouvre pas ; mêmes conditions d'activation ;
 *   A2 la carte de chaque bien en gestion (fiche propriétaire) : bouton discret À GAUCHE de la réf. WIPPIMMO, seulement si le
 *      bien a un bail en cours ; « Renvoyer… » avec la date en info-bulle ;
 *   A3 l'Historique du bien : « Mail Nouvelle location envoyé à N destinataires par … », avec le message d'accompagnement.
 * Les vrais composants, routes simulées : RIEN NE PART (aucun POST d'envoi).
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });

let container: HTMLDivElement;
let root: Root;
let appels: string[];
let creation: 'ok' | 'refus';
const APERCU = { bailId: 536, objet: 'Nouvelle location', html: '<p>x</p>', texte: 'x', expediteur: 'gestion@criterimmo.fr',
  destinataires: [{ adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion' }], dernierEnvoi: null, envoiPossible: true };

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; creation = 'ok';
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const pilule = (groupe: string, mot: string) => [...container.querySelectorAll(`[aria-label="${groupe}"] button`)].find((b) => b.textContent === mot) as HTMLButtonElement;

describe('A1 — « Nouveau locataire » : « Enregistrer et envoyer à ADHOC & MONGA »', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = decodeURIComponent(String(url));
      appels.push(`${init?.method ?? 'GET'} ${u}`);
      if (init?.method === 'POST') {
        const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (corps.action === 'apercu-lots') return ok({ recap: ['Le logement est loué.'] });
        if (corps.action === 'creer-locataires') {
          return creation === 'ok' ? ok({ locataireIds: [50], reintegrations: [], bailId: 536, drive: { ok: true } })
            : ({ ok: false, status: 409, json: async () => ({ etat: 'refus', motif: 'Un des lots vient d’être loué.' }) }) as unknown as Response;
        }
        return ok(null);
      }
      if (u.includes('nouvelle-location?bail=536')) return ok(APERCU);
      if (u.includes('schemaConditionsEntree')) return ok({ conditions: true, loyer: true, manquantes: [] });
      if (u.includes('honorairesProprietaire=7')) return ok({ etat: 'surface_manquante', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, motif: 'Surface Carrez/Boutin manquante dans la fiche du bien' });
      if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'Appartement', loue: false }]);
      if (u.includes('lotsBail=7')) return ok({ lots: [{ id: 7, role: 'logement', libelle: 'logement', type: null, etage: null, numeroLot: null, porte: null, place: false, occupants: [], noms: [] }], sorte: 'simple', origineLibelle: '' });
      if (u.includes('lot=7')) return ok({ bien: { id: 7, categorie: 'logement' }, complements: { entretienAPrevoir: null, entretiens: [] } });
      return ok([]);
    }) as unknown as typeof fetch;
  });
  const preparer = async () => {
    await act(async () => { root.render(createElement(CreationLocataire)); });
    await calmer();
    const form = container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement;
    const nom = [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await saisir(nom, 'FICTIF');
    const v = form.querySelectorAll('.cp-saisie--valeur');
    await saisir(v[0] as HTMLInputElement, '06 12 34 56 78');
    await saisir(v[1] as HTMLInputElement, 'fictif@exemple.test');
    await clic(form.querySelector('button[type="submit"]')!);
  };
  const choisirBienEtDate = async () => {
    await saisir(container.querySelector('input[data-recherche-bien]') as HTMLInputElement, 'Fictive');
    await calmer();
    await clic(container.querySelector('.loc-choix button')!);
    await calmer();
    await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-11-01');
    await calmer();
    await clic(pilule('Dépôt de garantie', 'Reversé au bailleur'));
    await clic(pilule('Prélèvement', 'Non'));
    await clic(pilule('Garant personne physique', 'Non'));
    await clic(pilule('Assurance loyers impayés', 'Visale'));
    await clic(container.querySelector('[data-entretien-reponse="non"]')!);
    await clic(pilule('Honoraires du locataire', 'Compte bancaire agence'));
    await clic(pilule('Honoraires du propriétaire', 'Compte bancaire gestion'));
    await clic(pilule('Mode de règlement', 'Chèque'));
  };
  const envoyerEtEnregistrer = () => container.querySelector('[data-enregistrer-envoyer]') as HTMLButtonElement;
  const enregistrer = () => container.querySelector('[data-enregistrer-locataire]') as HTMLButtonElement;
  const deroulerAvec = async (b: () => HTMLButtonElement) => { await clic(b()); await calmer(); if (b().textContent?.startsWith('Confirmer')) { await clic(b()); await calmer(); } };

  it('à côté d’« Enregistrer » (avant lui : « Enregistrer » reste à droite), mêmes conditions d’activation', async () => {
    await preparer();
    const barre = container.querySelector('[data-collant]')!;
    const boutons = [...barre.querySelectorAll('a, button')];
    expect(boutons.map((b) => b.textContent)).toEqual(['Annuler', 'Enregistrer et envoyer à ADHOC & MONGA', 'Enregistrer']);
    expect(envoyerEtEnregistrer().disabled).toBe(true);
    expect(enregistrer().disabled).toBe(true);
    await choisirBienEtDate();
    expect(envoyerEtEnregistrer().disabled).toBe(false);
    expect(enregistrer().disabled).toBe(false);
  });

  it('enregistre EXACTEMENT comme « Enregistrer » (récapitulatif, confirmation), PUIS ouvre la fenêtre du bail créé — rien ne part', async () => {
    await preparer();
    await choisirBienEtDate();
    await clic(envoyerEtEnregistrer());
    await calmer();
    expect(container.querySelector('[data-recap-lots]')).not.toBeNull();
    expect(envoyerEtEnregistrer().textContent).toBe('Confirmer et envoyer à ADHOC & MONGA');
    expect(document.querySelector('[data-fenetre-envoi]')).toBeNull();
    await clic(envoyerEtEnregistrer());
    await calmer();
    expect(appels.filter((a) => a.startsWith('POST')).length).toBe(2);
    expect(container.querySelector('[data-apres-enregistrer] [data-envoi-adhoc="536"]')).not.toBeNull();
    expect(document.querySelector('[data-fenetre-envoi]')).not.toBeNull();
    expect(appels).toContain('GET /api/admin/location/nouvelle-location?bail=536');
    expect(appels.filter((a) => a.startsWith('POST /api/admin/location/nouvelle-location'))).toEqual([]);
    // Le gros bouton d'après « Enregistrer » reste.
    expect(container.querySelector('[data-apres-enregistrer] .eam-gros')?.textContent).toBe('Envoi ADHOC & MONGA');
  });

  it('« Enregistrer » seul : le gros bouton apparaît, la fenêtre NE s’ouvre PAS', async () => {
    await preparer();
    await choisirBienEtDate();
    await deroulerAvec(enregistrer);
    expect(container.querySelector('[data-apres-enregistrer] .eam-gros')).not.toBeNull();
    expect(document.querySelector('[data-fenetre-envoi]')).toBeNull();
    expect(appels.filter((a) => a.includes('nouvelle-location'))).toEqual([]);
  });

  it('l’enregistrement ÉCHOUE : la fenêtre ne s’ouvre pas, le motif est dit', async () => {
    creation = 'refus';
    await preparer();
    await choisirBienEtDate();
    await deroulerAvec(envoyerEtEnregistrer);
    expect(document.querySelector('[data-fenetre-envoi]')).toBeNull();
    expect(container.querySelector('[data-apres-enregistrer]')).toBeNull();
    expect(appels.filter((a) => a.includes('nouvelle-location'))).toEqual([]);
  });
});

describe('A2 — la carte de chaque bien en gestion (fiche propriétaire) : bouton discret à gauche de la réf. WIPPIMMO', () => {
  const bien = (id: number, o: Record<string, unknown> = {}) => ({
    id, numero: String(400 + id), adresse: `${id} rue Fictive`, commune: 'Puteaux', codePostal: '92800', nature: 'Appartement', typeBien: 'T2',
    surfaceM2: null, debut: '2024-01-01', fin: null, locataire: 'FICTIF Léa', locataireId: 80 + id, locataireDepuis: '2024-02-01', mails: 0,
    dernierEchange: null, evenementsOuverts: 0, driveDossierId: null, ...o,
  });
  let lus: string[];
  beforeEach(() => {
    lus = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      lus.push(u);
      if (u.includes('/api/admin/gestion/annuaire?proprietaire=')) {
        return reponse({ etat: 'ok', data: {
          id: 9, cle: 'P9', nom: 'MARTIN Paul', civilite: 'M.', adresse: null, commune: null, codePostal: null, relationDepuis: null, absent: false,
          contacts: [], driveDossierId: null, lots: [], personnes: [], modifiable: false, suppressionDisponible: false,
          biens: [bien(1), bien(2), bien(3, { locataire: null, locataireId: null }), bien(4, { fin: '2025-01-01' })],
        } });
      }
      if (u.includes('/api/admin/location/nouvelle-location?lots=')) {
        return reponse({ etat: 'ok', data: {
          1: { bailId: 701, entree: '2024-02-01', dernierEnvoi: null },
          2: { bailId: 702, entree: '2025-03-01', dernierEnvoi: { quand: '2026-10-21T12:32:00Z', par: 'Arno JOREL', destinataires: ['a@x.fr'], objet: 'o', mention: 'Envoyé le 21/10/2026 à 14:32 par Arno JOREL à a@x.fr' } },
        } });
      }
      if (u.includes('nouvelle-location?bail=701')) return reponse({ etat: 'ok', data: { ...APERCU, bailId: 701 } });
      return reponse({ etat: 'inconnu' });
    }));
  });
  const monter = async () => {
    await act(async () => { root.render(createElement(Annuaire as never, { fiche: { sorte: 'proprietaire', id: 9 }, onFiche: () => {}, onRetour: () => {} })); });
    await calmer();
  };
  const carteDe = (n: number) => [...container.querySelectorAll('li.ann-carte')].find((c) => c.textContent?.includes(`Réf. Wippimmo ${400 + n}`)) as HTMLElement;

  it('une seule lecture pour les biens EN GESTION ; bouton seulement si bail en cours ; à gauche, la réf. à droite, même ligne', async () => {
    await monter();
    const lots = lus.filter((u) => u.includes('nouvelle-location?lots='));
    expect(lots).toEqual(['/api/admin/location/nouvelle-location?lots=1,2,3']);
    const bas = carteDe(1).querySelector('[data-carte-bas]') as HTMLElement;
    expect(bas).not.toBeNull();
    expect([...bas.children].map((x) => x.className)).toEqual(['eam eam--discret', 'ann-carte-ref']);
    expect(bas.lastElementChild?.textContent).toBe('Réf. Wippimmo 401');
    expect(bas.querySelector('[data-ouvrir-envoi]')?.textContent).toBe('Envoyer à ADHOC & MONGA');
    expect(bas.querySelector('[data-ouvrir-envoi]')?.getAttribute('title')).toBeNull();
    // Sans bail en cours : la réf. seule, comme avant.
    expect(carteDe(3).querySelector('[data-carte-bas]')).toBeNull();
    expect(carteDe(3).querySelector('[data-ouvrir-envoi]')).toBeNull();
    expect(carteDe(3).querySelector(':scope > .ann-carte-ref')?.textContent).toBe('Réf. Wippimmo 403');
    const css = [...container.querySelectorAll('style')].map((s) => s.textContent).join('');
    expect(css).toContain('.ann-carte-bas{display:flex;align-items:center;justify-content:space-between');
  });

  it('déjà envoyé : « Renvoyer à ADHOC & MONGA », la date en info-bulle', async () => {
    await monter();
    const b = carteDe(2).querySelector('[data-ouvrir-envoi]') as HTMLButtonElement;
    expect(b.textContent).toBe('Renvoyer à ADHOC & MONGA');
    expect(b.getAttribute('title')).toBe('Envoyé le 21/10/2026 à 14:32 par Arno JOREL à a@x.fr');
  });

  it('au clic : la MÊME fenêtre pour ce bail, posée dans <body> (jamais rognée par la carte) ; rien ne part', async () => {
    await monter();
    await clic(carteDe(1).querySelector('[data-ouvrir-envoi]')!);
    await calmer();
    const f = document.querySelector('[data-fenetre-envoi]');
    expect(f).not.toBeNull();
    expect(carteDe(1).contains(f)).toBe(false);
    expect(lus).toContain('/api/admin/location/nouvelle-location?bail=701');
  });
});

describe('A3 — l’Historique du bien : les envois « Nouvelle location »', () => {
  let envois: unknown[];
  let lectures: number;
  beforeEach(() => {
    lectures = 0;
    envois = [
      { id: 2, bailId: 701, quand: '2026-10-21T12:32:00Z', par: 'Arno JOREL', n: 3, message: 'Bonjour Laura,\nle bail démarre le 1er.' },
      { id: 1, bailId: 701, quand: '2026-10-20T08:05:00Z', par: 'Arno JOREL', n: 1, message: null },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/admin/gestion/historique/envois-location?lot=7')) { lectures += 1; return reponse({ etat: 'ok', envois }); }
      return reponse({ etat: 'inconnu' });
    }));
  });
  it('une bande repliable « Envois ADHOC & MONGA (N) » ; dépliée : date, la phrase, le message dessous', async () => {
    await act(async () => { root.render(createElement(HistoriqueEnvoisLocation, { lotId: 7 })); });
    await calmer();
    const bande = container.querySelector('[data-historique-envois-location]') as HTMLElement;
    expect(bande.querySelector('.hdb-replier')?.textContent).toBe('▶Envois ADHOC & MONGA2');
    expect(bande.querySelector('[data-envoi-historique]')).toBeNull();
    await clic(bande.querySelector('.hdb-replier')!);
    const lignes = [...bande.querySelectorAll('[data-envoi-historique]')];
    expect(lignes.map((l) => l.querySelector('.hde-titre')?.textContent)).toEqual([
      'Mail Nouvelle location envoyé à 3 destinataires par Arno JOREL', 'Mail Nouvelle location envoyé à 1 destinataire par Arno JOREL']);
    expect(lignes[0].querySelector('.hde-date')?.textContent).toBe('21/10/2026 à 14:32');
    expect(lignes[0].querySelector('[data-envoi-message]')?.textContent).toBe('Bonjour Laura,\nle bail démarre le 1er.');
    expect(lignes[1].querySelector('[data-envoi-message]')).toBeNull();
  });
  it('aucun envoi : rien ; relue après un envoi réussi sur la même page', async () => {
    envois = [];
    await act(async () => { root.render(createElement(HistoriqueEnvoisLocation, { lotId: 7 })); });
    await calmer();
    expect(container.querySelector('[data-historique-envois-location]')).toBeNull();
    envois = [{ id: 3, bailId: 701, quand: '2026-10-21T13:00:00Z', par: 'Arno JOREL', n: 2, message: null }];
    await act(async () => { window.dispatchEvent(new CustomEvent(EVENEMENT_ENVOI_LOCATION, { detail: 701 })); });
    await calmer();
    expect(lectures).toBe(2);
    expect(container.querySelector('[data-historique-envois-location]')).not.toBeNull();
  });
});
