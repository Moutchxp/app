// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FicheSyndic } from './FicheSyndic';

/**
 * 🔴 MODALE « SYNDIC DE LA COPROPRIÉTÉ » DU FORMULAIRE DU BIEN (variante « location », Arno 17/10/2026) — et la Gestion
 * inchangée : un seul bouton de création ; 3 boutons sur une ligne sous l'encadré « déjà connu » ; « Voir le détail »
 * déplie les informations de l'annuaire (lecture seule) ; le rattachement depuis le détail est rendu au formulaire SANS
 * écriture ; « Non, créer un autre syndic » ouvre la création. Routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const CONNU = { syndic: { id: 2, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine' }, copro: { cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert' }, via: ['bien'], biens: [{ id: 7, numero: '219', adresse: '15 rue Carle Hebert' }] };
const FICHE = {
  id: 2, nom: 'TEST ARNAUD', adresse: '1 rue du Cabinet', codePostal: '92600', ville: 'Asnieres Sur Seine', telephone: '0140000000', telephone2: '',
  email: 'cabinet@exemple.test', note: 'Joignable le matin.',
  contacts: [{ id: 21, civilite: 'M.', prenom: 'Arnaud', nom: 'JOREL', titre: 'Responsable de copropriété', tousImmeubles: false, immeubles: [], coordonnees: [{ id: 1, sorte: 'email', libelle: null, valeur: 'arnaud@exemple.test' }] }],
  coproprietes: [{ id: 3, cle: '15 rue carle hebert', libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie', debut: '2026-01-01', lots: [{ id: 7, numero: '219', adresse: '15 rue Carle Hebert', commune: 'Courbevoie' }] }],
  historique: [],
};

let hote: HTMLDivElement;
let racine: Root;
let ecritures: string[];
let fiche: unknown = FICHE;
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  ecritures = [];
  fiche = FICHE;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method !== undefined && init.method !== 'GET') {
      ecritures.push(`${init.method} ${u} ${String(init.body ?? '')}`);
      if (u === '/api/admin/location') {
        fiche = { ...(fiche as typeof FICHE), contacts: [...(fiche as typeof FICHE).contacts, { id: 23, civilite: 'Mme', prenom: 'Zoé', nom: 'NOUVELLE', titre: 'Assistante', tousImmeubles: false, immeubles: [], coordonnees: [{ id: 9, sorte: 'email', libelle: null, valeur: 'zoe@exemple.test' }] }] };
        return reponse({ etat: 'ok', data: { contactId: 23 } });
      }
      return reponse({ ok: true });
    }
    if (u.includes('/syndics/connus')) return reponse({ etat: 'ok', syndics: [CONNU] });
    if (u.includes('/syndics/2')) return reponse({ etat: 'ok', fiche });
    if (u.includes('/syndics/immeubles')) return reponse({ etat: 'ok', disponible: true, immeubles: [] });
    return reponse({ etat: 'ok', syndics: [], comparables: [], contacts: [] });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
const bouton = (t: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const IMMEUBLE = { libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie' };

describe('🔴 modale syndic — variante « location »', () => {
  it('un seul bouton de création ; 3 boutons sur une ligne ; détail ; rattachement rendu SANS écriture', async () => {
    const choisis: unknown[] = [];
    let fermee = false;
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onChoisi: (s: unknown) => choisis.push(s), onFerme: () => { fermee = true; } })); });
    await calmer();
    expect(bouton('Créer un nouveau syndic')).toBeUndefined();
    expect(document.querySelector('[data-syndic-connu]')?.textContent).toContain('Un syndic est déjà connu pour cette adresse');
    expect([...document.querySelectorAll('[data-trois-boutons] button')].map((b) => b.textContent)).toEqual(['Le rattacher à ce bien', 'Voir le détail', 'Non, créer un autre syndic']);
    await act(async () => { bouton('Voir le détail')!.click(); });
    await calmer();
    const detail = document.querySelector('[data-detail-syndic]') as HTMLElement;
    for (const t of ['TEST ARNAUD', '1 rue du Cabinet', '0140000000', 'cabinet@exemple.test', 'M. Arnaud JOREL', 'Responsable de copropriété', 'arnaud@exemple.test', '15 rue Carle Hebert', 'lot 219', 'Joignable le matin.']) {
      expect(detail.textContent, t).toContain(t);
    }
    // Plus aucun lien vers la fiche syndic dans le détail (accord d'Arno, 18/10/2026).
    expect(detail.querySelector('a')).toBeNull();
    expect(detail.textContent).not.toContain('Ouvrir la fiche syndic');
    // Les 3 boutons restent accessibles, détail ouvert ; UN SEUL « Masquer le détail » (celui de la ligne des 3 boutons).
    expect([...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Masquer le détail')).toHaveLength(1);
    expect([...detail.querySelectorAll('button')].map((b) => b.textContent?.trim())).toEqual(['+ Ajouter un contact']);
    expect(document.querySelectorAll('[data-trois-boutons] button')).toHaveLength(3);
    await act(async () => { bouton('Le rattacher à ce bien')!.click(); });
    expect(choisis).toEqual([{ id: 2, nom: 'TEST ARNAUD', ville: 'Asnieres Sur Seine' }]);
    expect(fermee).toBe(true);
    expect(ecritures).toEqual([]);
  });

  it('« Non, créer un autre syndic » bascule sur le formulaire de création', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onFerme: () => {} })); });
    await calmer();
    await act(async () => { bouton('Non, créer un autre syndic')!.click(); });
    await calmer();
    expect(document.querySelector('#fsy-titre')?.textContent).toBe('Créer un syndic');
    expect(document.body.textContent).toContain('Nom du cabinet');
  });

  it('DÉTAIL : 3 blocs titrés et encadrés ; biens PAR ADRESSE triés commune → voie → numéro ; zone limitée à 3 adresses', async () => {
    const lot = (id: number, numero: string, adresse: string, commune: string, extra = {}) => ({ id, numero, adresse, commune, ...extra });
    const copro = (id: number, libelle: string, codePostal: string, commune: string, lots: unknown[]) => ({ id, cle: libelle.toLowerCase(), libelle, codePostal, commune, debut: '2026-01-01', lots });
    fiche = { ...FICHE, note: null, contacts: [...FICHE.contacts, { id: 22, civilite: null, prenom: null, nom: 'COMPTA', titre: 'Comptable', tousImmeubles: false, immeubles: [],
      coordonnees: [{ id: 2, sorte: 'telephone', libelle: null, valeur: '0611223344' }] }],
      coproprietes: [
        copro(5, '155 avenue Paul Vaillant Couturier', '94250', 'Gentilly', [lot(9, '58', '155 avenue Paul Vaillant Couturier', 'Gentilly')]),
        copro(3, '15 rue Carle Hebert', '92400', 'Courbevoie', [lot(8, '406', '15 rue Carle Hebert', 'Courbevoie', { type: 'Appartement', proprietaires: ['M. JULLIEN'] }), lot(7, '219', '15 rue Carle Hebert', 'Courbevoie')]),
        copro(4, '25 rue Edith Cavell', '92400', 'Courbevoie', [lot(10, '3', '25 rue Edith Cavell', 'Courbevoie')]),
        copro(6, '2 rue Carle Hebert', '92400', 'Courbevoie', []),
      ] };
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onFerme: () => {} })); });
    await calmer();
    await act(async () => { bouton('Voir le détail')!.click(); });
    await calmer();
    const detail = document.querySelector('[data-detail-syndic]') as HTMLElement;
    expect([...detail.querySelectorAll('[data-bloc]')].map((b) => b.querySelector('h4')?.textContent))
      .toEqual(['Syndic', 'Contacts du syndic (2)', 'Immeubles et biens gérés (4)']);
    const blocSyndic = detail.querySelector('[data-bloc="syndic"]') as HTMLElement;
    expect(blocSyndic.querySelector('.syl-nom')?.textContent).toBe('TEST ARNAUD');
    expect(blocSyndic.querySelector('a')).toBeNull();
    expect(blocSyndic.textContent).not.toContain('Notes');
    expect(detail.querySelectorAll('[data-carte-contact]')).toHaveLength(2);
    expect([...detail.querySelectorAll('[data-carte-contact]')][1].textContent).toBe('COMPTAComptable0611223344');
    const adresses = [...detail.querySelectorAll('[data-groupe-adresse] .syl-adresse strong')].map((x) => x.textContent);
    expect(adresses).toEqual(['2 rue Carle Hebert', '15 rue Carle Hebert', '25 rue Edith Cavell', '155 avenue Paul Vaillant Couturier']);
    const lots = [...detail.querySelectorAll('[data-groupe-adresse]')[1].querySelectorAll('[data-lot]')].map((x) => x.textContent);
    expect(lots).toEqual(['lot 219', 'lot 406AppartementM. JULLIEN']);
    // Plus de 3 adresses : zone limitée, défilement interne (la hauteur exacte se mesure au bas de la 3e adresse).
    expect(detail.querySelector('[data-zone-biens]')?.classList.contains('syl-biens--limite')).toBe(true);
    expect(detail.querySelector('[data-indice-defilement]')?.textContent).toBe('↓ Faire défiler : 1 autre adresse');
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css.replace(/\s+/g, '')).toContain('.syl-biens--limite{max-height:19rem;overflow-y:auto');
  });

  it('3 adresses ou moins : aucune limite ; et AUCUN bleu pour le syndic (rose de la Gestion)', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onFerme: () => {} })); });
    await calmer();
    await act(async () => { bouton('Voir le détail')!.click(); });
    await calmer();
    expect(document.querySelector('[data-zone-biens]')?.classList.contains('syl-biens--limite')).toBe(false);
    expect(document.querySelector('[data-indice-defilement]')).toBeNull();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('');
    const regles = css.split('}').filter((r) => /\.syl-|\.psy-bandeau--connu/.test(r));
    expect(regles.filter((r) => /blue/i.test(r))).toEqual([]);
    expect(css).toContain('.syl-bloc-titre{');
    expect(regles.join('}')).toContain('var(--color-svv-syndic-fond)');
  });

  it('CONTACTS : ceux déjà associés à CETTE adresse en tête, avec le repère rose ; les autres suivent', async () => {
    fiche = { ...FICHE, contacts: [
      { id: 31, civilite: null, prenom: null, nom: 'AUTRE', titre: 'Comptable', tousImmeubles: false, immeubles: ['25 rue edith cavell'], coordonnees: [] },
      { id: 21, civilite: 'M.', prenom: 'Arnaud', nom: 'JOREL', titre: 'Gestionnaire', tousImmeubles: false, immeubles: ['15 rue carle hebert'], coordonnees: [] },
    ] };
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onFerme: () => {} })); });
    await calmer();
    await act(async () => { bouton('Voir le détail')!.click(); });
    await calmer();
    const cartes = [...document.querySelectorAll('[data-carte-contact]')];
    expect(cartes.map((c) => c.querySelector('strong')?.textContent)).toEqual(['M. Arnaud JOREL', 'AUTRE']);
    expect(cartes[0].getAttribute('data-associe')).toBe('oui');
    expect(cartes[0].querySelector('.syl-repere')?.textContent).toBe('Déjà associé à cette adresse');
    expect(cartes[1].querySelector('.syl-repere')).toBeNull();
    const css = [...document.querySelectorAll('style')].map((x) => x.textContent).join('').replace(/\s+/g, '');
    expect(css).toContain('.syl-carte--associe{border:2pxsolidvar(--color-svv-syndic-bord)');
  });

  it('« + Ajouter un contact » : petit formulaire, enregistré dans l’annuaire du syndic (route), ajouté à la liste', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, variante: 'location', onFerme: () => {} })); });
    await calmer();
    await act(async () => { bouton('Voir le détail')!.click(); });
    await calmer();
    await act(async () => { (document.querySelector('[data-ajouter-contact-syndic]') as HTMLButtonElement).click(); });
    const form = document.querySelector('[data-form-contact-syndic]') as HTMLElement;
    expect([...form.querySelectorAll('label')].map((l) => l.firstChild?.textContent)).toEqual(['Civilité', 'Nom *', 'Prénom', 'Fonction', 'Téléphone', 'E-mail']);
    // Sans nom : refus, rien n'est envoyé.
    await act(async () => { bouton('Enregistrer le contact')!.click(); });
    expect(form.querySelector('[role="alert"]')?.textContent).toBe('Le nom du contact est obligatoire.');
    expect(ecritures).toEqual([]);
    const saisir = (i: number, v: string) => { const el = form.querySelectorAll('input')[i] as HTMLInputElement; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    await act(async () => { saisir(0, 'Nouvelle'); saisir(1, 'Zoé'); saisir(2, 'Assistante'); saisir(4, 'zoe@exemple.test'); });
    await act(async () => { bouton('Enregistrer le contact')!.click(); });
    await calmer();
    expect(ecritures).toHaveLength(1);
    expect(ecritures[0]).toContain('POST /api/admin/location');
    expect(JSON.parse(ecritures[0].slice(ecritures[0].indexOf('{')))).toEqual({ action: 'ajouter-contact-syndic', syndicId: 2,
      contact: { civilite: null, nom: 'Nouvelle', prenom: 'Zoé', fonction: 'Assistante', telephone: '', email: 'zoe@exemple.test' } });
    expect([...document.querySelectorAll('[data-carte-contact] strong')].map((x) => x.textContent)).toContain('Mme Zoé NOUVELLE');
    expect(document.querySelector('.syl-ajoute')?.textContent).toContain('rejoint l’annuaire de ce syndic');
    expect(document.querySelector('[data-form-contact-syndic]')).toBeNull();
  });

  it('la GESTION est inchangée : son bouton « Créer un nouveau syndic » et son encadré à elle', async () => {
    await act(async () => { racine.render(createElement(FicheSyndic, { syndicId: null, immeubleDepart: IMMEUBLE, onFerme: () => {} })); });
    await calmer();
    expect(bouton('Créer un nouveau syndic')).toBeDefined();
    expect(document.querySelector('[data-trois-boutons]')).toBeNull();
    expect(bouton('Le rattacher à ce bien')).toBeDefined();
  });
});
