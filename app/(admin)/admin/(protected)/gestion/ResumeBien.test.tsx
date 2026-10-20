// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { ResumeBienFiche } from './ResumeBien';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';
import type { ResumeBien } from '../../../../lib/location/resumeBienRepo';

/**
 * 🔴 Arno (20/10/2026) — FICHE BIEN : l'encart résumé complet. Chaque information de la Location est affichée (lue à sa
 * source, par la lecture `resume`), « non renseignée » si absente ; statut Libre / Déjà loué et locataires (liens) justes ;
 * les lignes d'avant restent ; une colonne et des groupes repliables au téléphone, deux colonnes sur ordinateur.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;

const FICHE = { id: 7, numero: '373', nature: 'Appartement', typeBien: 'T3', immeuble: '15 rue Carle Hebert', adresse: '15 rue Carle Hebert', commune: 'COURBEVOIE',
  codePostal: '92400', debut: '2019-03-01', fin: null, absent: false, surfaceM2: null, proprietaireId: 146, proprietaireNom: 'JULLIEN - GARRIDO' } as unknown as FicheLot;

const LOUE: ResumeBien = {
  caracteristiques: { famille: 'Logement', type: 'Appartement', meuble: false, nombrePieces: 3, etage: '2', porte: '21', batiment: 'B', escalier: null,
    numLotCopro: '12', surfaceHabitableM2: 64.2, surfaceCarrezM2: 61.8, surfaceExterieureM2: null, surfaceM2: null,
    annexes: [{ id: 8, libelle: 'Cave n° 4', detachee: false }, { id: 9, libelle: 'Parking n° 12', detachee: true }],
    familleCle: 'logement', typeLogement: 'Appartement', typeLocal: null, parkingSituation: null, parkingType: null,
    epoqueConstruction: '1949 – 1974', chauffage: 'Collectif',
    annexesDetail: [{ id: 8, titre: 'Cave', detail: 'Cave · lot 40 · porte 4', etage: '-1', adresse: null, annotation: 'Accès par la cour', detachee: false },
      { id: 9, titre: 'Parking', detail: 'Parking · Intérieur · Place simple · place 12', etage: '-2', adresse: '3 rue Voisine, 92400 COURBEVOIE', annotation: null, detachee: true }] },
  situation: { batiment: 'B', escalier: '2', etage: '2', porte: '21', precisionAcces: 'À droite en sortant de l’ascenseur', ascenseur: true, digicode: true, digicodeCode: '57B83' },
  copropriete: { numLotCopro: '12', syndic: { id: 31, nom: 'CABINET SYNDIC ESSAI' }, derniereAg: '2026-06-15', agApplicable: true },
  dpe: { classe: 'D', nonSoumis: false, date: '2024-03-01', assurancePno: true, pnoDateAnniversaire: '2026-12-01' },
  commentaire: 'Première ligne.\nDeuxième ligne.',
  proprietaires: [{ id: 146, nom: 'JULLIEN - GARRIDO Cédric', titulaire: true, mandatGestion: 'MG-0146', mandatTransaction: null },
    { id: 900, nom: 'ESSAI COPROPRIÉTAIRE', titulaire: false, mandatGestion: null, mandatTransaction: 'MT-77' }],
  gestion: { enGestionBien: true, zone: 'tres_tendue', bareme: { depuis: '2026-01-01', tarifZone: '12.10', tarifEdl: '3.03' }, entretienAPrevoir: true,
    entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2027-01-15' }] },
  location: { statut: 'loue', locataires: [{ id: 522, nom: 'ESSAI RATTACHEMENT Locataire Un', entree: '2026-11-01' }, { id: 523, nom: 'ESSAI RATTACHEMENT Locataire Deux', entree: '2026-11-01' }],
    entree: '2026-11-01', loyer: { principal: 120000, provisions: 13000 }, loyerSource: 'bail', depot: { mode: 'agence', montantCentimes: 120000 }, prelevement: { actif: true, jour: 5 } },
};
const LIBRE_VIDE: ResumeBien = {
  caracteristiques: { famille: null, type: null, meuble: null, nombrePieces: null, etage: null, porte: null, batiment: null, escalier: null, numLotCopro: null,
    surfaceHabitableM2: null, surfaceCarrezM2: null, surfaceExterieureM2: null, surfaceM2: null, annexes: [] },
  gestion: { enGestionBien: null, zone: 'autre', bareme: null, entretienAPrevoir: null, entretiens: [] },
  location: { statut: 'libre', locataires: [], entree: null, loyer: null, loyerSource: null, depot: null, prelevement: null },
};

let container: HTMLDivElement;
let root: Root;
let large: boolean;
let ouverts: [string, number][];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  large = false; ouverts = [];
  window.matchMedia = vi.fn(() => ({ matches: large, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const rendre = async (resume: unknown) => {
  global.fetch = vi.fn(async () => ok(resume)) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(ResumeBienFiche, { f: FICHE, ouvrir: (s: string, id: number) => { ouverts.push([s, id]); } })); });
  await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
};
const dd = (k: string) => container.querySelector(`[data-rb="${k}"]`)?.textContent?.replace(/\s/g, ' ');
const lignes = (groupe: string) => [...container.querySelectorAll(`[data-groupe="${groupe}"] dt`)].map((d) => d.textContent);

describe('🔴 fiche bien — encart résumé complet', () => {
  it('sept groupes ; les lignes d’avant restent (Adresse, Immeuble, Type, Surface, En gestion) ; chaque information de la Location affichée', async () => {
    large = true;
    await rendre(LOUE);
    expect([...container.querySelectorAll('[data-groupe]')].map((g) => (g as HTMLElement).dataset.groupe))
      .toEqual(['caracteristiques', 'situation', 'copropriete', 'gestion', 'dpe', 'location', 'commentaire']);
    expect(lignes('caracteristiques')).toEqual(['Adresse', 'Immeuble', 'Type', 'Famille et type', 'Meublé', 'Pièces', 'Étage', 'Surface', 'Annexes',
      'Type de logement', 'Surface habitable', 'Surface Carrez/Boutin', 'Surface extérieure', 'Époque de construction', 'Chauffage', 'Détail des annexes']);
    expect(lignes('gestion')).toEqual(['En gestion', 'Bien en gestion', 'Zone et honoraires', 'Propriétaires', 'Assurance PNO']);
    expect(lignes('dpe')).toEqual(['DPE', 'Entretien à prévoir', 'Entretiens à prévoir']);
    expect(lignes('location')).toEqual(['Statut', 'Locataires', 'Date d’entrée', 'Loyer', 'Dépôt de garantie', 'Prélèvement']);
    expect(dd('type')).toBe('Logement · Appartement');
    expect(dd('meuble')).toBe('non');
    expect(dd('pieces')).toBe('3');
    expect(dd('etage')).toBe('étage 2 · porte 21 · bâtiment B · lot de copropriété n° 12');
    // La surface saisie en Location (Carrez/Boutin d'abord) — plus « non renseignée ».
    expect(dd('surface')).toBe('Carrez/Boutin 61,8 m² · habitable 64,2 m²');
    expect(dd('annexes')).toBe('Cave n° 4 · Parking n° 12 (détachée)');
    expect(dd('en-gestion')).toBe('oui');
    expect(dd('zone')).toBe('zone très tendue — 12,10 €/m² (visite, dossier, bail), 3,03 €/m² (état des lieux) · barème du 01/01/2026');
    expect(dd('entretiens')).toBe('Chaudière (15/01/2027)');
    expect(container.textContent).toContain('depuis le 01/03/2019');
  });

  it('LOUÉ : « Déjà loué » en rouge (le mot), locataires en liens vers leur fiche, entrée, loyer + provision = total CC, dépôt, prélèvement', async () => {
    await rendre(LOUE);
    const statut = container.querySelector('[data-rb="statut"] span')!;
    expect([statut.textContent, statut.className]).toEqual(['Déjà loué', 'rb-statut rb-statut--loue']);
    const liens = [...container.querySelectorAll('[data-rb="locataires"] button')];
    expect(liens.map((b) => b.textContent)).toEqual(['ESSAI RATTACHEMENT Locataire Un', 'ESSAI RATTACHEMENT Locataire Deux']);
    await act(async () => { (liens[1] as HTMLButtonElement).click(); });
    expect(ouverts).toEqual([['locataire', 523]]);
    expect(dd('entree')).toBe('01/11/2026');
    expect(dd('loyer')).toBe('1 200,00 € + 130,00 € = 1 330,00 € charges comprises / mois');
    expect(dd('depot')).toBe('1 200,00 € — conservé par l’agence');
    expect(dd('prelevement')).toBe('oui, au 5');
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.rb-statut--loue{color:var(--color-svv-red)}');
    expect(css).toContain('.rb-statut--libre{color:var(--color-svv-green-ink)}');
    expect(css).toContain('.rb-lien{border:0;background:none;padding:0;min-height:44px');
  });

  it('LIBRE et rien de saisi : « Libre » en vert ; chaque information absente « non renseignée » ; le loyer de départ', async () => {
    await rendre(LIBRE_VIDE);
    const statut = container.querySelector('[data-rb="statut"] span')!;
    expect([statut.textContent, statut.className]).toEqual(['Libre', 'rb-statut rb-statut--libre']);
    expect(container.querySelector('[data-rb="locataires"]')).toBeNull();
    expect([dd('type'), dd('meuble'), dd('pieces'), dd('etage'), dd('surface'), dd('annexes'), dd('en-gestion'), dd('entretiens'), dd('loyer')])
      .toEqual(['non renseigné', 'non renseigné', 'non renseignées', 'non renseigné', 'non renseignée', 'aucune', 'non renseigné', 'non renseigné', 'non renseigné']);
    expect(dd('zone')).toBe('autre zone — aucun barème en vigueur');
    expect(lignes('location')).toEqual(['Statut', 'Loyer de départ']);
    // Libre avec un loyer de départ connu (la dernière location du bien).
    act(() => root.unmount()); root = createRoot(container);
    await rendre({ ...LIBRE_VIDE, location: { ...LIBRE_VIDE.location, loyer: { principal: 98000, provisions: 9050 }, loyerSource: 'depart' } });
    expect(dd('loyer')).toBe('980,00 € + 90,50 € = 1 070,50 € charges comprises / mois · dernière location du bien');
  });

  it('TÉLÉPHONE : groupes repliables, « Caractéristiques » ouvert par défaut ; ORDINATEUR : sections toujours ouvertes, deux colonnes', async () => {
    await rendre(LOUE);
    const details = [...container.querySelectorAll('details.rb-groupe')] as HTMLDetailsElement[];
    expect(details.map((d) => [d.dataset.groupe, d.open])).toEqual([['caracteristiques', true], ['situation', false], ['copropriete', false],
      ['gestion', false], ['dpe', false], ['location', false], ['commentaire', false]]);
    act(() => root.unmount()); root = createRoot(container);
    large = true;
    await rendre(LOUE);
    expect(container.querySelectorAll('details')).toHaveLength(0);
    expect(container.querySelectorAll('section.rb-groupe')).toHaveLength(7);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('@media (min-width:760px){ .rb{grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(css).toContain('.rb-groupe--repli > summary{cursor:pointer;min-height:44px');
  });

  it('lecture absente ou en échec : les lignes d’avant s’affichent seules, comme avant (rien ne disparaît)', async () => {
    await rendre(null);
    expect(lignes('caracteristiques')).toEqual(['Adresse', 'Immeuble', 'Type', 'Surface']);
    expect(lignes('gestion')).toEqual(['En gestion']);
    expect(container.querySelector('[data-groupe="situation"]')).toBeNull();
    expect(container.querySelector('[data-groupe="location"]')).toBeNull();
    expect(dd('surface')).toBe('non renseignée');
  });

  it('AUCUN champ de saisie : un affichage ; lu à la source par la route de la fiche commune (lecture seule)', async () => {
    await rendre(LOUE);
    expect(container.querySelectorAll('[data-resume-bien] input, [data-resume-bien] select, [data-resume-bien] textarea')).toHaveLength(0);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/admin/gestion/annuaire/location?resume=7');
    const route = readFileSync('app/(admin)/api/admin/gestion/annuaire/location/route.ts', 'utf8');
    expect(route).toContain("const r = identifiant(url.searchParams.get('resume'));");
    const repo = readFileSync('app/lib/location/resumeBienRepo.ts', 'utf8');
    expect(repo).not.toMatch(/INSERT INTO|UPDATE gestion|DELETE FROM/);
  });
});

/**
 * 🔴 Arno (20/10/2026) — « TOUS LES CHAMPS DE NOUVEAU BIEN », PAR FAMILLE : chaque champ de l'écran apparaît pour sa famille,
 * jamais pour une autre (pas de « type de parking » sur un logement) ; un champ vide « non renseigné ».
 */
describe('🔴 tous les champs de « Nouveau bien », pour chaque famille', () => {
  const VALEURS = (k: string) => dd(k);
  it('LOGEMENT : type, meublé, pièces, trois surfaces, époque, chauffage, situation, accès, copropriété, gestion, DPE, entretiens, commentaire', async () => {
    large = true;
    await rendre(LOUE);
    expect([VALEURS('type-logement'), VALEURS('meuble'), VALEURS('pieces'), VALEURS('surface-habitable'), VALEURS('surface-carrez'), VALEURS('surface-exterieure')])
      .toEqual(['Appartement', 'non', '3', '64,2 m²', '61,8 m²', 'non renseignée']);
    expect([VALEURS('epoque'), VALEURS('chauffage')]).toEqual(['1949 – 1974', 'Collectif']);
    expect([VALEURS('batiment'), VALEURS('escalier'), VALEURS('etage-seul'), VALEURS('porte'), VALEURS('precision'), VALEURS('ascenseur'), VALEURS('digicode')])
      .toEqual(['B', '2', '2', '21', 'À droite en sortant de l’ascenseur', 'oui', 'oui — code 57B83']);
    expect([VALEURS('lot-copro'), VALEURS('syndic'), VALEURS('derniere-ag')]).toEqual(['12', 'CABINET SYNDIC ESSAI', '15/06/2026']);
    expect(container.querySelector('[data-rb="syndic"] a')?.getAttribute('href')).toBe('/admin/location/syndic/31');
    expect(VALEURS('proprietaires')).toBe('JULLIEN - GARRIDO Cédric · mandat de gestion MG-0146ESSAI COPROPRIÉTAIRE · copropriétaire · mandat de gestion non renseigné · mandat de transaction MT-77');
    expect(VALEURS('pno')).toBe('oui — date anniversaire 01/12/2026');
    expect([VALEURS('dpe'), VALEURS('entretien-a-prevoir'), VALEURS('entretiens')]).toEqual(['classe D — du 01/03/2024', 'oui', 'Chaudière (15/01/2027)']);
    expect(VALEURS('annexes-detail')).toContain('Parking (détachée) — Intérieur · Place simple · place 12 · étage -2 · adresse : 3 rue Voisine, 92400 COURBEVOIE');
    // Le commentaire en entier, avec ses retours à la ligne (pre-wrap).
    const com = container.querySelector('[data-rb="commentaire"]')!;
    expect(com.textContent).toBe('Première ligne.\nDeuxième ligne.');
    expect(com.className).toBe('rb-commentaire');
    // Aucun champ d'une autre famille.
    for (const k of ['type-local', 'parking-situation', 'parking-type', 'surface-parking']) expect(container.querySelector(`[data-rb="${k}"]`), k).toBeNull();
  });

  it('LOCAL : type de local, surfaces, époque, chauffage, DPE — pas de type de logement ni de parking ; vide = « non renseigné »', async () => {
    large = true;
    await rendre({ ...LOUE, caracteristiques: { ...LOUE.caracteristiques, familleCle: 'local', typeLogement: null, typeLocal: 'Bureaux', surfaceHabitableM2: 80,
      surfaceCarrezM2: null, epoqueConstruction: null, chauffage: null, annexesDetail: [] },
    situation: { batiment: null, escalier: null, etage: null, porte: null, precisionAcces: null, ascenseur: null, digicode: false, digicodeCode: null },
    dpe: { classe: 'non_soumis', nonSoumis: true, date: null, assurancePno: null, pnoDateAnniversaire: null }, commentaire: null } as ResumeBien);
    expect([VALEURS('type-local'), VALEURS('surface-habitable'), VALEURS('surface-carrez'), VALEURS('epoque'), VALEURS('chauffage')])
      .toEqual(['Bureaux', '80 m²', 'non renseignée', 'non renseigné', 'non renseigné']);
    expect(container.querySelector('[data-rb="surface-habitable"]')?.previousElementSibling?.textContent).toBe('Surface (m²)');
    expect([VALEURS('batiment'), VALEURS('precision'), VALEURS('ascenseur'), VALEURS('digicode'), VALEURS('dpe'), VALEURS('pno'), VALEURS('commentaire')])
      .toEqual(['non renseigné', 'non renseignée', 'non renseigné', 'non', 'Non soumis', 'non renseignée', 'non renseigné']);
    for (const k of ['type-logement', 'parking-situation', 'parking-type', 'surface-parking']) expect(container.querySelector(`[data-rb="${k}"]`), k).toBeNull();
  });

  it('PARKING NU : intérieur / extérieur, type, surface, n° de place — ni pièces détaillées, ni DPE, ni PNO, ni époque', async () => {
    large = true;
    await rendre({ ...LOUE, caracteristiques: { ...LOUE.caracteristiques, familleCle: 'parking', typeLogement: null, parkingSituation: 'Extérieur',
      parkingType: 'Box double', surfaceM2: null, annexes: [], annexesDetail: [] },
    copropriete: { numLotCopro: null, syndic: null, derniereAg: null, agApplicable: false } } as ResumeBien);
    expect([VALEURS('parking-situation'), VALEURS('parking-type'), VALEURS('surface-parking'), VALEURS('lot-copro'), VALEURS('syndic')])
      .toEqual(['Extérieur', 'Box double', 'non renseignée', 'non renseigné', 'non renseigné']);
    expect(container.querySelector('[data-rb="porte"]')?.previousElementSibling?.textContent).toBe('N° de place');
    for (const k of ['type-logement', 'type-local', 'surface-habitable', 'surface-carrez', 'epoque', 'chauffage', 'dpe', 'pno', 'derniere-ag', 'annexes-detail']) {
      expect(container.querySelector(`[data-rb="${k}"]`), k).toBeNull();
    }
  });
});
