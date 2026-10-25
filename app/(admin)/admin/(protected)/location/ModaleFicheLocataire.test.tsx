// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModaleFicheLocataire } from './ModaleFicheLocataire';
import type { LectureFicheLocataire } from '../../../../lib/location/ficheLocataireCartes';
import type { LectureDossier } from '../../../../lib/location/dossierLocation';

/**
 * 🔴 Arno (25/10/2026) — « FICHE LOCATAIRE » DU SUIVI DU MOIS = les cartes du bloc 1 de « Nouveau locataire », en MODIFICATION : cartes
 * préremplies (locataire et contact), avertissement « Aucune carte complète », mêmes contrôles (la première carte client complète),
 * récapitulatif ancienne → nouvelle, Confirmer / Revenir, conflit refusé (« Recharger »), la modale RESTE ouverte après l'enregistrement
 * (« ✓ Modifications enregistrées ») et la ligne se relit derrière. Vrais composants, route simulée ; données fictives.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

const LU: LectureFicheLocataire = { locataireId: 230, bailId: 70, titre: 'Fiche locataire — Mme MARTIN Léa', version: 'v1', cartes: [
  { id: 230, sorte: 'client', civilite: 'Mme', prenom: 'Léa', nom: 'MARTIN', qualite: null, adresse: '7 rue des Essais', codePostal: '92400', commune: 'COURBEVOIE', note: null,
    contacts: [{ id: 1, sorte: 'telephone', affichage: '06 00 00 00 01', libelle: 'Mobile' }] },
  { id: 5, sorte: 'contact', civilite: 'M.', prenom: 'Paul', nom: 'DURAND', qualite: 'Garant', adresse: null, codePostal: null, commune: 'LYON', note: null,
    contacts: [{ id: 1, sorte: 'email', affichage: 'paul@exemple.test', libelle: 'E-mail' }] },
] };
/** 🔴 25/10/2026 — le Dossier de location de la ligne (le bloc 3), lu par `?dossierLocation=100`. Données fictives. */
const DOSSIER: LectureDossier = {
  activiteId: 100, bailId: 70, lotId: 51, version: 'v1d', titre: 'Dossier de location — MARTIN Léa — 7 rue des Essais Courbevoie',
  bien: { id: 51, titre: '7 rue des Essais Courbevoie', famille: 'logement' }, lots: [{ id: 51, libelle: 'Appartement — 7 rue des Essais Courbevoie' }], entree: '2026-09-12',
  locataires: [], contacts: [],
  conditions: { occupationId: 900, loyer: { principal: 100000, provisions: 10000 }, lignesHonoraires: [{ mot: 'Total des honoraires propriétaire', valeur: '567,38 € HT' }],
    valeurs: { depot: 'agence', prelevement: true, jour: 5, garant: true, assurance: 'aucune', assurancePrecision: null, honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
      sommes: { prorataLoyer: 50000, prorataCharges: 5000, depotGarantie: 100000, honorairesAgence: 68086 }, reglement: 'virement', reglementPrecision: null, commentaire: null } },
  entretien: null,
  suivi: { type: 'bail', dateSignature: '2026-09-01', honoProprietaireHt: '567,38', honoLocataireHt: '567,38', negociateurId: 3, apporteurId: null, apporteurTaux: '',
    mandatGestion: false, avecGestion: true, origineProprietaire: null, origineLocataire: null, origineContact: null, collegueId: null, commissionApporteur: '',
    primeMode: 'aucune', primeMontant: '', origineContactPrecision: '', apporteurMode: null, apporteurTauxGestion: '', categoriePrime: 'logement' },
};
let posts: Record<string, unknown>[];
let reponse: { status: number; corps: Record<string, unknown> };
let lectures: number;
let hote: HTMLDivElement;
let root: Root;
const onEnregistre = vi.fn();
const onFermer = vi.fn();
beforeEach(() => {
  posts = []; lectures = 0; reponse = { status: 200, corps: { etat: 'ok', data: { changements: [] } } }; onEnregistre.mockClear(); onFermer.mockClear();
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  global.fetch = vi.fn(async (u: unknown, init?: RequestInit) => {
    const url = String(u);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body))); return { ok: reponse.status < 400, status: reponse.status, json: async () => reponse.corps } as unknown as Response; }
    if (url.includes('ficheLocataireCartes=230')) { lectures += 1; return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: LU }) } as unknown as Response; }
    if (url.includes('dossierLocation=100')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: DOSSIER }) } as unknown as Response;
    if (url.includes('traceFiche=')) return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: { repere: 10, historique: [] } }) } as unknown as Response;
    return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: [] }) } as unknown as Response;
  }) as unknown as typeof fetch;
  hote = document.createElement('div'); hote.className = 'svv-adm-root'; document.body.appendChild(hote); root = createRoot(hote);
});
afterEach(() => { act(() => { root.unmount(); }); hote.remove(); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const saisir = async (el: HTMLInputElement, v: string) => {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const monter = async () => { await act(async () => { root.render(createElement(ModaleFicheLocataire, { locataireId: 230, bailId: 70, libelle: 'MARTIN Léa', onFermer, onEnregistre })); }); await calmer(); };
const enregistrer = () => document.querySelector('[data-enregistrer-fiche]') as HTMLButtonElement;
const champ = (mot: string) => [...document.querySelectorAll('.cp-form label')].find((l) => l.querySelector('.cp-champ-mot')?.textContent === mot)?.querySelector('input') as HTMLInputElement;
const modifierLea = async () => { await clic([...document.querySelectorAll('[data-recap="client"] button')].find((b) => b.textContent === 'Modifier')!); };
const validerCarte = async () => { await clic(document.querySelector('.cp-form button[type="submit"]')!); };

describe('🔴 « Fiche locataire » du Suivi du mois — les cartes de « Nouveau locataire », en modification', () => {
  it('PRÉREMPLIES : une carte par locataire et par contact ; l’avertissement en tête ; « + Ajouter… » ; aucune carte existante à retirer ; rien à enregistrer', async () => {
    await monter();
    expect(document.querySelector('h2')?.textContent).toBe('Fiche locataire — Mme MARTIN Léa');
    expect([...document.querySelectorAll('[data-recap]')].map((c) => [c.getAttribute('data-recap'), c.querySelector('strong')?.textContent])).toEqual([
      ['client', 'Mme MARTIN Léa'], ['contact', 'M. DURAND Paul']]);
    expect(document.querySelector('[data-recap="client"]')?.textContent).toContain('06 00 00 00 01');
    expect(document.querySelector('[data-sans-carte-complete]')?.textContent).toContain('Mme MARTIN Léa : E-mail manquant');
    expect(document.body.textContent).not.toContain('Retirer cette carte');
    expect(document.querySelector('.loc-ajouter-carte')?.textContent).toBe('+ Ajouter…');
    expect(enregistrer().disabled).toBe(true);
  });

  it('CONTRÔLES : la première carte client doit être complète (téléphone ET e-mail) — refusée sans e-mail, acceptée avec', async () => {
    await monter();
    await modifierLea();
    expect(document.querySelector('.cp-form')?.textContent).toContain('Modifier la fiche');
    await saisir(champ('Commune'), 'PUTEAUX');
    await validerCarte();
    expect(document.querySelector('.cp-form')).not.toBeNull();
    expect(enregistrer().disabled).toBe(true);
    await clic([...document.querySelectorAll('.cp-ajouts button')].find((b) => b.textContent?.includes('E-mail'))!);
    const lignes = document.querySelectorAll('.cp-form .cp-saisie--valeur');
    await saisir(lignes[lignes.length - 1] as HTMLInputElement, 'lea@exemple.test');
    await validerCarte();
    expect(document.querySelector('.cp-form')).toBeNull();
    expect(enregistrer().disabled).toBe(false);
  });

  it('RÉCAPITULATIF (ancienne → nouvelle) ; « Revenir » n’envoie rien ; « Confirmer » envoie la MISE À JOUR ; la modale RESTE ouverte, « ✓ Modifications enregistrées », la ligne se relit', async () => {
    await monter();
    await modifierLea();
    await saisir(champ('Commune'), 'PUTEAUX');
    await clic([...document.querySelectorAll('.cp-ajouts button')].find((b) => b.textContent?.includes('E-mail'))!);
    const lignes = document.querySelectorAll('.cp-form .cp-saisie--valeur');
    await saisir(lignes[lignes.length - 1] as HTMLInputElement, 'lea@exemple.test');
    await validerCarte();
    await clic(enregistrer());
    const recap = document.querySelector('[data-recap-fiche]')!;
    expect(recap.textContent).toContain('Locataire Mme MARTIN Léa');
    expect(recap.textContent).toContain('Commune : COURBEVOIE → PUTEAUX');
    expect(recap.textContent).toContain('Coordonnées : Téléphone 06 00 00 00 01 → E-mail lea@exemple.test · Téléphone 06 00 00 00 01');
    await clic(document.querySelector('[data-revenir]')!);
    expect(posts).toEqual([]);
    await clic(enregistrer());
    await clic(document.querySelector('[data-confirmer-fiche]')!);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'modifier-fiche-locataire', id: 230, bailId: 70, ecran: 'Fiche locataire (Suivi du mois)',
      saisie: { version: 'v1', nouvelles: [], modifiees: [{ id: 230, sorte: 'client', champs: { commune: 'PUTEAUX' } }] } });
    expect((posts[0].saisie as { modifiees: { champs: Record<string, unknown> }[] }).modifiees[0].champs).not.toHaveProperty('nom');
    expect(document.querySelector('[data-modale-fiche-locataire="230"]')).not.toBeNull();
    expect(document.querySelector('[data-fiche-enregistree]')?.textContent).toBe('✓ Modifications enregistrées');
    expect(onEnregistre).toHaveBeenCalledTimes(1);
    expect(onFermer).not.toHaveBeenCalled();
    expect(lectures).toBe(2);
  });

  it('CONFLIT : refusé, rien n’est écrasé ; « Recharger » relit la fiche', async () => {
    reponse = { status: 409, corps: { etat: 'conflit', motif: 'Cette fiche a été modifiée depuis son ouverture : rechargez-la avant d’enregistrer. Rien n’a été enregistré.' } };
    await monter();
    await clic([...document.querySelectorAll('[data-recap="contact"] button')].find((b) => b.textContent === 'Modifier')!);
    await saisir(champ('Commune'), 'VILLEURBANNE');
    await validerCarte();
    // Les manques d'un contact (pas de téléphone) passent par la fenêtre d'alerte de « Nouveau locataire » : « Enregistrer quand même ».
    await clic([...document.querySelectorAll('button')].find((b) => b.textContent === 'Enregistrer quand même')!);
    await clic(enregistrer());
    expect(document.querySelector('[data-recap-fiche]')?.textContent).toContain('Contact M. DURAND Paul');
    await clic(document.querySelector('[data-confirmer-fiche]')!);
    expect(document.querySelector('[data-motif-fiche]')?.textContent).toContain('modifiée depuis son ouverture');
    expect(onEnregistre).not.toHaveBeenCalled();
    await clic(document.querySelector('[data-recharger]')!);
    expect(lectures).toBe(2);
  });
});

describe('🔴 Arno (25/10/2026) — la « Fiche locataire » porte aussi le bloc 3 « Conditions d’entrée » (le Dossier de location de la ligne)', () => {
  const monterAvecBail = async (activiteId: number | null = 100) => {
    await act(async () => { root.render(createElement(ModaleFicheLocataire, { locataireId: 230, bailId: 70, activiteId, libelle: 'MARTIN Léa', onFermer, onEnregistre })); });
    await calmer();
  };
  const bloc3 = () => document.querySelector('[data-bloc-conditions-locataire]') as HTMLElement;
  const pilule = (groupe: string, mot: string) => [...bloc3().querySelectorAll(`[aria-label="${groupe}"] button`)].find((b) => b.textContent === mot) as HTMLButtonElement;

  it('PRÉREMPLI depuis le bail, sous le bloc 1 : les mêmes conditions que Nouveau locataire et le Dossier ; « Caractéristiques du bien loué »', async () => {
    await monterAvecBail();
    const blocs = [...document.querySelectorAll('[data-bloc-cartes-locataire], [data-bloc-conditions-locataire]')];
    expect(blocs.map((b) => b.querySelector('h3')?.textContent)).toEqual(['1Le ou les locataires', '3Conditions d’entrée et sommes dues']);
    expect(bloc3().querySelector('[data-conditions-entree]')).not.toBeNull();
    expect(pilule('Mode de règlement', 'Virement').getAttribute('aria-pressed')).toBe('true');
    expect(pilule('Dépôt de garantie', 'Reversé au bailleur').getAttribute('aria-pressed')).toBe('false');
    // Les montants du bail, tels que le Dossier de location les préremplit.
    expect((bloc3().querySelector('[data-somme="depotGarantie"] input') as HTMLInputElement).value).toBe('1000');
    expect((bloc3().querySelector('[data-loyer="principal"] input') as HTMLInputElement).value).toMatch(/^1\s?000(,00)?$/);
    expect(bloc3().querySelector('[data-honoraires-dossier]')?.textContent).toContain('567,38 € HT');
    expect(bloc3().querySelector('[data-caracteristiques-bien="fiche-locataire"]')?.textContent).toBe('Caractéristiques du bien loué');
    expect(enregistrer().disabled).toBe(true);
  });

  it('🔴 GLI (Arno, 25/10/2026) : « Garantme » enregistré présélectionne Garantme ; un autre texte, Personnaliser avec le texte ; Garanties | Honoraires', async () => {
    const valeurs = DOSSIER.conditions!.valeurs;
    try {
      DOSSIER.conditions!.valeurs = { ...valeurs, assurance: 'gli', assurancePrecision: 'GARANTME' };
      await monterAvecBail();
      expect(pilule('GLI : laquelle ?', 'Garantme').getAttribute('aria-pressed')).toBe('true');
      expect(bloc3().querySelector('[data-cond-precision="assurance"]')).toBeNull();
      expect([...bloc3().querySelectorAll('[data-conditions-entree] > .loc-cond-bloc')].map((b) => b.getAttribute('data-cond')).slice(2, 4)).toEqual(['garanties', 'honoraires']);
      act(() => { root.unmount(); }); root = createRoot(hote);
      DOSSIER.conditions!.valeurs = { ...valeurs, assurance: 'gli', assurancePrecision: 'Assureur X' };
      await monterAvecBail();
      expect(pilule('GLI : laquelle ?', 'Personnaliser').getAttribute('aria-pressed')).toBe('true');
      expect((bloc3().querySelector('[data-cond-precision="assurance"] input') as HTMLInputElement).value).toBe('Assureur X');
      // Personnaliser vidé : « Enregistrer » le refuse (le texte est obligatoire).
      await saisir(bloc3().querySelector('[data-cond-precision="assurance"] input') as HTMLInputElement, '');
      expect(bloc3().querySelector('[data-cond-precision="assurance"]')).not.toBeNull();
    } finally { DOSSIER.conditions!.valeurs = valeurs; }
  });

  it('UN SEUL « Enregistrer » : le récapitulatif GROUPÉ PAR BLOC ; « Confirmer » envoie les cartes ET le bloc 3 (bail) ; aucun envoi de mail ; la modale reste ouverte', async () => {
    await monterAvecBail();
    await modifierLea();
    await saisir(champ('Commune'), 'PUTEAUX');
    await clic([...document.querySelectorAll('.cp-ajouts button')].find((b) => b.textContent?.includes('E-mail'))!);
    const lignes = document.querySelectorAll('.cp-form .cp-saisie--valeur');
    await saisir(lignes[lignes.length - 1] as HTMLInputElement, 'lea@exemple.test');
    await validerCarte();
    await clic(pilule('Mode de règlement', 'Chèque'));
    expect(document.querySelector('[data-etat-fiche]')?.textContent).toMatch(/modifications? à enregistrer/);
    await clic(enregistrer());
    const recap = document.querySelector('[data-recap-fiche]')!;
    expect([...recap.querySelectorAll('[data-recap-bloc]')].map((b) => [b.getAttribute('data-recap-bloc'), b.querySelector('.mfl-recap-titre')?.textContent]))
      .toEqual([['1', '1. Le ou les locataires'], ['3', '3. Conditions d’entrée et sommes dues']]);
    expect(recap.querySelector('[data-recap-bloc="3"]')?.textContent).toContain('Mode de règlement : Virement → Chèque');
    await clic(document.querySelector('[data-confirmer-fiche]')!);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ action: 'modifier-fiche-locataire', id: 230, ecran: 'Fiche locataire (Suivi du mois)',
      saisie: { modifiees: [{ id: 230, sorte: 'client' }] }, dossier: { activiteId: 100, saisie: { version: 'v1d', conditions: { reglement: 'cheque' } } } });
    expect(JSON.stringify(posts[0])).not.toMatch(/adhoc|monga|envoi/i);
    expect(document.querySelector('[data-fiche-enregistree]')?.textContent).toBe('✓ Modifications enregistrées');
    expect(document.querySelector('[data-modale-fiche-locataire="230"]')).not.toBeNull();
    expect(onEnregistre).toHaveBeenCalledTimes(1);
  });

  it('CHAMPS OBLIGATOIRES : un montant vidé est refusé (0 valide) — rien ne part', async () => {
    await monterAvecBail();
    await saisir(bloc3().querySelector('[data-somme="depotGarantie"] input') as HTMLInputElement, '');
    await clic(enregistrer());
    expect(document.querySelector('[data-motif-fiche]')?.textContent).toContain('dépôt de garantie');
    expect(posts).toEqual([]);
    await clic([...document.querySelectorAll('.mfl-boite button')].find((b) => b.textContent === 'Fermer')!);
    await saisir(bloc3().querySelector('[data-somme="depotGarantie"] input') as HTMLInputElement, '0');
    await clic(enregistrer());
    expect(document.querySelector('[data-recap-bloc="3"]')?.textContent).toContain('Dépôt de garantie');
  });

  it('LIGNE SANS BAIL : « Dossier non rattaché — à rattacher d’abord » ; rien n’est lu, rien n’est créé', async () => {
    await monterAvecBail(null);
    expect(bloc3().querySelector('[data-bloc3-non-rattache]')?.textContent).toBe('Dossier non rattaché — à rattacher d’abord.');
    expect(bloc3().querySelector('[data-conditions-entree]')).toBeNull();
  });
});
