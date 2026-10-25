// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationLocataire } from './CreationLocataire';
import { calculerHonorairesProprietaire } from '../../../../lib/location/honorairesProprietaire';
import { GestesConditionsBail } from '../gestion/SectionsLocationFiche';
import { htDuTtc, ttcDuHt } from './ConditionsEntree';
import type { ConditionsEntreeLues } from '../../../../lib/location/conditionsEntree';

/**
 * 🔴 Arno (21/10/2026, migration 402) — « Nouveau locataire », bloc 3, encadré « Honoraires propriétaire » :
 *   1. le champ « Montant des honoraires propriétaire (€ TTC) » est TOUJOURS là, même sans bien choisi ni surface ;
 *   2. surface connue : le calcul pré-remplit (bulle ⓘ), librement modifiable ;
 *   3. sans surface : vide, « Surface inconnue : saisissez le montant » ; le calcul s'active si une surface arrive, tant que
 *      le champ n'a pas été modifié à la main ;
 *   4. modifié à la main : « saisi à la main · recalculer » ; envoyé tel quel ; le recalcul de la fiche exige une confirmation.
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
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; calcul = CALCUL_OK;
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return ok(corps.action === 'apercu-lots' ? { recap: ['Le logement est loué.'] } : { locataireIds: [50], reintegrations: [] });
    }
    if (u.includes('schemaConditionsEntree')) return ok({ conditions: true, loyer: true, manquantes: [] });
    if (u.includes('honorairesProprietaire=7')) return ok(calcul);
    if (u.includes('biensPourLocataire=')) return ok([{ id: 7, titre: '4 rue Fictive, Puteaux', detail: 'Appartement', loue: false }]);
    if (u.includes('lotsBail=7')) return ok({ lots: [{ id: 7, role: 'logement', libelle: 'logement', type: null, etage: null, numeroLot: null, porte: null, place: false, occupants: [], noms: [] }], sorte: 'simple', origineLibelle: '' });
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
  { // 🔴 Arno (25/10/2026) — le dossier COMPLET : loyer, dépôt, honoraires agence (0 accepté) ; paiement des charges si le bloc est là.
    for (const sel of ['[data-loyer="principal"] input', '[data-loyer="provisions"] input', '[data-somme="depotGarantie"] input', '[data-somme="honorairesAgence"] input']) {
      const c = container.querySelector(sel) as HTMLInputElement | null;
      if (c !== null && c.value === '' && !c.disabled) await saisir(c, '0');
    }
    const charges = pilule('Paiement des charges', 'Agence');
    if (charges !== undefined && charges.getAttribute('aria-pressed') !== 'true') await clic(charges);
  }
};

/* 🔴 Arno (24/10/2026) — le montant se SAISIT et s'AFFICHE EN HT (« soit X € TTC » dessous) ; la valeur ENREGISTRÉE reste le TTC
   (barème légal en € TTC/m², mail, total, conditions d'entrée) : 935,03 € TTC ↔ 779,19 € HT. */
describe('🔴 « Montant des honoraires propriétaire (€ HT) » — Nouveau locataire', () => {
  it('TOUJOURS présent : même sans bien choisi (champ vide, libellé, case « € »)', async () => {
    await monter();
    const bloc = container.querySelector('[data-hono-montant]') as HTMLElement;
    expect(bloc).not.toBeNull();
    expect(bloc.querySelector('label')?.textContent).toBe('Montant des honoraires propriétaire (€\u00a0HT)');
    expect(bloc.querySelector('[data-hono-ttc]')).toBeNull();                       // vide : pas de « soit … TTC »
    expect(champ().value).toBe('');
    expect(bloc.querySelector('.loc-case-euros .loc-suffixe-euros')?.textContent).toBe('€');
  });

  it('surface connue : PRÉ-REMPLI par le calcul (bulle ⓘ du calcul), et le total le compte', async () => {
    await preparer();
    expect(champ().value).toBe('779,19');                                           // 935,03 € TTC du barème ÷ 1,2
    expect(container.querySelector('[data-hono-ttc]')?.textContent).toBe('soit 935,03 € TTC');
    expect(mention()).toBe('calculé avec la surface du bien — modifiable');
    expect(container.querySelector('[data-hono-montant] .svv-pil-ib')).not.toBeNull();
    expect(total()).toBe('1\u202f870,06 €');                                        // TTC : propriétaire 935,03 + agence pré-remplie au barème 935,03 (Arno, 25/10/2026)
  });

  it('modifié à la main : « saisi à la main · recalculer » ; le total suit ; ENVOYÉ tel quel ; « recalculer » remet le calcul', async () => {
    await preparer();
    await toutRepondre();
    await saisir(champ(), '1 000');                                                 // HT
    expect(champ().value).toBe('1 000');                                            // ce qui est tapé reste
    expect(container.querySelector('[data-hono-ttc]')?.textContent).toBe('soit 1\u202f200,00 € TTC');
    expect(mention()).toBe('saisi à la main · au barème : 779,19 € HT (écart : −220,81 €) · recalculer');   // l'écart, en HT
    expect(total()).toBe('2\u202f135,03 €');                                        // 1 200,00 + agence au barème 935,03
    await soumettre(); await soumettre();
    // ENREGISTRÉ EN TTC (une seule conversion, à la frappe) : rien ne change en base
    expect(posts.find((p) => p.action === 'creer-locataires')).toMatchObject({ honorairesSaisis: '1200,00' });
    act(() => { root.unmount(); }); root = createRoot(container); posts = [];
    await preparer();
    await toutRepondre();
    await saisir(champ(), '800');
    await clic(container.querySelector('[data-hono-recalculer]')!);
    expect(champ().value).toBe('779,19');
    expect(mention()).toBe('calculé avec la surface du bien — modifiable');
    await soumettre(); await soumettre();
    expect(posts.find((p) => p.action === 'creer-locataires')).not.toHaveProperty('honorairesSaisis');
  });

  it('SANS surface : vide, « Surface inconnue : saisissez le montant » ; une saisie part, marquée à la main', async () => {
    calcul = SANS_SURFACE;
    await preparer();
    await toutRepondre();
    expect(champ().value).toBe('');
    expect(mention()).toBe('Surface inconnue : saisissez le montant');
    await saisir(champ(), '779,19');                                                // HT
    expect(mention()).toBe('saisi à la main');
    await soumettre(); await soumettre();
    expect(posts.find((p) => p.action === 'creer-locataires')).toMatchObject({ honorairesSaisis: '935,03' });   // TTC enregistré
  });

  it('la surface arrive ensuite : le calcul s’active si le champ n’a pas été touché, JAMAIS s’il a été saisi à la main', async () => {
    calcul = SANS_SURFACE;
    await preparer();
    expect(champ().value).toBe('');
    calcul = CALCUL_OK;
    await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-11-02');
    await calmer();
    expect(champ().value).toBe('779,19');
    act(() => { root.unmount(); }); root = createRoot(container);
    calcul = SANS_SURFACE;
    await preparer();
    await saisir(champ(), '500');
    calcul = CALCUL_OK;
    await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-11-02');
    await calmer();
    expect(champ().value).toBe('500');
    expect(mention()).toBe('saisi à la main · au barème : 779,19 € HT (écart : +279,19 €) · recalculer');   // jamais écrasé : l'écart est dit
  });

  it('un montant illisible bloque « Enregistrer » et le dit ; rien n’est créé', async () => {
    await preparer();
    await toutRepondre();
    await saisir(champ(), '12,345');
    expect(barre()).toContain('Honoraires propriétaire : un montant en euros, au centime au plus (ex. 935,03)');
    await soumettre();
    expect(posts.filter((p) => p.action === 'creer-locataires')).toEqual([]);
  });
});

describe('🔴 la fiche du locataire : un montant saisi à la main n’est jamais recalculé sans confirmation', () => {
  const lues = (): ConditionsEntreeLues => ({
    bailCle: 'bail-x', occupationIds: [1], saisiLe: '2026-10-21', saisiPar: 'x', modifiees: false, lignes: [], bailId: 536, surfaceActuelle: '61.8',
    conditions: { depot: 'bailleur', prelevement: false, jour: null, garant: false, assurance: 'visale', assurancePrecision: null, honorairesLocataire: 'agence',
      honorairesProprietaire: 'gestion', sommes: { prorataLoyer: null, prorataCharges: null, depotGarantie: null, honorairesAgence: null }, reglement: 'cheque',
      reglementPrecision: null, commentaire: null },
    honoraires: { etat: 'saisi', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, total: '935.03' },
  });
  it('« Calculer… » demande d’abord confirmation ; « Garder » ne calcule rien ; « Calculer quand même » calcule, et l’envoi porte la confirmation', async () => {
    const lus: string[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      lus.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return ok(null); }
      if (String(url).includes('honorairesProprietaire=7')) return ok(CALCUL_OK);
      return ok(null);
    }) as unknown as typeof fetch;
    await act(async () => { root.render(createElement(GestesConditionsBail, { c: lues(), l: { occupationId: 1, lotId: 7, entree: '2026-11-01' }, modifiable: true, apres: () => {} })); });
    await calmer();
    await clic(container.querySelector('[data-recalculer-honoraires]')!);
    expect(container.querySelector('[data-confirmer-remplacement]')?.textContent).toContain('saisis à la main');
    expect(lus.filter((u) => u.includes('honorairesProprietaire'))).toEqual([]);
    await clic(container.querySelector('[data-garder-saisie]')!);
    expect(container.querySelector('[data-confirmer-remplacement]')).toBeNull();
    expect(lus.filter((u) => u.includes('honorairesProprietaire'))).toEqual([]);
    await clic(container.querySelector('[data-recalculer-honoraires]')!);
    await clic(container.querySelector('[data-remplacer-saisie]')!);
    await calmer();
    expect(lus.filter((u) => u.includes('honorairesProprietaire=7'))).toHaveLength(1);
    expect(container.querySelector('[data-recalcul-apercu]')).not.toBeNull();
    await clic(container.querySelector('[data-enregistrer-conditions]')!);
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'conditions-entree', occupationId: 1, recalculerHonoraires: true, remplacerSaisie: true });
  });
});

describe('🔴 Arno (24/10/2026) — HT saisi, TTC enregistré : une seule conversion, aller-retour exact au centime', () => {
  it('HT → TTC (× 1,2 au centime) → HT redonne le HT saisi, pour chaque centime de 0 à 5 000 €', () => {
    for (let c = 0; c <= 500000; c += 1) {
      const ht = (c / 100).toFixed(2).replace('.', ',');
      const ttc = ttcDuHt(ht);
      expect(ttc).not.toBeNull();
      if (htDuTtc(ttc as string) !== ht) throw new Error(`${ht} → ${ttc} → ${htDuTtc(ttc as string)}`);
    }
  });
  it('les cas de la page ; vide ; illisible (plus de deux décimales : refusé, jamais arrondi)', () => {
    expect(htDuTtc('935,03')).toBe('779,19');
    expect(ttcDuHt('779,19')).toBe('935,03');
    expect(ttcDuHt('1 000')).toBe('1200,00');
    expect(ttcDuHt('')).toBe('');
    expect(ttcDuHt('12,345')).toBeNull();
    expect(ttcDuHt('abc')).toBeNull();
  });
});

/* 🔴 Arno (25/10/2026) — LES HONORAIRES AGENCE (la part du LOCATAIRE) AU BARÈME : le même calcul que la part propriétaire (zone, tarifs
   au m², date du barème, surface du bien) — le plafond légal du locataire est le même montant ; HT = TTC ÷ 1,2. Zone très tendue, 21,3 m². */
describe('🔴 « Honoraires agence (€ HT) » — la part du locataire au barème', () => {
  const BAREME = [{ id: 1, depuis: '2026-01-01', tresTendue: '12.1', tendue: '10', autre: '8', etatDesLieux: '3.03', source: 'Arrêté' }];
  const auBareme = (surface: string) => calculerHonorairesProprietaire({ surface, zone: 'tres_tendue', baremes: BAREME, date: '2026-11-01', dateSupposee: false });
  const agence = () => container.querySelector('[data-somme="honorairesAgence"] input') as HTMLInputElement;
  const mentionAgence = () => container.querySelector('[data-agence-mention]')?.textContent ?? '';
  const totalSommes = () => container.querySelector('[data-total] strong')?.textContent ?? '';
  const locataireHt = () => container.querySelector('[data-hono-locataire-ht]') as HTMLInputElement;
  const totalHt = () => container.querySelector('[data-hono-total-ht]') as HTMLInputElement;
  /** Le bloc 4 « Suivi commercial » (ses paramètres lus) : seulement pour les tests qui le regardent (il exige sa propre saisie). */
  const avecBloc4 = () => {
    const avant = global.fetch;
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = decodeURIComponent(String(url));
      if (init?.method !== 'POST' && u.includes('/suivi') && !u.includes('vue=')) {
        return ok({ disponible: true, moi: 5, negociateurs: [{ id: 5, libelle: 'Jean-Baptiste PONS' }], apporteurs: [], regles: [], retrocessions: [] });
      }
      return avant(url, init);
    }) as unknown as typeof fetch;
  };

  it('PRÉ-REMPLI au barème, au centime : 21,3 m² × (12,10 + 3,03) €/m² = 322,269 → 322,27 € TTC = 268,56 € HT ; la bulle ⓘ ; les totaux suivent', async () => {
    calcul = auBareme('21.3');
    expect(calcul).toMatchObject({ etat: 'ok', visiteBail: '257.73', etatDesLieux: '64.539', total: '322.269' });
    await preparer();
    expect(agence().value).toBe('268,56');
    expect(container.querySelector('[data-agence-ttc]')?.textContent).toBe('soit 322,27 € TTC');
    expect(mentionAgence()).toBe('calculé avec la surface du bien — modifiable');
    // La même valeur que la part propriétaire (le plafond légal du locataire).
    expect(champ().value).toBe('268,56');
    await clic(container.querySelector('[data-somme="honorairesAgence"] .svv-pil-ib-btn')!);
    const bulle = container.querySelector('[data-detail-calcul="agence"]')?.textContent?.replace(/\s/g, ' ') ?? '';
    expect(bulle).toContain('21,3 m² × 12,10 €/m² (zone très tendue) = 257,73 €');
    expect(bulle).toContain('Plafond légal du locataire : le même montant que la part du propriétaire.');
    expect(bulle).toContain('322,27 € TTC ÷ 1,2 = 268,56 € HT');
    // Les totaux : sommes dues (TTC), total des honoraires (agence + propriétaire), bloc 4 (HT).
    expect(totalSommes().replace(/\s/g, ' ')).toBe('322,27 €');
    expect(total().replace(/\s/g, ' ')).toBe('644,54 €');
    // Enregistré en TTC, comme avant.
    await toutRepondre();
    await soumettre(); await soumettre();
    expect((posts.find((p) => p.action === 'creer-locataires')!.conditions as { sommes: Record<string, string> }).sommes.honorairesAgence).toBe('322,27');
  });

  it('le bloc 4 suit : « Honoraires locataire HT » 268,56, total HT 537,12 ; une saisie dans le bloc 4 compte comme une saisie à la main', async () => {
    avecBloc4();
    calcul = auBareme('21.3');
    await preparer();
    expect(locataireHt().value).toBe('268,56');
    expect(totalHt().value.replace(/\s/g, ' ')).toBe('537,12');
    await saisir(locataireHt(), '250');
    expect(agence().value).toBe('250,00');
    expect(mentionAgence()).toBe('saisi à la main · barème : 268,56 € HT — votre saisie : 250,00 € HT · recalculer');
    expect(totalHt().value.replace(/\s/g, ' ')).toBe('518,56');
  });

  it('SAISIE À LA MAIN jamais écrasée : la surface change → « barème : X € HT — votre saisie : Y € HT » ; « recalculer » remet le barème', async () => {
    calcul = auBareme('21.3');
    await preparer();
    await saisir(agence(), '300');
    expect(mentionAgence()).toBe('saisi à la main · barème : 268,56 € HT — votre saisie : 300,00 € HT · recalculer');
    expect(totalSommes().replace(/\s/g, ' ')).toBe('360,00 €');
    // Une autre surface (relue avec une autre date d'entrée) : la saisie reste, le nouveau barème est dit.
    calcul = auBareme('25');
    await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-11-02');
    await calmer();
    expect(agence().value).toBe('300');
    expect(mentionAgence()).toBe('saisi à la main · barème : 315,21 € HT — votre saisie : 300,00 € HT · recalculer');   // 25 × 15,13 = 378,25 TTC
    // La part propriétaire, non touchée, suit le barème.
    expect(champ().value).toBe('315,21');
    await clic(container.querySelector('[data-agence-recalculer]')!);
    expect(agence().value).toBe('315,21');
    expect(mentionAgence()).toBe('calculé avec la surface du bien — modifiable');
  });

  it('non touché : il SUIT le barème quand la surface change', async () => {
    calcul = auBareme('21.3');
    await preparer();
    calcul = auBareme('25');
    await saisir(container.querySelector('input[data-date-entree]') as HTMLInputElement, '2026-11-02');
    await calmer();
    expect(agence().value).toBe('315,21');
  });

  it('SANS surface : champ vide, « Surface inconnue : saisissez le montant », saisie obligatoire', async () => {
    calcul = SANS_SURFACE;
    await preparer();
    expect(agence().value).toBe('');
    expect(mentionAgence()).toBe('Surface inconnue : saisissez le montant');
    expect(barre()).toContain('Sommes dues à l’entrée : les honoraires agence');
  });
});
