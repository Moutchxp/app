// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationLocataire } from './CreationLocataire';

/**
 * 🔴 Arno (22/10/2026, migration 406) — « Nouveau locataire », bloc 4 « Suivi commercial » :
 *   1. honoraires SAISIS EN HT ; le TTC des conditions d'entrée suit (× 1,2), et le HT suit le TTC calculé ;
 *   2. date de signature obligatoire ; négociateur = la personne connectée par défaut ; apporteur et taux du jour ;
 *   3. enregistré sur le bail créé, APRÈS lui (`enregistrer-activite`) ; sans la migration 406, rien n'est envoyé.
 * Les vrais composants, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

const CALCUL_OK = { etat: 'ok', surface: '61.8', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, baremeId: 1, baremeDepuis: '2026-01-01',
  source: 'Arrêté', tarifZone: '12.1', tarifEdl: '3.03', visiteBail: '747.78', etatDesLieux: '187.254', total: '935.034' };
const SANS_SURFACE = { etat: 'surface_manquante', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, motif: 'Surface Carrez/Boutin manquante dans la fiche du bien' };
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let calcul: unknown;
let parametres: unknown;
const LOT = (id: number, role: 'logement' | 'annexe', categorie: string | null, place = false) => ({ id, role, libelle: categorie ?? 'lot', type: null, etage: null,
  numeroLot: null, porte: null, place, occupants: [], noms: [], categorie });
let lotsBail: unknown[];
beforeEach(() => {
  lotsBail = [LOT(7, 'logement', null)];
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; calcul = CALCUL_OK;
  parametres = { disponible: true, moi: 5, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }, { id: 2, libelle: 'Arnaud Jorel' }],
    apporteurs: [{ id: 3, nom: 'Kin Immo', type: 'agence', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }] }], regles: [], retrocessions: [] };
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ ...corps, url: u });
      if (u.includes('/suivi')) return ok({ id: 1 });
      return ok(corps.action === 'apercu-lots' ? { recap: ['Le logement est loué.'] } : { locataireIds: [50], reintegrations: [], bailId: 99 });
    }
    if (u.includes('/suivi?vue=proposition')) return ok({ avecGestion: true, categoriePrime: 'logement', origineProprietaire: 'deja', origineLocataire: 'nouveau' });
    if (u.includes('/suivi')) return ok(parametres);
    if (u.includes('schemaConditionsEntree')) return ok({ conditions: true, loyer: true, manquantes: [] });
    if (u.includes('honorairesProprietaire=7')) return ok(calcul);
    if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'Appartement', loue: false }]);
    if (u.includes('lotsBail=7')) return ok({ lots: lotsBail, sorte: 'simple', origineLibelle: '' });
    if (u.includes('lot=7')) return ok({ bien: { id: 7, categorie: 'logement' }, complements: { entretienAPrevoir: null, entretiens: [] } });
    return ok([]);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 300)); }); };
const clic = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const pilule = (groupe: string, mot: string) => [...container.querySelectorAll(`[aria-label="${groupe}"] button`)].find((b) => b.textContent === mot) as HTMLButtonElement;
const champ = () => container.querySelector('[data-hono-montant] input') as HTMLInputElement;
const mention = () => container.querySelector('[data-hono-mention]')?.textContent ?? '';
const total = () => container.querySelector('[data-total-honoraires] strong')?.textContent ?? '';
const barre = () => container.querySelector('[data-collant] .loc-manques')?.textContent ?? '';
const soumettre = async () => { await clic(container.querySelector('[data-collant] button[type="submit"]')!); await calmer(); };

const monter = async () => { await act(async () => { root.render(createElement(CreationLocataire)); }); await calmer(); };
const preparer = async () => {
  await monter();
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
const toutRepondre = async () => {
  await clic(pilule('Dépôt de garantie', 'Reversé au bailleur'));
  await clic(pilule('Prélèvement', 'Non'));
  await clic(pilule('Garant personne physique', 'Non'));
  await clic(pilule('Assurance loyers impayés', 'Visale'));
  await clic(container.querySelector('[data-entretien-reponse="non"]')!);
  await clic(pilule('Honoraires du locataire', 'Compte bancaire transaction'));
  await clic(pilule('Honoraires du propriétaire', 'Compte bancaire gestion'));
  await clic(pilule('Mode de règlement', 'Chèque'));
};

const htProprio = () => container.querySelector('input[data-hono-proprietaire-ht]') as HTMLInputElement;
const htLocataire = () => container.querySelector('input[data-hono-locataire-ht]') as HTMLInputElement;
// Arno (24/10/2026) — les menus du bloc sont la liste maison (ListeChoix) : on l'ouvre, on clique le choix ; sa valeur est `data-valeur`.
const choisir = async (el: Element, v: string) => {
  await clic(el);
  await clic(el.closest('.lch')!.querySelector(`li[data-option="${v}"]`)!);
};

describe('🔴 « Suivi commercial » — Nouveau locataire', () => {
  it('le HT propriétaire suit le TTC calculé ; un HT saisi met le TTC à jour (× 1,2), le locataire aussi', async () => {
    await preparer();
    expect(htProprio().value).toBe('779,19');                     // 935,03 TTC ÷ 1,2
    await saisir(htProprio(), '500');
    // 🔴 Arno (24/10/2026) — UNE seule valeur : le champ des conditions d'entrée montre le même HT (et « soit 600,00 € TTC »)
    expect(champ().value).toBe('500,00');
    expect(container.querySelector('[data-hono-ttc]')?.textContent).toBe('soit 600,00 € TTC');
    expect(mention()).toBe('saisi à la main · au barème : 779,19 € HT (écart : +279,19 €) · recalculer');
    // et l'inverse : un HT saisi dans les conditions d'entrée est celui du suivi commercial
    await act(async () => { htProprio().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });   // on quitte le champ du suivi
    await saisir(champ(), '450');
    expect(htProprio().value).toBe('450,00');
    await saisir(htLocataire(), '200');
    // Arno (24/10/2026, accord explicite) : les aides « = … € TTC » sous ces champs sont retirées ; le lien demeure — le TTC est dans
    // les conditions d'entrée (« Honoraires agence (€ HT) », « soit 240,00 € TTC »).
    expect(container.querySelector('[data-hono-locataire-ttc]')).toBeNull();
    expect(container.querySelector('[data-agence-ttc]')?.textContent).toBe('soit 240,00 € TTC');
  });

  it('enregistré APRÈS le bail créé : date de signature, HT, négociateur connecté, apporteur, gestion déduite, loyers', async () => {
    await preparer();
    await toutRepondre();
    await saisir(htProprio(), '416,67');
    await act(async () => { htProprio().dispatchEvent(new FocusEvent('blur', { bubbles: false })); });
    await saisir(htLocataire(), '226,95');
    await choisir(container.querySelector('[data-apporteur]')!, '3');
    expect((container.querySelector('input[data-apporteur-taux]') as HTMLInputElement).placeholder).toBe('10');
    await saisir(container.querySelector('input[data-date-signature]') as HTMLInputElement, '2026-10-20');
    await calmer();
    await soumettre(); await soumettre();
    const i = posts.findIndex((p) => p.action === 'creer-locataires');
    const s = posts.findIndex((p) => p.action === 'enregistrer-activite');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(s).toBeGreaterThan(i);
    expect(posts[s]).toMatchObject({ url: '/api/admin/location/suivi', bailId: 99,
      activite: { dateSignature: '2026-10-20', honoProprietaireHt: '416,67', honoLocataireHt: '226,95', negociateurId: 5, apporteurId: 3, apporteurTaux: '',
        avecGestion: true, type: 'bail' } });
  });

  it('sans date de signature : « Enregistrer » est bloqué et le dit ; rien n’est créé', async () => {
    await preparer();
    await toutRepondre();
    await saisir(container.querySelector('input[data-date-signature]') as HTMLInputElement, '');
    await soumettre();
    expect(posts.some((p) => p.action === 'creer-locataires' || p.action === 'apercu-lots')).toBe(false);
    expect(container.querySelector('[data-suivi-commercial] .loc-manque')?.textContent).toBe('La date de signature du bail est obligatoire.');
  });

  it('sans la migration 406 : le bloc le dit, le locataire se crée, rien n’est envoyé au suivi', async () => {
    parametres = { disponible: false, apporteurs: [], negociateurs: [], moi: 5 };
    await preparer();
    expect(container.querySelector('[data-suivi-sans-migration]')?.textContent).toContain('migration 406');
    await toutRepondre();
    await soumettre(); await soumettre();
    expect(posts.some((p) => p.action === 'creer-locataires')).toBe(true);
    expect(posts.some((p) => p.action === 'enregistrer-activite')).toBe(false);
  });
});

describe('🔴 407 — origine du contact, apporteur rattaché, prime de gestion', () => {
  const avec407 = () => {
    parametres = { disponible: true, annuaire: true, moi: 5, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }],
      collegues: [{ id: 2, libelle: 'Arnaud Jorel' }, { id: 5, libelle: 'Jean-Baptiste PONS' }],
      regles: [{ depuis: '2026-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }],
      apporteurs: [
        { id: 3, nom: 'Kin Immo', type: 'partenaire', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }], collegues: [{ depuis: '2026-01-01', collegueId: 2, collegueLibelle: 'Arnaud Jorel' }] },
        { id: 4, nom: 'Sans Collègue', type: 'partenaire', archive: false, baremes: [{ depuis: '2026-01-01', taux: 0.1, coutFixeMensuel: 0 }], collegues: [] },
      ], retrocessions: [] };
  };
  it('l’origine du contact est obligatoire : « Enregistrer » est bloqué et le dit', async () => {
    avec407();
    await preparer();
    await toutRepondre();
    await soumettre();
    expect(posts.some((p) => p.action === 'apercu-lots' || p.action === 'creer-locataires')).toBe(false);
    expect(container.querySelector('[data-suivi-commercial] .loc-manque')?.textContent).toBe('L’origine du contact est obligatoire.');
  });
  it('« Apporteur d’affaires » : un apporteur « à rattacher » n’est pas choisissable ; le collègue s’affiche ; la commission est proposée au taux', async () => {
    avec407();
    await preparer();
    // Arno (24/10/2026) : le bien est déduit « en gestion » (Relocation cochée, origine imposée) — on décoche pour choisir l'origine.
    await clic(container.querySelector('input[data-avec-gestion]')!); await calmer();
    await choisir(container.querySelector('[data-origine-contact]')!, 'apporteur');
    await clic(container.querySelector('[data-apporteur]')!);
    const options = [...container.querySelectorAll('[data-liste-choix] li[role="option"]')];
    expect(options.find((o) => o.getAttribute('data-option') === '4')?.getAttribute('aria-disabled')).toBe('true');
    expect(options.find((o) => o.getAttribute('data-option') === '4')?.textContent).toContain('à rattacher');
    expect(options.find((o) => o.getAttribute('data-option') === '3')?.hasAttribute('aria-disabled')).toBe(false);
    await clic(container.querySelector('[data-apporteur]')!);
    await choisir(container.querySelector('[data-apporteur]')!, '3');
    expect(container.querySelector('[data-collegue-rattache]')?.textContent).toBe('Collègue de rattachement : Arnaud Jorel');
    await saisir(htProprio(), '400');
    await saisir(htLocataire(), '200');
    expect((container.querySelector('input[data-commission-apporteur]') as HTMLInputElement).placeholder).toBe('60,00');
  });
  it('🔴 419 — la liste « Apporteur » : les INTERNES puis les partenaires EXTERNES, groupés, badge ; un interne choisi : « rattaché à personne »', async () => {
    avec407();
    (parametres as { apporteurs: unknown[] }).apporteurs.push({ id: 9, nom: 'Jean-Baptiste Pons', type: 'collaborateur', archive: false, compteId: 5, collegues: [],
      baremes: [{ depuis: '2026-01-01', taux: 0.05, coutFixeMensuel: 0 }] });
    await preparer();
    await clic(container.querySelector('input[data-avec-gestion]')!); await calmer();
    await choisir(container.querySelector('[data-origine-contact]')!, 'apporteur');
    await clic(container.querySelector('[data-apporteur]')!);
    const liste = container.querySelector('[data-apporteur]')!.closest('.lch')!.querySelector('[data-liste-choix]')!;
    expect([...liste.children].map((li) => li.getAttribute('data-groupe-choix') ?? li.getAttribute('data-option'))).toEqual(['', 'Internes', '9', 'Partenaires externes', '4', '3', '+']);   // externes : par nom de famille (COLLÈGUE, IMMO)
    expect(liste.querySelector('[data-option="9"]')?.textContent).toContain('PONS Jean-Baptiste (INTERNE)');
    expect(liste.querySelector('[data-groupe-choix="Internes"]')?.getAttribute('role')).toBe('presentation');
    await clic(liste.querySelector('[data-option="9"]')!);
    expect(container.querySelector('[data-collegue-rattache]')?.textContent).toBe('Apporteur interne — rattaché à personne');
  });
  it('« Collègue directement » : le collègue ; la prime « 150 € » par défaut avec un mandat, « Personnalisé » exige son montant ; tout part au bail créé', async () => {
    avec407();
    await preparer();
    await toutRepondre();
    await clic(container.querySelector('input[data-avec-gestion]')!); await calmer();   // Relocation décochée : l'origine se choisit
    await choisir(container.querySelector('[data-origine-contact]')!, 'collegue');
    await clic(container.querySelector('button[data-collegue]')!);
    await clic(container.querySelector('[data-liste-choix] [data-option="2"]')!);
    const prime = () => container.querySelector('[data-prime-mode]')!;
    expect(prime().getAttribute('data-valeur')).toBe('aucune');
    await clic(container.querySelector('input[data-mandat-gestion]')!);
    expect(prime().getAttribute('data-valeur')).toBe('regle');
    expect(prime().textContent).toBe('150 €');
    await choisir(prime(), 'personnalise');
    await soumettre();
    expect(container.querySelector('[data-suivi-commercial] .loc-manque')?.textContent).toBe('Prime de gestion personnalisée : saisissez le montant (ex. 15).');
    await saisir(container.querySelector('input[data-prime-montant]') as HTMLInputElement, '15');
    await soumettre(); await soumettre();
    expect(posts.find((p) => p.action === 'enregistrer-activite')).toMatchObject({ activite: { origineContact: 'collegue', collegueId: 2, primeMode: 'personnalise', primeMontant: '15', mandatGestion: true } });
  });
});

describe('🔴 Arno (24/10/2026) — « Type de bien » d’après les lots loués ; négociateur = la personne connectée', () => {
  const typeBien = () => container.querySelector('[data-categorie-prime]')!;
  const optionsType = async () => {
    await clic(typeBien());
    const o = [...container.querySelectorAll('[data-liste-choix] li[role="option"]')].map((l) => l.getAttribute('data-option'));
    await clic(typeBien());
    return o;
  };
  const avecMandat = async () => { await clic(container.querySelector('input[data-mandat-gestion]')!); await calmer(); };
  it('le libellé est « Type de bien » (plus « Prime de nouvelle gestion »)', async () => {
    await preparer();
    expect(typeBien().closest('label')?.querySelector('.loc-suivi-libelle')?.textContent).toBe('Type de bien');
    expect(container.textContent).not.toContain('Prime de nouvelle gestion');
  });
  it('logement + parking loués : « Logement », et « Parking » n’est pas proposé', async () => {
    lotsBail = [LOT(7, 'logement', 'logement'), LOT(8, 'annexe', 'parking', true)];
    await preparer();
    expect(typeBien().getAttribute('data-valeur')).toBe('logement');
    await avecMandat();
    expect(await optionsType()).toEqual(['logement', 'local']);
  });
  it('un local : « Local »', async () => {
    lotsBail = [LOT(7, 'logement', 'local')];
    await preparer();
    expect(typeBien().getAttribute('data-valeur')).toBe('local');
  });
  it('le SEUL lot loué est un parking : « Parking » proposé et pré-sélectionné', async () => {
    lotsBail = [LOT(7, 'logement', 'logement'), LOT(8, 'annexe', 'box', true)];
    await preparer();
    // on décoche le logement : il ne reste que le box
    await clic(container.querySelector('[data-coche-lot="7"]')!); await calmer();
    expect(typeBien().getAttribute('data-valeur')).toBe('parking');
    await avecMandat();
    expect(await optionsType()).toEqual(['logement', 'local', 'parking']);
    // on recoche le logement : retour à « Logement », « Parking » n'est plus proposé
    await clic(container.querySelector('[data-coche-lot="7"]')!); await calmer();
    expect(typeBien().getAttribute('data-valeur')).toBe('logement');
    expect(await optionsType()).toEqual(['logement', 'local']);
  });
  it('« Négociateur » : la personne connectée par défaut (compte de la session), modifiable', async () => {
    parametres = { ...(parametres as object), moi: 2 };
    await preparer();
    const nego = container.querySelector('[data-negociateur]')!;
    expect(nego.getAttribute('data-valeur')).toBe('2');
    expect(nego.textContent).toBe('Arnaud Jorel');
    await clic(nego);
    await clic(container.querySelector('[data-liste-choix] li[data-option="5"]')!);
    await calmer();
    expect(container.querySelector('[data-negociateur]')!.getAttribute('data-valeur')).toBe('5');
  });
});

describe('🔴 Arno (24/10/2026, après 56700ffb) — « Honoraires agence (€ HT) » ; le TTC reste enregistré', () => {
  it('libellé sur une ligne ; saisie en HT, « soit X € TTC », TTC envoyé ; même valeur que « Honoraires locataire HT » du suivi', async () => {
    await preparer();
    const champ = () => container.querySelector('[data-agence-ht]') as HTMLInputElement;
    expect(champ().closest('[data-somme]')?.querySelector('.loc-intitule')?.firstChild?.textContent).toBe('Honoraires\u00a0agence\u00a0(€\u00a0HT)');
    await saisir(champ(), '200');
    expect(container.querySelector('[data-agence-ttc]')?.textContent).toBe('soit 240,00 € TTC');
    expect(htLocataire().value).toBe('200,00');                                  // une seule valeur
    expect(container.querySelector('[data-hono-total-ht]') as HTMLInputElement).not.toBeNull();
    await act(async () => { champ().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
    await saisir(htLocataire(), '150');
    expect(champ().value).toBe('150,00');
    expect(container.querySelector('[data-agence-ttc]')?.textContent).toBe('soit 180,00 € TTC');
    await toutRepondre();
    await soumettre(); await soumettre();
    // ENREGISTRÉ EN TTC, comme avant (ce que paie le locataire)
    expect((posts.find((p) => p.action === 'creer-locataires') as { conditions?: { sommes?: { honorairesAgence?: unknown } } })?.conditions?.sommes?.honorairesAgence).toBe('180,00');   // 150 € HT → 180,00 € TTC
  });
});

describe('🔴 Arno (24/10/2026, après c308b3cf) — « 10 rue Chateaubriand, CHATILLON » : le seul lot coché est un parking sans catégorie', () => {
  it('« Le parking Garage · Parking Garage · lot n° 397 » → « Type de bien » = Parking', async () => {
    lotsBail = [{ id: 7, role: 'logement', libelle: 'parking Garage', type: 'Parking Garage', etage: null, numeroLot: '397', porte: null, place: false, occupants: [], noms: [], categorie: null }];
    await preparer();
    expect(container.querySelector('[data-categorie-prime]')!.getAttribute('data-valeur')).toBe('parking');
  });
});
