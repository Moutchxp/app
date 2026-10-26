// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModaleFicheLocataire } from './ModaleFicheLocataire';
import { BlocSuiviCommercialLocataire } from './SuiviCommercialLocataire';
import type { LectureFicheLocataire } from '../../../../lib/location/ficheLocataireCartes';
import type { LectureDossier, SuiviDossier } from '../../../../lib/location/dossierLocation';
import type { BailDuLocataire, CourantSuivi, LectureSuiviLocataire } from '../../../../lib/location/suiviLocataire';

/**
 * 🔴 Arno (26/10/2026) — LE BLOC 4 « SUIVI COMMERCIAL » DANS LA FICHE LOCATAIRE (vrais composants, route simulée, données fictives) :
 * pré-rempli quand le bloc a été validé, vide sinon (« À qualifier », bail sans ligne) ; enregistré sur la MÊME ligne (le chemin du
 * Dossier de location, avec les blocs 1 et 3), ou une ligne CRÉÉE rattachée au bail (fiche du locataire, Location) ; « Mandat de gestion
 * seul » montré comme tel avec sa conversion ; les autres baux dans une liste repliée ; ce qui manque dans « Reste à renseigner ».
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const CARTES: LectureFicheLocataire = { locataireId: 230, bailId: 70, titre: 'Fiche locataire — Mme MARTIN Léa', version: 'v1', cartes: [
  { id: 230, sorte: 'client', civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', codePostal: '92400', commune: 'COURBEVOIE', note: null,
    contacts: [{ id: 1, sorte: 'telephone', affichage: '06 00 00 00 01', libelle: 'Mobile' }, { id: 2, sorte: 'email', affichage: 'lea@exemple.test', libelle: 'E-mail' }] },
] };
const VALIDE: SuiviDossier = {
  type: 'bail', dateSignature: '2026-09-01', honoProprietaireHt: '567,38', honoLocataireHt: '567,38', negociateurId: 3, apporteurId: null, apporteurTaux: '',
  mandatGestion: false, avecGestion: true, origineProprietaire: null, origineLocataire: null, origineContact: 'relocation', collegueId: null, commissionApporteur: '',
  primeMode: 'aucune', primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '', categoriePrime: 'logement',
};
const DOSSIER: LectureDossier = {
  activiteId: 100, bailId: 70, lotId: 51, version: 'v1d', titre: 'Dossier de location — MARTIN Léa — 7 rue des Essais Courbevoie',
  bien: { id: 51, titre: '7 rue des Essais Courbevoie', famille: 'logement' }, lots: [{ id: 51, libelle: 'Appartement — 7 rue des Essais Courbevoie' }], entree: '2026-09-12',
  locataires: [], contacts: [], conditions: null, entretien: null, suivi: VALIDE,
};
const PARAMETRES = { disponible: true, apporteurs: [], negociateurs: [{ id: 3, libelle: 'Jean-Baptiste Pons' }, { id: 4, libelle: 'Arnaud Jorel' }], moi: 4, collegues: [],
  regles: [{ depuis: '2019-01-01', tauxNegociateur: 0.15, primeLogement: 150, primeParking: 15 }], annuaire: true, dejaClient: true };
const ligne = (suivi: SuiviDossier, o: Partial<Extract<CourantSuivi, { sorte: 'ligne' }>> = {}): CourantSuivi => ({
  sorte: 'ligne', activiteId: 100, bailId: 70, lotId: 51, titre: '7 rue des Essais, Courbevoie — bail du 12/09/2026', version: 'v1d', suivi,
  valide: suivi.origineContact !== null, locataireIds: [230], conversion: null, enPlace: null, ...o,
});

let suivi: LectureSuiviLocataire;
let posts: Record<string, unknown>[];
let urls: string[];
let reponse: { status: number; corps: Record<string, unknown> };
let hote: HTMLDivElement;
let root: Root;
beforeEach(() => {
  posts = []; urls = []; reponse = { status: 200, corps: { etat: 'ok', data: { changements: [], dossier: [] } } };
  suivi = { locataireId: 230, courant: ligne(VALIDE), autres: [] };
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    urls.push(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: reponse.status < 400, status: reponse.status, json: async () => reponse.corps } as unknown as Response; }
    if (url.includes('suiviLocataire=230')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: suivi }) } as unknown as Response;
    if (url.includes('ficheLocataireCartes=230')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: CARTES }) } as unknown as Response;
    if (url.includes('dossierLocation=100')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { ...DOSSIER, suivi: suivi.courant.sorte === 'ligne' ? suivi.courant.suivi : VALIDE } }) } as unknown as Response;
    if (url.includes('traceFiche=')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { repere: 10, historique: [] } }) } as unknown as Response;
    if (url.startsWith('/api/admin/location/suivi') && !url.includes('vue=')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: PARAMETRES }) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ etat: 'inconnu' }) } as unknown as Response;
  }) as unknown as typeof fetch;
  hote = document.createElement('div'); hote.className = 'svv-adm-root'; document.body.appendChild(hote); root = createRoot(hote);
});
afterEach(() => { act(() => { root.unmount(); }); hote.remove(); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => { el.dispatchEvent(new Event('blur', { bubbles: true })); el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};
const fiche = async (o: { activiteId?: number | null } = {}) => {
  await act(async () => { root.render(createElement(ModaleFicheLocataire, { locataireId: 230, bailId: o.activiteId === null ? null : 70, activiteId: o.activiteId === undefined ? 100 : o.activiteId, libelle: 'MARTIN Léa', onFermer: () => {}, onEnregistre: () => {} })); });
  await calmer();
};
const bloc = () => document.querySelector('[data-bloc-suivi-locataire]') as HTMLElement;
const q = <T extends Element>(s: string) => bloc().querySelector(s) as T;
const choisir = async (donnee: string, libelle: string) => {
  await clic(bloc().querySelector(`[${donnee}]`) as HTMLElement);
  await clic([...document.querySelectorAll('[role="option"]')].find((x) => x.textContent?.replace('✓', '').trim().startsWith(libelle)) as HTMLElement);
};
const bouton = (texte: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === texte) as HTMLButtonElement;

describe('🔴 la « Fiche locataire » du Suivi du mois montre le bloc 4', () => {
  it('UN SUIVI VALIDÉ : le bloc est PRÉ-REMPLI avec la ligne du bail (date, négociateur, honoraires) ; rien à enregistrer ; rien ne manque', async () => {
    await fiche();
    expect(urls.some((u) => u.includes('suiviLocataire=230&bail=70&activite=100'))).toBe(true);
    expect(bloc().querySelector('h3')?.textContent).toBe('4Suivi commercial');
    expect(q('[data-suivi-locataire]').getAttribute('data-suivi-prerempli')).toBe('oui');
    expect(q<HTMLInputElement>('[data-date-signature]').value).toBe('2026-09-01');
    expect(q('[data-negociateur]').textContent).toContain('Jean-Baptiste Pons');
    expect(q<HTMLInputElement>('[data-hono-proprietaire-ht]').value).toBe('567,38');
    expect(q<HTMLInputElement>('[data-hono-locataire-ht]').value).toBe('567,38');
    expect(document.querySelector('[data-suivi-vide]')).toBeNull();
    expect(document.querySelector('[data-manques-suivi]')).toBeNull();
    expect((document.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(true);
    // Les blocs 1 et 3 sont toujours là (rien n'est retiré).
    expect(document.querySelector('[data-bloc-cartes-locataire]')).not.toBeNull();
    expect(document.querySelector('[data-bloc-conditions-locataire]')).not.toBeNull();
  });

  it('ENREGISTRER : la MÊME ligne (jamais une seconde) — le bloc 4 dans le récapitulatif, envoyé par le chemin du Dossier de location, sans les conditions non modifiées', async () => {
    await fiche();
    await choisir('data-negociateur', 'Arnaud Jorel');
    await clic(document.querySelector('[data-enregistrer-fiche]')!);
    const recap = document.querySelector('[data-recap-fiche]')!;
    expect([...recap.querySelectorAll('[data-recap-bloc]')].map((b) => b.getAttribute('data-recap-bloc'))).toEqual(['4']);
    expect(recap.querySelector('[data-recap-bloc="4"]')?.textContent).toContain('Négociateur : Jean-Baptiste Pons → Arnaud Jorel');
    expect(posts).toEqual([]);
    await clic(document.querySelector('[data-confirmer-fiche]')!);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'modifier-fiche-locataire', id: 230, bailId: 70, dossier: { activiteId: 100, saisie: { version: 'v1d', suivi: { negociateurId: 4 } } } });
    expect((posts[0].dossier as { saisie: Record<string, unknown> }).saisie).not.toHaveProperty('conditions');
    expect(document.querySelector('[data-fiche-enregistree]')?.textContent).toBe('✓ Modifications enregistrées');
  });

  it('RIEN DE VALIDÉ (« À qualifier », origine à renseigner) : le bloc est VIDE, il le dit, « Reste à renseigner » liste ce qui manque — et rien n’est écrasé tant qu’on n’y touche pas', async () => {
    suivi = { ...suivi, courant: ligne({ ...VALIDE, origineContact: null, negociateurId: null, avecGestion: false, honoProprietaireHt: '416,67', honoLocataireHt: '226,95' }) };
    await fiche();
    expect(q('[data-suivi-locataire]').getAttribute('data-suivi-prerempli')).toBe('non');
    expect(document.querySelector('[data-suivi-vide]')?.textContent).toContain('Rien n’a encore été validé dans ce bloc');
    expect(q<HTMLInputElement>('[data-date-signature]').value).toBe('');
    expect(q<HTMLInputElement>('[data-hono-proprietaire-ht]').value).toBe('');
    expect(q('[data-negociateur]').textContent).toContain('— aucun —');
    const manques = document.querySelector('[data-manques-suivi]')!;
    expect(manques.textContent).toMatch(/^Reste à renseigner \(4\) : Suivi commercial : la date de signature · /);
    expect((document.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-etat-fiche]')?.textContent).toBe('Aucune modification.');
    // Touché mais incomplet : « Enregistrer » dit ce qui manque ; rien ne part.
    await saisir(q<HTMLInputElement>('[data-hono-proprietaire-ht]'), '100');
    expect((document.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(false);
    await clic(document.querySelector('[data-enregistrer-fiche]')!);
    expect(document.querySelector('[data-motif-fiche]')?.textContent).toContain('Suivi commercial — reste à renseigner : la date de signature');
    expect(posts).toEqual([]);
  });

  it('🔴 LOCATAIRE EN PLACE : la ligne « Mandat de gestion seul » est montrée comme telle — mention de conversion et date d’origine, aucun honoraire de location', async () => {
    suivi = { ...suivi, courant: ligne({ ...VALIDE, type: 'gestion_seule', dateSignature: '2026-10-20', honoProprietaireHt: '0', honoLocataireHt: '0', avecGestion: false, origineContact: 'proprietaire_deja_client' },
      { enPlace: { dateMandat: '2026-10-20' }, conversion: { le: '2026-10-27T09:00:00Z', par: 'a.jorel@sansvisavis.com', typeOrigine: 'bail', dateOrigine: '2014-12-26' } }) };
    await fiche();
    const m = document.querySelector('[data-suivi-mandat-seul]')!;
    expect(m.textContent).toContain('« Mandat de gestion seul » — locataire en place à la prise en gestion, daté du mandat (20/10/2026).');
    expect(m.querySelector('[data-suivi-conversion]')?.textContent).toBe(' Converti en « Mandat de gestion seul » le 27/10/2026 par a.jorel@sansvisavis.com — à l’origine « Bail » du 26/12/2014.');
    expect(q('[data-type-activite="gestion_seule"]')).not.toBeNull();
    expect(q<HTMLInputElement>('[data-date-mandat-en-place]').value).toBe('2026-10-20');
    expect(q('[data-hono-en-place]')).not.toBeNull();
    expect(q<HTMLInputElement>('[data-hono-proprietaire-ht]').disabled).toBe(true);
    // Montré tel quel : rien n'est compté comme modifié à l'ouverture.
    expect((document.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('PLUSIEURS BAUX : la ligne du bail courant ; les autres baux et lignes dans une liste REPLIÉE, consultables, sans fusion', async () => {
    const autres: BailDuLocataire[] = [
      { bailId: 70, titre: '7 rue des Essais, Courbevoie', entree: '2026-09-12', sortie: null, lignes: [
        { activiteId: 101, type: 'avenant', dateSignature: '2026-10-02', negociateur: 'Jean-Baptiste Pons', origine: null, honoHt: 50, valide: false, conversion: null }] },
      { bailId: 40, titre: '3 rue Ancienne, Puteaux', entree: '2021-03-01', sortie: '2026-08-31', lignes: [
        { activiteId: 60, type: 'bail', dateSignature: '2021-02-20', negociateur: 'Arnaud Jorel', origine: 'Internet', honoHt: 900, valide: true, conversion: null }] },
    ];
    suivi = { ...suivi, autres };
    await fiche();
    const liste = document.querySelector('[data-autres-baux]')!;
    expect(liste.getAttribute('data-replie')).toBe('replie');
    expect(liste.querySelector('[data-resume-replie="autres-baux"]')?.textContent).toBe('2 éléments');
    expect(liste.querySelector('[data-autre-ligne]')).toBeNull();
    await clic(liste.querySelector('[data-deplier="autres-baux"]')!);
    expect([...liste.querySelectorAll('[data-autre-ligne]')].map((x) => x.getAttribute('data-autre-ligne'))).toEqual(['101', '60']);
    expect(liste.querySelector('[data-autre-ligne="101"]')?.textContent).toContain('Avenant du 02/10/2026 · Jean-Baptiste Pons · origine : à renseigner · honoraires 50,00 € HT');
    expect(liste.querySelector('[data-autre-ligne="101"] [data-a-qualifier]')).not.toBeNull();
    expect(liste.querySelector('[data-autre-bail="40"]')?.textContent).toContain('sorti le 31/08/2026');
    // La ligne courante reste seule dans le bloc (pré-remplie).
    expect(q<HTMLInputElement>('[data-date-signature]').value).toBe('2026-09-01');
  });

  it('une ligne du Suivi SANS BAIL (« non rattachée ») : dit, comme le bloc 3 — rien n’est pris à sa place', async () => {
    suivi = { ...suivi, courant: { sorte: 'non_rattache' } };
    await fiche({ activiteId: null });
    expect(urls.some((u) => u.includes('suiviLocataire=230') && u.includes('nonRattache=1'))).toBe(true);
    expect(document.querySelector('[data-suivi-non-rattache]')?.textContent).toContain('Dossier non rattaché — à rattacher d’abord');
    expect(document.querySelector('[data-date-signature]')).toBeNull();
  });
});

describe('🔴 la fiche du locataire dans la Location : le bloc 4 et son propre enregistrement', () => {
  const page = async () => { await act(async () => { root.render(createElement(BlocSuiviCommercialLocataire, { locataireId: 230 })); }); await calmer(); };

  it('UN BAIL SANS LIGNE : bloc vide ; rempli puis « Enregistrer le suivi commercial » → récapitulatif « nouvelle ligne » → CRÉATION rattachée au bail', async () => {
    suivi = { locataireId: 230, courant: { sorte: 'sans_ligne', bailId: 70, lotId: 51, titre: '7 rue des Essais, Courbevoie — bail du 12/09/2026', locataireIds: [230], enPlace: null }, autres: [] };
    reponse = { status: 200, corps: { etat: 'ok', data: { changements: [], activiteId: 555 } } };
    await page();
    expect(document.querySelector('[data-suivi-vide]')?.textContent).toContain('L’enregistrer crée la ligne de suivi, rattachée à ce bail');
    const btn = document.querySelector('[data-enregistrer-suivi-locataire]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(document.querySelector('[data-manques-suivi]')?.textContent).toContain('Reste à renseigner (4)');
    await saisir(q<HTMLInputElement>('[data-date-signature]'), '2026-09-01');
    await choisir('data-origine-contact', 'Internet');
    await saisir(q<HTMLInputElement>('[data-hono-proprietaire-ht]'), '500');
    await saisir(q<HTMLInputElement>('[data-hono-locataire-ht]'), '0');
    expect(document.querySelector('[data-manques-suivi]')).toBeNull();
    expect(btn.disabled).toBe(false);
    await clic(btn);
    const recap = document.querySelector('[data-recap-bloc="4"]')!;
    expect(recap.textContent).toContain('nouvelle ligne de suivi, rattachée au bail');
    expect(recap.textContent).toContain('Date de signature du bail : (vide) → 01/09/2026');
    expect(recap.textContent).toContain('Honoraires propriétaire HT : (vide) → 500,00 €');
    await clic(bouton('Confirmer'));
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'enregistrer-suivi-locataire', id: 230, bailId: 70, activiteId: null, version: '', ecran: 'Fiche locataire (Location)',
      suivi: { dateSignature: '2026-09-01', origineContact: 'internet', honoProprietaireHt: '500,00' } });
    expect(document.querySelector('[data-suivi-enregistre]')?.textContent).toBe('✓ Suivi commercial enregistré.');
  });

  it('UNE LIGNE VALIDÉE : pré-remplie ; modifiée → la MÊME ligne (son identifiant, sa version) ; un conflit est dit, « Recharger » proposé', async () => {
    reponse = { status: 409, corps: { etat: 'conflit', motif: 'Cette fiche a été modifiée par Jean-Baptiste Pons depuis son ouverture : rechargez-la. Rien n’a été enregistré.' } };
    await page();
    expect(q('[data-suivi-locataire]').getAttribute('data-suivi-prerempli')).toBe('oui');
    await choisir('data-negociateur', 'Arnaud Jorel');
    await clic(document.querySelector('[data-enregistrer-suivi-locataire]')!);
    await clic(bouton('Confirmer'));
    expect(posts[0]).toMatchObject({ action: 'enregistrer-suivi-locataire', id: 230, bailId: 70, activiteId: 100, version: 'v1d', suivi: { negociateurId: 4 } });
    expect(document.body.textContent).toContain('Suivi modifié par ailleurs');
    expect(bouton('Recharger')).toBeDefined();
  });
});
