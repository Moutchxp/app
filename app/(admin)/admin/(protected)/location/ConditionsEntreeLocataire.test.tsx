// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { CreationLocataire } from './CreationLocataire';
import { POLICE_MIN_INTITULE_PX } from './ConditionsEntree';
import { CreationProprietaires } from './CreationProprietaires';
import { ResumeBailFiche } from '../gestion/ResumeBail';
import { FormulaireCarte } from '../gestion/CartesPersonnes';
import { CSS_LOCATION_CREATION, CSS_LOCATION_ECRANS, CSS_PILULES } from './commun';
import { QUALITES_CONTACT } from '../../../../lib/location/cartesLocation';

/**
 * 🔴 Arno (20/10/2026) — « Nouveau locataire », bloc 3 « Conditions d'entrée » (fiche papier « Nouveau dossier ») :
 *   · choix obligatoires (« Reste à renseigner », Enregistrer bloqué), sous-choix « au 5 / au 10 », champs « préciser »,
 *     total des sommes calculé ; envoyés avec le bail ;
 *   · « Entretien à prévoir » = la donnée DU BIEN (même composant que « Nouveau bien », pré-rempli depuis le bien) ;
 *   · sans la migration 391 : le bloc le dit, et le locataire se crée exactement comme avant ;
 *   · l'encart « Conditions d'entrée » de la fiche du locataire, modifiable par le MÊME formulaire.
 * Les VRAIS composants, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let disponible: boolean;
let categorie: string;
let entretienDuBien: { entretienAPrevoir: boolean | null; entretiens: unknown[] };
/** Le calcul des honoraires propriétaire rendu par le serveur (simulé). */
let calcul: unknown;
/** La migration 370 (loyer de départ) est-elle là ? Et le loyer de départ déjà connu pour le bien. */
let loyerDisponible: boolean;
let loyerConnu: unknown;
const CALCUL_OK = { etat: 'ok', surface: '41.8', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, baremeId: 1, baremeDepuis: '2026-01-01',
  source: 'Arrêté du 17/07/2025', tarifZone: '12.1', tarifEdl: '3.03', visiteBail: '505.78', etatDesLieux: '126.654', total: '632.434' };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; disponible = true; categorie = 'logement'; entretienDuBien = { entretienAPrevoir: null, entretiens: [] }; calcul = CALCUL_OK; loyerDisponible = true; loyerConnu = null;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return ok(corps.action === 'apercu-lots' ? { recap: ['Le logement est loué.'] } : { locataireIds: [50], reintegrations: [] });
    }
    if (u.includes('schemaConditionsEntree')) return ok({ conditions: disponible, loyer: loyerDisponible, manquantes: [...(disponible ? [] : ['391', '392']), ...(loyerDisponible ? [] : ['370'])] });
    if (u.includes('loyerDuBien=7')) return ok(loyerConnu);
    if (u.includes('honorairesProprietaire=7')) return ok(calcul);
    if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'Appartement', loue: false }]);
    if (u.includes('lotsBail=7')) return ok({ lots: [{ id: 7, role: 'logement', libelle: 'logement', type: null, etage: null, numeroLot: null, porte: null, place: false, occupants: [], noms: [] }], sorte: 'simple', origineLibelle: '' });
    if (u.includes('lot=7')) return ok({ bien: { id: 7, categorie }, complements: { ...entretienDuBien } });
    return ok([]);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const pilule = (groupe: string, mot: string) => [...container.querySelectorAll(`[aria-label="${groupe}"] button`)].find((b) => b.textContent === mot) as HTMLButtonElement;
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const soumettre = async () => { await clic(container.querySelector('[data-collant] button[type="submit"]')!); await calmer(); };

/** Un locataire (carte complète enregistrée), le bien 7 choisi et la date d'entrée (obligatoire, Arno 20/10/2026) : il ne reste que le bloc 3. */
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
  await saisir(container.querySelector('input[data-recherche-bien]') as HTMLInputElement, 'Fictive');
  await calmer();
  await clic(container.querySelector('.loc-choix button')!);
  await calmer();
  await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-11-01');
  await calmer();
};
/** Tous les choix obligatoires du bloc 3 (l'entretien du bien compris). */
const toutRepondre = async () => {
  await clic(pilule('Dépôt de garantie', 'Reversé au bailleur'));
  await clic(pilule('Prélèvement', 'Oui'));
  await clic(pilule('Jour du prélèvement', 'au 10'));
  await clic(pilule('Garant personne physique', 'Non'));
  await clic(pilule('Assurance loyers impayés', 'Visale'));
  await clic(container.querySelector('[data-entretien-reponse="non"]')!);
  await clic(pilule('Honoraires du locataire', 'Compte bancaire transaction'));
  await clic(pilule('Honoraires du propriétaire', 'Compte bancaire gestion'));
  await clic(pilule('Mode de règlement', 'Chèque'));
};

describe('🔴 « Nouveau locataire » — bloc 3 « Conditions d’entrée »', () => {
  it('après le bloc 2, en encadrés : les huit points de la fiche papier, dans l’ordre ; mêmes pilules que « Nouveau bien »', async () => {
    await preparer();
    const sections = [...container.querySelectorAll('.loc-section > h3')].map((h) => h.textContent);
    expect(sections.slice(0, 3)).toEqual(['1Le ou les locataires', '2Bien loué', '3Conditions d’entrée']);
    expect([...container.querySelectorAll('.loc-cond-bloc')].map((b) => b.getAttribute('data-cond')))
      // 🔴 Arno (25/10/2026, 423) : « Indice des loyers » juste à droite de « Loyer mensuel ».
      .toEqual(['depot', 'prelevement', 'garanties', 'entretien', 'honoraires', 'loyer', 'indice', 'sommes', 'honoraires-proprietaire', 'reglement', 'commentaire']);
    expect([...container.querySelectorAll('[aria-label="Assurance loyers impayés"] button')].map((b) => b.textContent)).toEqual(['GLI', 'Visale', 'Autre', 'Aucune']);
    expect(container.querySelector('[aria-label="Dépôt de garantie"]')?.className).toBe('loc-pilules');
    // Le même composant de boutons que « Nouveau bien » (aucune copie).
    const src = readFileSync('app/(admin)/admin/(protected)/location/ConditionsEntree.tsx', 'utf8');
    expect(src).toContain("import { LIBELLE_OUI_NON, OUI_NON, Pilules, versOuiNon } from './Pilules';");
    expect(readFileSync('app/(admin)/admin/(protected)/location/CreationBien.tsx', 'utf8')).toContain("from './Pilules';");
  });

  it('OBLIGATOIRES : dans « Reste à renseigner » ; « Enregistrer » n’envoie rien, les messages sont sous les champs', async () => {
    await preparer();
    expect(barre()).toContain('Reste à renseigner : Dépôt de garantie');
    expect(barre()).toContain('Entretien à prévoir : répondez Oui ou Non');
    await soumettre();
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-cond="depot"] .loc-manque')?.textContent).toBe('Dépôt de garantie : conservé par l’agence ou reversé au bailleur ?');
    expect(container.querySelector('[data-cond="reglement"] .loc-manque')?.textContent).toBe('Mode de règlement : Chèque, Virement ou Autre.');
    await toutRepondre();
    expect(barre()).toBe('1 locataire, prêt à enregistrer.');
  });

  it('🔴 BIEN OBLIGATOIRE (Arno, 20/10/2026) : sans bien choisi, « Enregistrer » est inactif et « Reste à choisir » le dit', async () => {
    await act(async () => { root.render(createElement(CreationLocataire)); });
    await calmer();
    const bouton = () => container.querySelector('[data-enregistrer-locataire]') as HTMLButtonElement;
    expect(bouton().disabled).toBe(true);
    const form = container.querySelector('[data-sorte="client"] .cp-form') as HTMLElement;
    const nom = [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === 'Nom')?.querySelector('input') as HTMLInputElement;
    await saisir(nom, 'FICTIF');
    const v = form.querySelectorAll('.cp-saisie--valeur');
    await saisir(v[0] as HTMLInputElement, '06 12 34 56 78');
    await saisir(v[1] as HTMLInputElement, 'fictif@exemple.test');
    await clic(form.querySelector('button[type="submit"]')!);
    await calmer();
    expect(barre()).toBe('Reste à choisir : le bien loué.');
    expect(bouton().disabled).toBe(true);
    await soumettre();
    expect(posts).toEqual([]);
    await saisir(container.querySelector('input[data-recherche-bien]') as HTMLInputElement, 'Fictive');
    await calmer();
    await clic(container.querySelector('.loc-choix button')!);
    await calmer();
    // 🔴 Arno (20/10/2026) : la DATE D'ENTRÉE est obligatoire aussi (le dossier Drive du bail la porte).
    expect(barre()).toBe('Reste à renseigner : la date d’entrée dans les lieux.');
    expect(bouton().disabled).toBe(true);
    const date = container.querySelector('input[data-date-entree]') as HTMLInputElement;
    expect(date.required).toBe(true);
    expect(date.closest('label')?.querySelector('.loc-oblig')?.textContent).toBe('*');
    await saisir(date, '2026-11-01');
    await calmer();
    expect(bouton().disabled).toBe(false);
    // Vidée : de nouveau inactif.
    await saisir(date, '');
    expect(bouton().disabled).toBe(true);
    await soumettre();
    expect(posts).toEqual([]);
  });

  it('DRIVE en échec : le locataire est enregistré, l’écran le dit et renvoie à « Créer le dossier » de la fiche', async () => {
    await preparer();
    await toutRepondre();
    const avant = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
        posts.push(corps);
        if (corps.action !== 'apercu-lots') return ok({ locataireIds: [50], reintegrations: [], drive: { ok: false, motif: 'Drive indisponible (403).' } });
      }
      return (avant as (u: unknown, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await soumettre();
    if (container.querySelector('[data-collant] button[type="submit"]')?.textContent === 'Confirmer') await soumettre();
    expect(container.querySelector('[data-reintegration]')?.textContent)
      .toContain('Le locataire est enregistré, mais le dossier Drive du bail n’a pas été créé : Drive indisponible (403). « Créer le dossier » sur sa fiche le relance.');
  });

  it('🔴 Arno (21/10/2026) — APRÈS « Enregistrer » (bail créé) : l’écran reste et montre le GROS bouton « Envoi ADHOC & MONGA » ; rien n’est envoyé', async () => {
    await preparer();
    await toutRepondre();
    const avant = global.fetch;
    const appels: string[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      appels.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (init?.method === 'POST') {
        const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
        if (corps.action === 'creer-locataires') { posts.push(corps); return ok({ locataireIds: [50], reintegrations: [], bailId: 536, drive: { ok: true } }); }
      }
      return (avant as (u: unknown, i?: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await soumettre();
    if (container.querySelector('[data-collant] button[type="submit"]')?.textContent === 'Confirmer') await soumettre();
    expect(window.location.href).toBe('');
    const bloc = container.querySelector('[data-apres-enregistrer]');
    expect(bloc).not.toBeNull();
    const bouton = bloc?.querySelector('[data-ouvrir-envoi]') as HTMLButtonElement;
    expect(bouton.textContent).toBe('Envoi ADHOC & MONGA');
    expect(bouton.className).toBe('eam-gros');
    expect(container.querySelector('[data-envoi-adhoc="536"]')).not.toBeNull();
    expect(container.querySelector('[data-reintegration] a')?.getAttribute('href')).toBe('/admin/location/locataire/50');
    expect(appels.filter((a) => a.includes('nouvelle-location'))).toEqual([]);
  });

  it('sous-choix « au 1er / au 5 / au 10 / au 15 » : seulement après Oui, exigé ; Non le retire', async () => {
    await preparer();
    expect(container.querySelector('[data-cond-jour]')).toBeNull();
    await clic(pilule('Prélèvement', 'Oui'));
    expect([...container.querySelectorAll('[aria-label="Jour du prélèvement"] button')].map((b) => b.textContent)).toEqual(['au 1er', 'au 5', 'au 10', 'au 15']);
    expect(barre()).toContain('Prélèvement : au 1er, au 5, au 10 ou au 15');
    await clic(pilule('Prélèvement', 'Non'));
    expect(container.querySelector('[data-cond-jour]')).toBeNull();
    expect(barre()).not.toContain('au 10 ou au 15');
  });

  /**
   * 🔴 Arno (23/10/2026) — les 4 jours sur UNE SEULE LIGNE, quelle que soit la largeur (390 px compris) : largeur égale, texte qui
   * suit la ligne, 44 px de haut (jamais sous 40) ; même pilule, même rouge, même coche. Oui / Non au-dessus ne changent pas.
   * (Mesuré dans Chrome sur des lignes de 220 à 700 px : une ligne, rien ne déborde, texte de 11,5 à 16,8 px.)
   */
  it('les 4 jours tiennent sur une ligne : la variante « jour », seulement sur ce choix', async () => {
    await preparer();
    await clic(pilule('Prélèvement', 'Oui'));
    expect(container.querySelector('[aria-label="Jour du prélèvement"]')?.className).toBe('loc-pilules loc-pilules--jour');
    expect(container.querySelector('[aria-label="Prélèvement"]')?.className).toBe('loc-pilules');   // Oui / Non inchangés
    expect(CSS_PILULES).toContain('.loc-pilules--jour{flex-wrap:nowrap;gap:4px;container-type:inline-size;width:100%}');
    expect(CSS_PILULES).toContain('.loc-pilules--jour button{flex:1 1 0;min-width:0;min-height:44px;padding:0 2px;white-space:nowrap;font-size:clamp(.72rem,4.2cqi,1.05rem)}');
    // la coche de sélection reste (avant le mot) ; seule la coche de fin, invisible, est retirée pour gagner la place
    expect(CSS_PILULES).toContain('.loc-pilules--jour button[aria-pressed]::after{content:none}');
    expect(CSS_PILULES).toContain('.loc-pilules button[aria-pressed="true"]::before{visibility:visible}');
  });

  it('« préciser » : GLI et Autre ouvrent un champ obligatoire ; changer de choix le referme', async () => {
    await preparer();
    await toutRepondre();
    await clic(pilule('Assurance loyers impayés', 'GLI'));
    expect(container.querySelector('[data-cond-precision="assurance"] span')?.textContent).toBe('GLI : laquelle ? *');
    expect(barre()).toBe('Reste à renseigner : GLI : précisez laquelle.');
    await saisir(container.querySelector('[data-cond-precision="assurance"] input') as HTMLInputElement, 'Assureur fictif');
    await clic(pilule('Mode de règlement', 'Autre'));
    expect(barre()).toBe('Reste à renseigner : Autre mode de règlement : précisez lequel.');
    await saisir(container.querySelector('[data-cond-precision="reglement"] input') as HTMLInputElement, 'espèces');
    expect(barre()).toBe('1 locataire, prêt à enregistrer.');
    await clic(pilule('Assurance loyers impayés', 'Aucune'));
    expect(container.querySelector('[data-cond-precision="assurance"]')).toBeNull();
  });

  it('TOTAL calculé en direct, au centime ; un montant illisible le dit et bloque', async () => {
    await preparer();
    const somme = (k: string) => container.querySelector(`[data-somme="${k}"] input`) as HTMLInputElement;
    const total = () => container.querySelector('[data-total] strong')?.textContent?.replace(/\s/g, ' ');
    expect(total()).toBe('—');
    await saisir(somme('prorataLoyer'), '412,26');
    await saisir(somme('prorataCharges'), '33,33');
    await saisir(somme('depotGarantie'), '1 180');
    await saisir(somme('honorairesAgence'), '0,1');
    // Arno (24/10/2026) : « Honoraires agence (€ HT) » — 0,10 € HT = 0,12 € TTC, compté en TTC dans les sommes dues
    expect(total()).toBe('1 625,71 €');
    await saisir(somme('honorairesAgence'), '12,345');
    expect(total()).toBe('montant illisible');
    await toutRepondre();
    expect(barre()).toContain('Honoraires agence : un montant en euros, au centime');
  });

  it('ENVOYÉ avec le bail : les conditions (jour 10, montants tels quels) et l’entretien du bien', async () => {
    await preparer();
    await toutRepondre();
    await saisir(container.querySelector('[data-somme="depotGarantie"] input') as HTMLInputElement, '1 180');
    await saisir(container.querySelector('[data-cond="commentaire"] textarea') as HTMLTextAreaElement, 'clés remises');
    await soumettre();
    expect(posts.map((p) => p.action)).toEqual(['apercu-lots']);
    await soumettre();
    const creer = posts.find((p) => p.action === 'creer-locataires')!;
    expect(creer).toMatchObject({ lotId: 7, entretien: { aPrevoir: false, entretiens: [] } });
    expect(creer.conditions).toMatchObject({ depot: 'bailleur', prelevement: true, jour: '10', garant: false, assurance: 'visale',
      honorairesLocataire: 'agence', honorairesProprietaire: 'gestion', reglement: 'cheque', commentaire: 'clés remises' });
    expect((creer.conditions as { sommes: Record<string, string> }).sommes.depotGarantie).toBe('1 180');
  });

  it('ENTRETIEN = la donnée du bien : pré-rempli depuis lui ; absent pour un parking (non exigé)', async () => {
    entretienDuBien = { entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-11-01' }] };
    await preparer();
    expect(container.querySelector('[data-entretien-reponse="oui"]')?.getAttribute('aria-pressed')).toBe('true');
    expect((container.querySelector('[data-entretien="chaudiere"] input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect(container.querySelector('[data-entretien-du-bien]')?.textContent).toContain('le modifier ici le modifie sur sa fiche');
    act(() => { root.unmount(); }); root = createRoot(container);
    categorie = 'parking';
    await preparer();
    expect(container.querySelector('[data-cond="entretien"]')).toBeNull();
    expect(barre()).not.toContain('Entretien');
  });

  it('SANS les migrations 391-392 : le bloc reste affiché avec un bandeau ; seuls ses choix ne sont ni exigés ni envoyés', async () => {
    disponible = false;
    await preparer();
    expect(container.querySelector('[data-conditions-entree]')).not.toBeNull();
    expect(container.querySelector('[data-conditions-sans-migration]')?.textContent).toContain('Mise à jour de la base à appliquer (migration 391 et 392)');
    // L'entretien du bien (379) et le loyer (370) restent enregistrés : ils ne dépendent pas de ces migrations.
    expect(barre()).toBe('Reste à renseigner : Entretien à prévoir : répondez Oui ou Non.');
    await clic(container.querySelector('[data-entretien-reponse="non"]')!);
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, '980');
    expect(barre()).toBe('1 locataire, prêt à enregistrer.');
    await soumettre();
    await soumettre();
    const creer = posts.find((p) => p.action === 'creer-locataires')!;
    expect(creer).not.toHaveProperty('conditions');
    expect(creer).toMatchObject({ entretien: { aPrevoir: false }, loyer: { principal: '980', provisions: '' } });
  });
});

/**
 * 🔴 Arno (20/10/2026) — l'ancien encart « Conditions d'entrée » de la section Location a FUSIONNÉ dans l'encart du bail, en tête
 * de la fiche locataire (`ResumeBail.tsx`) : les mêmes informations (une fois), les mêmes gestes (« Modifier »).
 */
const BAIL = { bailId: 8, enCours: true, termineLe: null, entree: '2026-10-20', bien: { id: 7, adresse: '4 rue Fictive, PUTEAUX' }, lots: [{ id: 7, libelle: '4 rue Fictive, PUTEAUX' }],
  proprietaires: [], colocataires: [], occupationIds: [11, 12], occupationId: 11 };
const txt = (sel: string): string | undefined => container.querySelector(sel)?.textContent?.replace(/\s/g, ' ');
const rendreBail = async (conditions: unknown, loyer: unknown = null) => {
  global.fetch = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
    return ok({ bail: BAIL, loyer, conditions, garants: [], contacts: [], entretiens: null });
  }) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(ResumeBailFiche, { f: { id: 101, modifiable: true } as never, ouvrir: () => {} })); });
  await calmer();
  await clic(container.querySelector('[data-bascule-detail]')!);
};

describe('🔴 fiche du locataire — les conditions d’entrée, dans l’encart du bail', () => {
  const LUES = {
    bailCle: 'bail-x', occupationIds: [11, 12], saisiLe: '2026-10-20 10:00:00+02', saisiPar: 'arno@exemple.fr', modifiees: false, honoraires: null,
    conditions: { depot: 'agence', prelevement: true, jour: 5, garant: true, assurance: 'gli', assurancePrecision: 'Assureur fictif',
      honorairesLocataire: 'agence', honorairesProprietaire: 'agence', sommes: { prorataLoyer: 41226, prorataCharges: null, depotGarantie: 118000, honorairesAgence: null },
      reglement: 'virement', reglementPrecision: null, commentaire: null },
    lignes: [],
  };

  it('en LECTURE : dépôt, prélèvement, sommes, total, qui et quand — une seule fois chacun', async () => {
    await rendreBail(LUES);
    const e = container.querySelector('[data-encart-bail]')!;
    expect(container.querySelector('[data-encart-conditions-entree]')).toBeNull();
    expect(txt('[data-rb="depot"]')).toBe('1 180,00 € — conservé par l’agence');
    expect(txt('[data-rb="prelevement"]')).toBe('oui, au 5');
    expect(txt('[data-rb="total-du"]')).toBe('1 592,26 €');
    expect(e.querySelector('[data-rb="saisie"]')?.textContent).toBe('saisies le 20/10/2026 par arno@exemple.fr');
    expect(e.querySelector('[data-rb="assurance"]')?.textContent).toBe('Assurance loyers impayés : GLI — Assureur fictif');
    expect(e.querySelectorAll('[data-conditions-bail]')).toHaveLength(1);
  });

  it('« Modifier » : le MÊME formulaire, pré-rempli ; Enregistrer envoie « conditions-entree » pour ce bail', async () => {
    await rendreBail(LUES);
    await clic(container.querySelector('[data-modifier-conditions]')!);
    expect(container.querySelector('[data-conditions-entree]')).not.toBeNull();
    expect(pilule('Jour du prélèvement', 'au 5').getAttribute('aria-pressed')).toBe('true');
    expect((container.querySelector('[data-cond-precision="assurance"] input') as HTMLInputElement).value).toBe('Assureur fictif');
    expect((container.querySelector('[data-somme="prorataLoyer"] input') as HTMLInputElement).value).toBe('412,26');
    expect(container.querySelector('[data-cond="entretien"]')).toBeNull();
    await clic(pilule('Prélèvement', 'Non'));
    await clic(container.querySelector('[data-enregistrer-conditions]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'conditions-entree', occupationId: 11, conditions: { prelevement: false, jour: null, depot: 'agence' } });
  });

  it('un choix vidé : refusé à l’écran, rien n’est envoyé', async () => {
    await rendreBail(LUES);
    await clic(container.querySelector('[data-modifier-conditions]')!);
    await clic(pilule('Dépôt de garantie', 'Conservé par l’agence'));
    await clic(container.querySelector('[data-enregistrer-conditions]')!);
    expect(posts).toEqual([]);
    expect(container.querySelector('[data-cond="depot"] .loc-manque')).not.toBeNull();
  });

  it('aucune condition saisie : l’encart le dit, sans geste « Modifier »', async () => {
    await rendreBail(null);
    expect(container.querySelector('[data-rb="saisie"]')?.textContent).toBe('aucune condition d’entrée enregistrée');
    expect(container.querySelector('[data-modifier-conditions]')).toBeNull();
  });
});

describe('🔴 retouches du 20/10/2026 — dépôt, jours, garants, coche réservée, honoraires propriétaire', () => {
  const champ = (sel: string) => container.querySelector(sel) as HTMLInputElement;

  it('DÉPÔT : le montant s’ouvre sous le choix ; JUMEAU de « Dépôt de garantie (€) » des sommes dues (une seule donnée)', async () => {
    await preparer();
    expect(container.querySelector('[data-depot-montant]')).toBeNull();
    await clic(pilule('Dépôt de garantie', 'Conservé par l’agence'));
    expect(container.querySelector('[data-depot-montant] .loc-intitule')?.firstChild?.textContent).toBe('Montant du dépôt de garantie');
    await saisir(champ('[data-depot-montant] input'), '1 180');
    expect(champ('[data-somme="depotGarantie"] input').value).toBe('1 180');
    await saisir(champ('[data-somme="depotGarantie"] input'), '1 250,50');
    expect(champ('[data-depot-montant] input').value).toBe('1 250,50');
    await clic(pilule('Dépôt de garantie', 'Reversé au bailleur'));
    expect(champ('[data-depot-montant] input').value).toBe('1 250,50');
  });

  it('GARANT : un contact « Garant » du bloc 1 coche « Oui » d’office et s’affiche (NOM Prénom) ; Non reste possible', async () => {
    await preparer();
    await clic([...container.querySelectorAll('button')].find((b) => b.textContent === '+ Ajouter…')!);
    await clic([...container.querySelectorAll('[data-choix] button')].find((b) => b.textContent === 'Contact du locataire')!);
    const form = container.querySelector('[data-sorte="contact"] .cp-form') as HTMLElement;
    const mot = (m: string) => [...form.querySelectorAll('label.cp-champ')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === m)?.querySelector('input') as HTMLInputElement;
    await saisir(mot('Nom'), 'Garantfictif');
    await saisir(mot('Prénom'), 'Paul');
    const menu = form.querySelector('[data-qualite-menu] select') as HTMLSelectElement;
    await act(async () => { menu.value = 'Garant'; menu.dispatchEvent(new Event('change', { bubbles: true })); });
    const v = form.querySelectorAll('.cp-saisie--valeur');
    await saisir(v[0] as HTMLInputElement, '06 98 76 54 32');
    await saisir(v[1] as HTMLInputElement, 'garant@exemple.test');
    expect(pilule('Garant personne physique', 'Oui').getAttribute('aria-pressed')).toBe('false');
    await clic(form.querySelector('button[type="submit"]')!);
    expect(pilule('Garant personne physique', 'Oui').getAttribute('aria-pressed')).toBe('true');
    expect([...container.querySelectorAll('[data-garants] li')].map((l) => l.textContent)).toEqual(['GARANTFICTIF Paul']);
    expect(container.querySelector('[data-ajouter-garant]')).toBeNull();
    await clic(pilule('Garant personne physique', 'Non'));
    expect(pilule('Garant personne physique', 'Non').getAttribute('aria-pressed')).toBe('true');
  });

  it('« Oui » sans garant connu : « Ajouter un garant » ouvre la carte « Contact du locataire », qualité « Garant » déjà choisie', async () => {
    await preparer();
    expect(container.querySelector('[data-ajouter-garant]')).toBeNull();
    await clic(pilule('Garant personne physique', 'Oui'));
    await clic(container.querySelector('[data-ajouter-garant]')!);
    await calmer();
    const cartes = container.querySelectorAll('[data-sorte="contact"] .cp-form');
    expect(cartes).toHaveLength(1);
    expect((cartes[0].querySelector('[data-qualite-menu] select') as HTMLSelectElement).value).toBe('Garant');
    expect(cartes[0].querySelectorAll('.cp-saisie--valeur')).toHaveLength(2);
  });

  it('QUALITÉ : menu « Garant » d’abord … « Personnalisé » (texte libre) ; une ancienne qualité libre reste telle quelle', async () => {
    const rendreCarte = async (qualite: string | null) => {
      await act(async () => {
        root.render(createElement(FormulaireCarte, {
          p: qualite === null ? null : { civilite: null, prenom: null, nom: 'X', qualite, adresse: null, codePostal: null, commune: null, note: null, contacts: [] },
          refus: null, onEnregistrer: async () => {}, onAnnuler: () => {}, contact: { titre: 'Nouveau contact du locataire', rappel: '' },
          qualiteEnAvant: 'ex. Garant, conjoint, artisan, avocat, voisin… ou « Personnalisé »', qualitesProposees: QUALITES_CONTACT,
        }));
      });
    };
    await rendreCarte(null);
    const menu = () => container.querySelector('[data-qualite-menu] select') as HTMLSelectElement;
    expect([...menu().options].map((o) => o.textContent)).toEqual(['— choisir —', 'Garant', 'Conjoint', 'Artisan', 'Avocat', 'Voisin', 'Personnalisé']);
    expect(container.querySelector('.cp-aide-qualite')?.textContent?.startsWith('ex. Garant')).toBe(true);
    expect(container.querySelector('[data-qualite-perso]')).toBeNull();
    await act(async () => { menu().value = 'personnalise'; menu().dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('[data-qualite-perso]')).not.toBeNull();
    // Une qualité déjà saisie hors de la liste : « Personnalisé », le texte tel quel (aucune perte).
    act(() => { root.unmount(); }); root = createRoot(container);
    await rendreCarte('Employeur');
    expect(menu().value).toBe('personnalise');
    expect((container.querySelector('[data-qualite-perso]') as HTMLInputElement).value).toBe('Employeur');
    act(() => { root.unmount(); }); root = createRoot(container);
    await rendreCarte('garant');
    expect(menu().value).toBe('Garant');
  });

  it('🔴 Arno (21/10/2026) — TEXTE CENTRÉ dans tous les boutons de choix (pilules, bascules, sous-motifs) : coche à gauche, même place réservée à droite', () => {
    const origine = readFileSync('app/(admin)/admin/(protected)/location/QuestionOrigine.tsx', 'utf8');
    for (const [css, sel] of [[CSS_LOCATION_CREATION, '.loc-pilules button[aria-pressed]'], [origine, '.qo-pilule[aria-checked]']] as const) {
      expect(css).toContain(`${sel}::before{content:"✓\u00a0";visibility:hidden}`);
      expect(css).toContain(`${sel}::after{content:"\u00a0✓";visibility:hidden}`);
    }
    expect(CSS_LOCATION_ECRANS).toContain('.loc-bascule button[aria-pressed="true"]::before{visibility:visible}');
    // La bascule : la coche en absolu, dans une marge symétrique (le texte reste centré même sur deux lignes).
    expect(CSS_LOCATION_ECRANS).toContain('.loc-bascule button[aria-pressed]{position:relative;padding:0 calc(14px + 1em)}');
    expect(CSS_LOCATION_ECRANS).toContain('.loc-bascule button[aria-pressed]::before{content:"✓";position:absolute;left:14px;');
    expect(origine).toContain('.qo-pilule[aria-checked="true"]::before{visibility:visible}');
    // Arno (21/10/2026) — la fiche locataire de la GESTION charge aussi la feuille des pilules (formulaire « Modifier »).
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx', 'utf8')).toContain('<style>{CSS_LOCATION_ECRANS + CSS_PILULES + CSS_CONDITIONS + CSS_SECTIONS}</style>');
    expect(CSS_LOCATION_CREATION).toContain(CSS_PILULES);
  });

  it('BOUTONS SUR UNE LIGNE : la place de la coche est réservée dans TOUT bouton à choix (visible seulement sur le choix)', async () => {
    expect(CSS_LOCATION_CREATION).toContain('.loc-pilules button[aria-pressed]::before{content:"✓\u00a0";visibility:hidden}');
    expect(CSS_LOCATION_CREATION).toContain('.loc-pilules button[aria-pressed="true"]::before{visibility:visible}');
    // Arno (21/10/2026) — TEXTE CENTRÉ : la même place, toujours invisible, à DROITE (écarts gauche et droit égaux).
    expect(CSS_LOCATION_CREATION).toContain('.loc-pilules button[aria-pressed]::after{content:"\u00a0✓";visibility:hidden}');
    await preparer();
    // Chaque bouton à choix porte aria-pressed (donc la place réservée), sélectionné ou non.
    const choix = [...container.querySelectorAll('[data-conditions-entree] .loc-pilules button')];
    expect(choix.length).toBeGreaterThan(15);
    expect(choix.filter((b) => !b.hasAttribute('aria-pressed') && !b.hasAttribute('data-ajouter-entretien'))).toEqual([]);
  });

  it('HONORAIRES PROPRIÉTAIRE : les lignes calculées, la zone et le tarif utilisés ; « Total des honoraires » = agence + propriétaire', async () => {
    await preparer();
    const bloc = container.querySelector('[data-cond="honoraires-proprietaire"]') as HTMLElement;
    expect([...bloc.querySelectorAll('dt')].map((x) => x.querySelector('.loc-champ-tete')?.firstChild?.textContent)).toEqual(['Visite, dossier, rédaction du bail', 'État des lieux d’entrée', 'Total honoraires propriétaire']);
    expect([...bloc.querySelectorAll('dd')].map((x) => x.textContent?.replace(/\s/g, ' '))).toEqual(['505,78 € TTC', '126,65 € TTC', '632,43 € TTC']);   // Arno (24/10/2026) : à côté d'un champ en HT, le barème se dit TTC
    // La formule est dans la bulle « Détail du calcul » (Arno, 20/10/2026), plus sous la ligne.
    expect(bloc.querySelector('dt small')).toBeNull();
    await clic(bloc.querySelector('dt .svv-pil-ib-btn')!);
    expect(bloc.querySelector('[data-detail-calcul]')?.textContent?.replace(/\s/g, ' ')).toBe('41,8 m² × 12,10 €/m² (zone très tendue)= 505,78 €');
    expect(bloc.querySelector('[data-zone-tarif]')?.textContent?.replace(/\s/g, ' ')).toContain('Zone : zone très tendue — tarif 12,10 €/m², état des lieux 3,03 €/m² ; barème du 01/01/2026');
    const total = () => container.querySelector('[data-total-honoraires] strong')?.textContent?.replace(/\s/g, ' ');
    expect(total()).toBe('632,43 €');
    await saisir(container.querySelector('[data-somme="honorairesAgence"] input') as HTMLInputElement, '450');
    expect(total()).toBe('1 172,43 €');   // 450 € HT d'honoraires agence = 540 € TTC, + 632,43 € (Arno, 24/10/2026)
  });

  it('le calcul est demandé pour le bien ET la date d’entrée (barème de cette date)', async () => {
    await preparer();
    await saisir(container.querySelector('input[type="date"][form]') as HTMLInputElement, '2026-11-01');
    await calmer();
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => decodeURIComponent(String(c[0])));
    expect(urls.some((u) => u.includes('honorairesProprietaire=7&entree=2026-11-01'))).toBe(true);
  });

  it('SURFACE MANQUANTE : le dit, avec le lien vers la fiche du bien ; aucun calcul inventé', async () => {
    calcul = { etat: 'surface_manquante', zone: 'autre', date: '2026-10-20', dateSupposee: true, motif: 'Surface Carrez/Boutin manquante dans la fiche du bien' };
    await preparer();
    const m = container.querySelector('[data-surface-manquante]') as HTMLElement;
    expect(m.textContent).toBe('Surface Carrez/Boutin manquante dans la fiche du bien. Ouvrir la fiche du bien');
    expect(m.querySelector('a')?.getAttribute('href')).toBe('/admin/location/bien/7');
    expect(container.querySelector('[data-cond="honoraires-proprietaire"] dd')).toBeNull();
    expect(container.querySelector('[data-total-honoraires] strong')?.textContent).toBe('—');
  });

  it('« Surface Carrez » devient « Surface Carrez/Boutin m² » partout (fiche, Nouveau bien, cartes) — la donnée ne change pas', () => {
    const lire = (f: string) => readFileSync(f, 'utf8');
    for (const f of ['app/(admin)/admin/(protected)/location/CreationBien.tsx', 'app/(admin)/admin/(protected)/location/CreationProprietaireBien.tsx',
      'app/(admin)/admin/(protected)/gestion/SectionsLocationFiche.tsx', 'app/lib/location/sortieLocataires.ts']) {
      expect(lire(f), f).toContain('Surface Carrez/Boutin m²');
      expect(lire(f), f).not.toMatch(/'Surface Carrez \(m²\)'|'Surface Carrez'|'Surface \(Carrez\)'/);
    }
    expect(lire('app/lib/location/locationBien.ts')).toContain('`Carrez/Boutin ${m2(b.surfaceCarrezM2)}`');
  });
});

describe('🔴 retouches — biens libres d’abord, loyer mensuel, bandeau de migration', () => {
  it('« Bien loué » : « Libre » en vert, « déjà loué » en rouge — le MOT toujours écrit ; l’ordre du serveur (libres d’abord) est gardé', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string | URL | Request) => (String(url).includes('biensPourLocataire=')
      ? ok([{ id: 7, titre: '4 rue Fictive', detail: 'Appartement', loue: false }, { id: 8, titre: '1 rue Autre', detail: 'Studio', loue: true }]) : ok([])));
    await act(async () => { root.render(createElement(CreationLocataire)); });
    await calmer();
    const etats = [...container.querySelectorAll('.loc-choix [data-etat-bien]')];
    expect(etats.map((e) => [e.textContent, e.className])).toEqual([
      ['Libre', 'loc-etat-bien loc-etat-bien--libre'], ['déjà loué', 'loc-etat-bien loc-etat-bien--loue']]);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.loc-etat-bien--libre{color:var(--color-svv-green-ink)}');
    expect(css).toContain('.loc-etat-bien--loue{color:var(--color-svv-red)}');
  });

  it('LOYER MENSUEL : juste avant « Sommes dues » ; total charges comprises au centime exact ; montant illisible signalé', async () => {
    await preparer();
    const ordre = [...container.querySelectorAll('.loc-cond-bloc')].map((b) => b.getAttribute('data-cond'));
    // 423 : « Indice des loyers » à sa droite, puis « Sommes dues ».
    expect([ordre.indexOf('loyer'), ordre.indexOf('indice')]).toEqual([ordre.indexOf('sommes') - 2, ordre.indexOf('sommes') - 1]);
    const total = () => container.querySelector('[data-total-loyer] strong')?.textContent?.replace(/\s/g, ' ');
    expect(total()).toBe('—');
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, '1 180,10');
    await saisir(container.querySelector('[data-loyer="provisions"] input') as HTMLInputElement, '0,2');
    expect(total()).toBe('1 180,30 €');
    await saisir(container.querySelector('[data-loyer="provisions"] input') as HTMLInputElement, '9,999');
    expect(total()).toBe('montant illisible');
    expect(barre()).toContain('Provision pour charges : un montant en euros, au centime');
  });

  it('PRÉ-REMPLI avec le loyer de départ déjà connu du bien (et dit d’où il vient) ; modifiable ; envoyé avec le bail', async () => {
    loyerConnu = { principal: 98000, provisions: 9050, entree: '2023-09-01' };
    await preparer();
    expect((container.querySelector('[data-loyer="principal"] input') as HTMLInputElement).value).toBe('980');
    expect((container.querySelector('[data-loyer="provisions"] input') as HTMLInputElement).value).toBe('90,50');
    expect(container.querySelector('[data-loyer-note]')?.textContent).toBe('Pré-rempli avec le loyer de départ de la location précédente (entrée le 01/09/2023) — modifiable.');
    expect(container.querySelector('[data-total-loyer] strong')?.textContent?.replace(/\s/g, ' ')).toBe('1 070,50 €');
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, '1 000');
    await toutRepondre();
    await soumettre();
    await soumettre();
    expect(posts.find((p) => p.action === 'creer-locataires')).toMatchObject({ loyer: { principal: '1 000', provisions: '90,50' } });
  });

  it('SANS la migration 370 : l’encadré « Loyer mensuel » reste, champs désactivés, bandeau « migration 370 » ; rien n’est envoyé pour lui', async () => {
    loyerDisponible = false;
    await preparer();
    expect(container.querySelector('[data-loyer-sans-migration]')?.textContent).toBe('Mise à jour de la base à appliquer (migration 370) : le loyer mensuel ne sera pas enregistré.');
    expect((container.querySelector('[data-loyer="principal"] input') as HTMLInputElement).disabled).toBe(true);
    await toutRepondre();
    await soumettre();
    await soumettre();
    expect(posts.find((p) => p.action === 'creer-locataires')).not.toHaveProperty('loyer');
  });

  it('FICHE : le loyer du bail s’affiche dans l’encart et se rouvre dans « Modifier »', async () => {
    await rendreBail({ bailCle: 'b', occupationIds: [11], saisiLe: '2026-10-20 10:00:00+02', saisiPar: 'x', modifiees: false, honoraires: null,
      loyer: { principal: 98000, provisions: 9050 },
      conditions: { depot: 'agence', prelevement: false, jour: null, garant: false, assurance: 'aucune', assurancePrecision: null, honorairesLocataire: 'agence',
        honorairesProprietaire: 'agence', sommes: { prorataLoyer: null, prorataCharges: null, depotGarantie: null, honorairesAgence: null },
        reglement: 'cheque', reglementPrecision: null, commentaire: null }, lignes: [] }, { principal: 98000, provisions: 9050 });
    expect([txt('[data-rb="loyer-principal"]'), txt('[data-rb="provisions"]'), txt('[data-rb="total-cc"]')]).toEqual(['980,00 €', '90,50 €', '1 070,50 € / mois']);
    await clic(container.querySelector('[data-modifier-conditions]')!);
    expect((container.querySelector('[data-loyer="principal"] input') as HTMLInputElement).value).toBe('980');
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, '1000');
    await clic(container.querySelector('[data-enregistrer-conditions]')!);
    expect(posts.at(-1)).toMatchObject({ action: 'conditions-entree', occupationId: 11, conditions: { loyer: { principal: '1000', provisions: '90,50' } } });
  });
});

describe('🔴 retouches — confirmation de retrait, ordre du contact, prorata calculé', () => {
  const somme = (k: string) => container.querySelector(`[data-somme="${k}"] input`) as HTMLInputElement;
  const sous = (k: string) => container.querySelector(`[data-somme="${k}"] .loc-aide-prorata`)?.textContent?.replace(/\s/g, ' ');
  /** Ouvre la bulle « Détail du calcul » du champ, rend son texte, puis la referme (nouveau clic sur le picto). */
  const detail = async (k: string): Promise<string | undefined> => {
    const picto = container.querySelector(`[data-somme="${k}"] .svv-pil-ib-btn`) as HTMLButtonElement;
    await clic(picto);
    const t = container.querySelector(`[data-detail-calcul="${k}"]`)?.textContent?.replace(/\s/g, ' ');
    await clic(picto);
    return t;
  };
  const dateEntree = () => container.querySelector('input[type="date"][form]') as HTMLInputElement;
  const loyerMensuel = async (principal: string, provisions: string) => {
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, principal);
    await saisir(container.querySelector('[data-loyer="provisions"] input') as HTMLInputElement, provisions);
  };

  it('« Retirer cette carte » demande CONFIRMATION (Retirer / Annuler) ; rien n’est retiré sans elle', async () => {
    await preparer();
    const carte = () => container.querySelector('[data-recap="client"]');
    await clic([...carte()!.querySelectorAll('button')].find((b) => b.textContent === 'Retirer cette carte')!);
    const c = container.querySelector('[data-confirmer-retrait]')!;
    expect(c.className).toBe('loc-confirmer');
    expect(c.querySelector('span')?.textContent).toBe('Retirer cette carte ? Ce qui y est saisi sera perdu.');
    expect([...c.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Retirer', 'Annuler']);
    await clic([...c.querySelectorAll('button')].find((b) => b.textContent === 'Annuler')!);
    expect(container.querySelector('[data-confirmer-retrait]')).toBeNull();
    expect(carte()).not.toBeNull();
    await clic([...carte()!.querySelectorAll('button')].find((b) => b.textContent === 'Retirer cette carte')!);
    await clic([...container.querySelectorAll('[data-confirmer-retrait] button')].find((b) => b.textContent === 'Retirer')!);
    expect(carte()).toBeNull();
  });

  it('l’écran « Créer un nouveau propriétaire » n’est pas touché : « Retirer » y agit comme avant', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/CreationProprietaires.tsx', 'utf8');
    expect(src).toContain('<SaisieCartes cote="proprietaire" onChange={surCartes} />');
    expect(CreationProprietaires).toBeTypeOf('function');
  });

  it('carte « Contact du locataire » : Civilité, Nom, Prénom, PUIS Qualité (le menu), puis Adresse — comme la carte Locataire', async () => {
    await preparer();
    await clic([...container.querySelectorAll('button')].find((b) => b.textContent === '+ Ajouter…')!);
    await clic([...container.querySelectorAll('[data-choix] button')].find((b) => b.textContent === 'Contact du locataire')!);
    const form = container.querySelector('[data-sorte="contact"] .cp-form') as HTMLElement;
    const mots = [...form.querySelectorAll('.cp-champ-mot')].map((m) => m.textContent?.trim());
    expect(mots.slice(0, 5)).toEqual(['Civilité', 'Nom', 'Prénom', 'Qualité', 'Adresse']);
    expect(form.querySelector('[data-qualite-menu] select')).not.toBeNull();
  });

  it('PRORATA : 20/10/2026, 1 240 € et 180 € → 480,00 et 69,68 (12/31 jours) ; formule en clair ; le total se recalcule', async () => {
    await preparer();
    expect(sous('prorataLoyer')).toBe('Renseignez la date d’entrée et le loyer mensuel');
    expect(somme('prorataLoyer').value).toBe('');
    await saisir(dateEntree(), '2026-10-20');
    await loyerMensuel('1 240', '180');
    expect([somme('prorataLoyer').value, somme('prorataCharges').value]).toEqual(['480,00', '69,68']);
    expect(sous('prorataLoyer')).toBeUndefined();
    expect(await detail('prorataLoyer')).toContain('1 240,00 € × 12/31 jours (du 20/10 au 31/10) = 480,00 €');
    expect(await detail('prorataCharges')).toContain('180,00 € × 12/31 jours (du 20/10 au 31/10) = 69,68 €');
    expect(container.querySelector('[data-total] strong')?.textContent?.replace(/\s/g, ' ')).toBe('549,68 €');
  });

  it('recalcul IMMÉDIAT quand la date ou un montant change : 01/11 (mois entier), 15/02/2027 (14/28), 15/02/2028 (15/29), 31/10 (1/31)', async () => {
    await preparer();
    await loyerMensuel('1 240', '180');
    for (const [date, loyer, charges, formule] of [
      ['2026-11-01', '1240,00', '180,00', '× 30/30 jours (du 01/11 au 30/11)'],
      ['2027-02-15', '620,00', '90,00', '× 14/28 jours (du 15/02 au 28/02)'],
      ['2028-02-15', '641,38', '93,10', '× 15/29 jours (du 15/02 au 29/02)'],
      ['2026-10-31', '40,00', '5,81', '× 1/31 jours (du 31/10 au 31/10)'],
    ] as const) {
      await saisir(dateEntree(), date);
      expect([somme('prorataLoyer').value, somme('prorataCharges').value], date).toEqual([loyer, charges]);
      expect(await detail('prorataLoyer'), date).toContain(formule);
    }
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, '1 550');
    expect(somme('prorataLoyer').value).toBe('50,00');
  });

  it('modifié À LA MAIN : la valeur est gardée malgré les changements, « modifié à la main · recalculer » remet le calcul', async () => {
    await preparer();
    await saisir(dateEntree(), '2026-10-20');
    await loyerMensuel('1 240', '180');
    await saisir(somme('prorataLoyer'), '500');
    expect(sous('prorataLoyer')).toBe('modifié à la main · recalculer');
    await saisir(dateEntree(), '2026-11-01');
    expect(somme('prorataLoyer').value).toBe('500');
    expect(somme('prorataCharges').value).toBe('180,00');
    const recalculer = container.querySelector('[data-recalculer="prorataLoyer"]') as HTMLButtonElement;
    expect(recalculer.textContent).toBe('recalculer');
    await clic(recalculer);
    expect(somme('prorataLoyer').value).toBe('1240,00');
    expect(sous('prorataLoyer')).toBeUndefined();
    expect(await detail('prorataLoyer')).toContain('1 240,00 € × 30/30 jours (du 01/11 au 30/11) = 1 240,00 €');
  });

  it('champ mère manquant : le prorata se vide et le dit ; envoyé avec le reste (les montants tels qu’affichés)', async () => {
    await preparer();
    await saisir(dateEntree(), '2026-10-20');
    await loyerMensuel('1 240', '');
    expect(somme('prorataLoyer').value).toBe('480,00');
    expect(somme('prorataCharges').value).toBe('');
    expect(sous('prorataCharges')).toBe('Renseignez la date d’entrée et le loyer mensuel');
    await saisir(dateEntree(), '');
    expect(somme('prorataLoyer').value).toBe('');
    await saisir(dateEntree(), '2026-10-20');
    await toutRepondre();
    await soumettre();
    await soumettre();
    expect((posts.find((p) => p.action === 'creer-locataires')?.conditions as { sommes: Record<string, string> }).sommes)
      .toMatchObject({ prorataLoyer: '480,00', prorataCharges: '' });
  });
});

describe('🔴 pré-remplissage validé par défaut, validation unique par « Enregistrer », détail du calcul en bulle', () => {
  const somme = (k: string) => container.querySelector(`[data-somme="${k}"] input`) as HTMLInputElement;
  const picto = (k: string) => container.querySelector(`[data-somme="${k}"] .svv-pil-ib-btn`) as HTMLButtonElement;
  const bulle = (k: string) => container.querySelector(`[data-somme="${k}"] [role="tooltip"]`);
  const remplir = async () => {
    await saisir(container.querySelector('input[type="date"][form]') as HTMLInputElement, '2026-10-28');
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, '1 200');
    await saisir(container.querySelector('[data-loyer="provisions"] input') as HTMLInputElement, '130');
  };

  it('EXEMPLE : 28/10, 1 200 € et 130 € → 4/31 jours, 154,84 € et 16,77 €', async () => {
    await preparer();
    await remplir();
    expect([somme('prorataLoyer').value, somme('prorataCharges').value]).toEqual(['154,84', '16,77']);
  });

  it('la BULLE : picto ⓘ à droite de l’intitulé (« Détail du calcul », 44 px), montant, jours et dates, résultat ; fermée par le picto, un clic dehors, Échap', async () => {
    await preparer();
    await remplir();
    const p = picto('prorataLoyer');
    expect(p.getAttribute('aria-label')).toBe('Détail du calcul');
    expect(p.closest('.loc-champ-tete')?.querySelector('label')?.firstChild?.textContent).toBe('Prorata loyer');
    expect(bulle('prorataLoyer')).toBeNull();
    // Le picto ouvre, le picto referme.
    await clic(p);
    expect(p.getAttribute('aria-expanded')).toBe('true');
    expect([...bulle('prorataLoyer')!.querySelectorAll('[data-detail-calcul] > span')].map((x) => x.textContent?.replace(/\s/g, ' '))).toEqual([
      'Montant mensuel : 1 200,00 €',
      'Jours d’occupation : 4 sur 31 jours du mois (du 28/10 au 31/10)',
      '1 200,00 € × 4/31 jours (du 28/10 au 31/10) = 154,84 € (arrondi au centime)',
    ]);
    await clic(p);
    expect(bulle('prorataLoyer')).toBeNull();
    // Un clic hors de la bulle.
    await clic(picto('prorataCharges'));
    expect(bulle('prorataCharges')?.textContent?.replace(/\s/g, ' ')).toContain('130,00 € × 4/31 jours (du 28/10 au 31/10) = 16,77 €');
    await act(async () => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
    expect(bulle('prorataCharges')).toBeNull();
    // Échap.
    await clic(picto('prorataCharges'));
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(bulle('prorataCharges')).toBeNull();
    // La formule n'est plus sous les champs ; la bulle est maintenue dans l'écran ; cible ≥ 44 px.
    expect(container.querySelector('[data-cond="sommes"] [data-prorata-formule]')).toBeNull();
    expect(readFileSync('app/(admin)/admin/(protected)/InfoBulle.tsx', 'utf8')).toContain('min-width:44px;min-height:44px');
  });

  it('modifié à la main : la bulle donne aussi la valeur CALCULÉE pour comparaison ; « modifié à la main · recalculer » reste sous le champ', async () => {
    await preparer();
    await remplir();
    await saisir(somme('prorataLoyer'), '150');
    expect(container.querySelector('[data-somme="prorataLoyer"] .loc-aide-prorata')?.textContent?.replace(/\s/g, ' ')).toBe('modifié à la main · recalculer');
    await clic(picto('prorataLoyer'));
    expect(bulle('prorataLoyer')?.querySelector('[data-valeur-calculee]')?.textContent?.replace(/\s/g, ' ')).toBe('Modifié à la main : la valeur calculée serait 154,84 €.');
  });

  it('PRÉ-REMPLI = VALIDÉ : modifié SANS confirmation, la nouvelle valeur part au seul clic « Enregistrer » ; rien n’est écrit avant', async () => {
    loyerConnu = { principal: 120000, provisions: 13000, entree: '2023-09-01' };
    await preparer();
    await saisir(container.querySelector('input[type="date"][form]') as HTMLInputElement, '2026-10-28');
    // Pré-remplis (loyer, proratas, garant d'office, entretien du bien…) : aucun « valider », « OK », case ou état « à valider ».
    expect(container.querySelector('[data-bloc-conditions]')?.textContent).not.toMatch(/à valider|Valider|\bOK\b/);
    expect(container.querySelectorAll('[data-bloc-conditions] input[type="checkbox"]:not([data-entretien] input)').length).toBe(0);
    await saisir(container.querySelector('[data-loyer="principal"] input') as HTMLInputElement, '1 250');
    await saisir(somme('depotGarantie'), '1 250');
    await toutRepondre();
    // Rien n'est écrit tant qu'on n'a pas cliqué « Enregistrer » (seules des LECTURES sont parties).
    expect(posts).toEqual([]);
    await soumettre();
    expect(posts.map((p) => p.action)).toEqual(['apercu-lots']);
    await soumettre();
    const creer = posts.find((p) => p.action === 'creer-locataires')!;
    expect(creer).toMatchObject({ loyer: { principal: '1 250', provisions: '130' } });
    expect((creer.conditions as { sommes: Record<string, string> }).sommes).toMatchObject({ prorataLoyer: '161,29', prorataCharges: '16,77', depotGarantie: '1 250' });
  });

  it('« Enregistrer » : en bas à droite, dans la barre fixe (collante) — la seule validation définitive', async () => {
    await preparer();
    const barreFixe = container.querySelector('[data-collant]') as HTMLElement;
    const boutons = [...barreFixe.querySelectorAll('a, button')];
    expect(boutons.at(-1)?.textContent).toBe('Enregistrer');
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.loc-collant{position:sticky;bottom:0;');
    expect(css).toContain('justify-content:flex-end');
  });

  it('les quatre « Sommes dues » partagent leurs rangées (intitulés alignés, cases à la même hauteur)', async () => {
    await preparer();
    expect(container.querySelectorAll('.loc-grille-sommes > .loc-champ-somme')).toHaveLength(4);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.loc-grille-sommes > .loc-champ-somme{display:grid;grid-row:span 3;grid-template-rows:subgrid');
  });
});

describe('🔴 intitulés et picto sur une ligne, « € » en suffixe dans la case', () => {
  it('aucun intitulé de l’écran ne finit par « (€) » ; chaque case de montant porte « € » en suffixe, gris, non sélectionnable', async () => {
    await preparer();
    await clic(pilule('Dépôt de garantie', 'Conservé par l’agence'));
    expect(container.querySelector('[data-bloc-conditions]')?.textContent).not.toContain('(€)');
    const intitules = [...container.querySelectorAll('[data-bloc-conditions] .loc-intitule')].map((l) => l.firstChild?.textContent);
    expect(intitules).toEqual(['Montant du dépôt de garantie', 'Loyer principal', 'Provision pour charges',
      'Prorata loyer', 'Prorata provisions / charges', 'Dépôt de garantie', 'Honoraires\u00a0agence\u00a0(€\u00a0HT)']);   // Arno (24/10/2026)
    const cases = [...container.querySelectorAll('[data-bloc-conditions] .loc-case-euros')];
    // Arno (21/10/2026, 402) : + le « Montant des honoraires propriétaire (€ TTC) », toujours présent (même dessin).
    expect(cases).toHaveLength(8);
    expect(cases.filter((c) => c.closest('[data-hono-montant]') !== null)).toHaveLength(1);
    for (const c of cases) {
      expect(c.querySelector('input')).not.toBeNull();
      const suffixe = c.querySelector('.loc-suffixe-euros')!;
      expect(suffixe.textContent).toBe('€');
      expect(suffixe.getAttribute('aria-hidden')).toBe('true');
    }
    // L'exemple ne change pas ; la saisie se fait comme avant (le suffixe ne prend pas le clic).
    expect((container.querySelector('[data-somme="depotGarantie"] input') as HTMLInputElement).placeholder).toBe('ex. 1 180,50');
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.loc-suffixe-euros{position:absolute;right:.9em;top:50%;transform:translateY(-50%);color:var(--color-svv-muted);pointer-events:none;user-select:none');
    // Le lecteur d'écran entend toujours l'unité.
    expect(container.querySelector('[data-somme="prorataLoyer"] label')?.textContent).toBe('Prorata loyer en euros');
  });

  it('UNE seule ligne : pas de retour à la ligne, pas de « … » ; police réduite jusqu’à 13 px au plus bas ; picto sur la même ligne', async () => {
    await preparer();
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.loc-intitule{flex:0 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:clip');
    expect(css).toContain('.loc-champ-tete{display:flex;align-items:center;');
    expect(POLICE_MIN_INTITULE_PX).toBe(13);
    // Le picto suit l'intitulé, dans la même tête.
    const tete = container.querySelector('[data-somme="prorataCharges"] .loc-champ-tete')!;
    expect([...tete.children].map((e) => e.className)).toEqual(['loc-intitule', 'svv-pil-ib']);
  });
});
