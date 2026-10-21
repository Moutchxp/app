// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { ResumeBienFiche } from './ResumeBien';
import type { FicheLot } from '../../../../lib/gestion/annuaireRepo';
import type { ResumeBien } from '../../../../lib/location/resumeBienRepo';

/**
 * 🔴 Arno (20/10/2026) — FICHE BIEN : l'encart = un RÉSUMÉ toujours visible (Caractéristiques, une ligne par information,
 * la Location d'abord puis l'import WIPPIMMO) et un DÉTAIL replié par défaut (Situation et accès · Copropriété · DPE et
 * entretiens · Commentaire), dépliable par l'encart ou par « Voir le détail du bien ⌄ ». « Gestion » et « Location en cours »
 * sont retirés de l'encart (décision d'Arno). Aucune ligne en double.
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
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

const rendre = async (resume: unknown, fiche: FicheLot = FICHE) => {
  global.fetch = vi.fn(async () => ok(resume)) as unknown as typeof fetch;
  await act(async () => { root.render(createElement(ResumeBienFiche, { f: fiche, ouvrir: () => {} })); });
  await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
};
const dd = (k: string) => container.querySelector(`[data-rb="${k}"]`)?.textContent?.replace(/\s/g, ' ');
const lignes = (groupe: string) => [...container.querySelectorAll(`[data-groupe="${groupe}"] dt`)].map((d) => d.textContent);
const groupes = () => [...container.querySelectorAll('[data-groupe]')].map((g) => (g as HTMLElement).dataset.groupe);
const toutesLesLignes = () => [...container.querySelectorAll('dt')].map((d) => d.textContent);
const encart = () => container.querySelector('[data-resume-bien]') as HTMLElement;

describe('🔴 l’encart du bien : résumé toujours visible, détail dépliable, sans doublons', () => {
  it('« Gestion » et « Location en cours » sont retirés ; plus de zone, loyer, locataire, dépôt, prélèvement, mandat, PNO dans l’encart', async () => {
    await rendre(LOUE);
    expect(groupes()).toEqual(['caracteristiques', 'situation', 'copropriete', 'dpe', 'commentaire']);
    expect(toutesLesLignes()).not.toEqual(expect.arrayContaining(['En gestion']));
    for (const mot of ['En gestion', 'Bien en gestion', 'Zone et honoraires', 'Propriétaires', 'Assurance PNO', 'Statut', 'Locataires', 'Date d’entrée', 'Loyer',
      'Dépôt de garantie', 'Prélèvement', 'Garants et contacts']) expect(toutesLesLignes(), mot).not.toContain(mot);
    expect(container.textContent).not.toMatch(/Déjà loué|zone très tendue|MG-0146|1 200,00/);
  });

  it('RÉSUMÉ (logement) : une seule ligne par information, dans l’ordre ; aucune ligne en double dans tout l’encart', async () => {
    await rendre(LOUE);
    expect(lignes('caracteristiques')).toEqual(['Adresse', 'Immeuble', 'Type', 'Meublé', 'Pièces', 'Étage', 'Surface habitable', 'Surface Carrez/Boutin',
      'Surface extérieure', 'Annexes', 'Époque de construction', 'Chauffage']);
    const toutes = toutesLesLignes();
    expect(new Set(toutes).size).toBe(toutes.length);
    expect([dd('type'), dd('meuble'), dd('pieces'), dd('etage'), dd('surface-habitable'), dd('surface-carrez'), dd('surface-exterieure'), dd('epoque'), dd('chauffage')])
      .toEqual(['Logement · Appartement', 'non', '3', '2e étage', '64,2 m²', '61,8 m²', 'non renseignée', '1949 – 1974', 'Collectif']);
    expect(dd('annexes')).toBe('Cave — lot 40 · porte 4 · sous-sol 1 · Accès par la courParking (détachée) — Intérieur · Place simple · place 12 · sous-sol 2 · adresse : 3 rue Voisine, 92400 COURBEVOIE');
  });

  it('DÉTAIL : replié par défaut ; un clic sur l’encart ou sur « Voir le détail du bien ⌄ » le déplie, « Masquer le détail ⌃ » le replie', async () => {
    await rendre(LOUE);
    const bouton = container.querySelector('[data-bascule-detail]') as HTMLButtonElement;
    const detail = container.querySelector('[data-detail-bien]') as HTMLElement;
    expect([encart().dataset.deplie, bouton.textContent, bouton.getAttribute('aria-expanded'), detail.getAttribute('aria-hidden'), detail.hasAttribute('inert')])
      .toEqual(['non', 'Voir le détail du bien ⌄', 'false', 'true', true]);
    await act(async () => { bouton.click(); });
    expect([encart().dataset.deplie, bouton.textContent, detail.getAttribute('aria-hidden'), detail.hasAttribute('inert')]).toEqual(['oui', 'Masquer le détail ⌃', 'false', false]);
    await act(async () => { bouton.click(); });
    expect(encart().dataset.deplie).toBe('non');
    // Un clic sur l'encart lui-même (hors lien / bouton) déplie aussi.
    await act(async () => { (container.querySelector('[data-rb="type"]') as HTMLElement).click(); });
    expect(encart().dataset.deplie).toBe('oui');
    // Le lien du syndic garde son geste : il ne replie pas l'encart.
    await act(async () => { (container.querySelector('[data-rb="syndic"] a') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(encart().dataset.deplie).toBe('oui');
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.rb-detail{display:grid;grid-template-rows:0fr;opacity:0;transition:grid-template-rows .28s ease');
    expect(css).toContain('@media (prefers-reduced-motion: reduce){ .rb-detail{transition:none} }');
    expect(css).toContain('.rb-bascule{display:inline-flex;align-items:center;min-height:44px');
  });

  it('DÉTAIL (logement) : situation et accès (sans « Étage », il est au résumé), copropriété, DPE, UNE ligne « Entretiens à prévoir », commentaire entier', async () => {
    await rendre(LOUE);
    expect(lignes('situation')).toEqual(['Bâtiment', 'Escalier', 'N° de porte', 'Précision', 'Ascenseur', 'Digicode']);
    expect(lignes('copropriete')).toEqual(['N° de lot', 'Syndic', 'Dernière AG']);
    expect(lignes('dpe')).toEqual(['DPE', 'Entretiens à prévoir']);
    expect([dd('digicode'), dd('syndic'), dd('dpe'), dd('entretiens')]).toEqual(['oui — code 57B83', 'CABINET SYNDIC ESSAI', 'classe D — du 01/03/2024', 'oui — Chaudière (15/01/2027)']);
    expect(container.querySelector('[data-rb="syndic"] a')?.getAttribute('href')).toBe('/admin/location/syndic/31');
    expect(container.querySelector('[data-rb="commentaire"]')?.textContent).toBe('Première ligne.\nDeuxième ligne.');
  });

  it('🔴 Arno (21/10/2026, 400) — « Charges de copropriété » sous le syndic : payées par le propriétaire / l’agence, « non renseigné » si vide ; rien sans la migration', async () => {
    for (const [valeur, attendu] of [['proprietaire', 'payées par le propriétaire'], ['agence', 'payées par l’agence'], [null, 'non renseigné']] as const) {
      act(() => root.unmount()); root = createRoot(container);
      await rendre({ ...LOUE, copropriete: { ...LOUE.copropriete!, chargesCopro: valeur } });
      expect(lignes('copropriete')).toEqual(['N° de lot', 'Syndic', 'Charges de copropriété', 'Dernière AG']);
      expect(dd('charges-copro')).toBe(attendu);
    }
    act(() => root.unmount()); root = createRoot(container);
    await rendre(LOUE);
    expect(lignes('copropriete')).toEqual(['N° de lot', 'Syndic', 'Dernière AG']);
  });
  it('🔴 Arno (21/10/2026, 401) — « ID fiscal » dans « Copropriété », à côté du N° de lot (« non renseigné » si vide) ; absent pour une annexe ou sans la migration', async () => {
    for (const [valeur, attendu] of [['921234567890', '921234567890'], [null, 'non renseigné']] as const) {
      act(() => root.unmount()); root = createRoot(container);
      await rendre({ ...LOUE, caracteristiques: { ...LOUE.caracteristiques, idFiscal: valeur } });
      expect(container.querySelector('[data-groupe="copropriete"] [data-rb="id-fiscal"]')?.textContent).toBe(attendu);
      expect(container.querySelector('[data-groupe="caracteristiques"] [data-rb="id-fiscal"]')).toBeNull();
      expect(lignes('copropriete')).toEqual(['N° de lot', 'ID fiscal', 'Syndic', 'Dernière AG']);
    }
    act(() => root.unmount()); root = createRoot(container);
    await rendre(LOUE); // annexe (le dépôt ne fournit pas la ligne) ou migration absente
    expect(container.querySelector('[data-rb="id-fiscal"]')).toBeNull();
  });
  it('un groupe du détail entièrement vide garde son titre et dit « non renseigné »', async () => {
    await rendre({ ...LOUE, situation: { batiment: null, escalier: null, etage: null, porte: null, precisionAcces: null, ascenseur: null, digicode: null, digicodeCode: null },
      copropriete: { numLotCopro: null, syndic: null, derniereAg: null, agApplicable: false }, commentaire: null,
      dpe: { classe: null, nonSoumis: false, date: null, assurancePno: null, pnoDateAnniversaire: null },
      gestion: { ...LOUE.gestion, entretienAPrevoir: null, entretiens: [] } } as ResumeBien);
    for (const gr of ['situation', 'copropriete', 'dpe', 'commentaire']) {
      expect(container.querySelector(`[data-groupe="${gr}"] h4`)?.textContent, gr).not.toBe('');
      expect(container.querySelector(`[data-rb-vide="${gr}"]`)?.textContent, gr).toBe('non renseigné');
    }
  });

  it('LOT 176 (import WIPPIMMO, sans champs Location) : Type « Logement · Appartement », meublé oui, 2 pièces — la valeur de repli, une seule', async () => {
    const lot176 = { ...FICHE, id: 176, nature: 'Appartement meublé', typeBien: 'Type 2' } as unknown as FicheLot;
    await rendre({ ...LIBRE_VIDE, caracteristiques: { ...LIBRE_VIDE.caracteristiques, familleCle: null, annexesDetail: [] } } as ResumeBien, lot176);
    expect([dd('type'), dd('meuble'), dd('pieces')]).toEqual(['Logement · Appartement', 'oui', '2']);
    expect(lignes('caracteristiques').filter((l) => l === 'Type')).toHaveLength(1);
    // Avant la lecture (ou si elle échoue) : les valeurs de l'import, seules.
    act(() => root.unmount()); root = createRoot(container);
    await rendre(null, lot176);
    expect([dd('type'), dd('meuble'), dd('pieces')]).toEqual(['Logement · Appartement', 'oui', '2']);
    expect(container.querySelector('[data-detail-bien]')).toBeNull();
  });

  it('PARKING : ni « Meublé » ni « Pièces », ni DPE ; une seule surface ; « N° de place »', async () => {
    await rendre({ ...LOUE, caracteristiques: { ...LOUE.caracteristiques, familleCle: 'parking', famille: 'Parking', type: 'Box double · Extérieur', surfaceM2: 14,
      annexes: [], annexesDetail: [] } } as ResumeBien);
    expect(lignes('caracteristiques')).toEqual(['Adresse', 'Immeuble', 'Type', 'Étage', 'N° de place', 'Surface']);
    expect([dd('type'), dd('porte'), dd('surface-parking')]).toEqual(['Parking · Box double · Extérieur', '21', '14 m²']);
    expect(groupes()).toEqual(['caracteristiques', 'situation', 'copropriete', 'commentaire']);
    // Le n° de place est au résumé : il n'est plus répété dans le détail (une seule ligne par information).
    expect(lignes('situation')).not.toContain('N° de place');
    expect(container.querySelectorAll('[data-rb="porte"]')).toHaveLength(1);
  });

  it('LOCAL : « Bureaux / pièces », « Surface », pas de ligne propre au parking', async () => {
    await rendre({ ...LOUE, caracteristiques: { ...LOUE.caracteristiques, familleCle: 'local', famille: 'Local', type: 'Bureaux' } } as ResumeBien);
    expect(lignes('caracteristiques')).toEqual(['Adresse', 'Immeuble', 'Type', 'Meublé', 'Bureaux / pièces', 'Étage', 'Surface', 'Surface Carrez/Boutin',
      'Surface extérieure', 'Annexes', 'Époque de construction', 'Chauffage']);
    expect(dd('type')).toBe('Local · Bureaux');
    expect(container.querySelector('[data-rb="surface-parking"]')).toBeNull();
  });

  it('AUCUN champ de saisie ; lu à la source par la route de la fiche commune (lecture seule)', async () => {
    await rendre(LOUE);
    expect(container.querySelectorAll('[data-resume-bien] input, [data-resume-bien] select, [data-resume-bien] textarea')).toHaveLength(0);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/api/admin/gestion/annuaire/location?resume=7');
    const repo = readFileSync('app/lib/location/resumeBienRepo.ts', 'utf8');
    expect(repo).not.toMatch(/INSERT INTO|UPDATE gestion|DELETE FROM/);
  });
});

/** 🔴 Arno (20/10/2026) — Caractéristiques sur DEUX colonnes (≥ 768 px) : « Le bien » à gauche, « Surfaces et bâti » à droite. */
describe('🔴 caractéristiques : répartition des deux colonnes, par famille', () => {
  const colonne = (c: string) => [...container.querySelectorAll(`[data-colonne="${c}"] dt`)].map((d) => d.textContent);
  it('LOGEMENT : gauche Adresse → Étage ; droite surfaces, annexes, époque, chauffage', async () => {
    await rendre(LOUE);
    expect(colonne('bien')).toEqual(['Adresse', 'Immeuble', 'Type', 'Meublé', 'Pièces', 'Étage']);
    expect(colonne('surfaces')).toEqual(['Surface habitable', 'Surface Carrez/Boutin', 'Surface extérieure', 'Annexes', 'Époque de construction', 'Chauffage']);
  });
  it('LOCAL : « Bureaux / pièces » à gauche, « Surface » à droite', async () => {
    await rendre({ ...LOUE, caracteristiques: { ...LOUE.caracteristiques, familleCle: 'local', famille: 'Local', type: 'Bureaux' } } as ResumeBien);
    expect(colonne('bien')).toEqual(['Adresse', 'Immeuble', 'Type', 'Meublé', 'Bureaux / pièces', 'Étage']);
    expect(colonne('surfaces')).toEqual(['Surface', 'Surface Carrez/Boutin', 'Surface extérieure', 'Annexes', 'Époque de construction', 'Chauffage']);
  });
  it('PARKING : Type, Étage, N° de place à gauche ; Surface à droite', async () => {
    await rendre({ ...LOUE, caracteristiques: { ...LOUE.caracteristiques, familleCle: 'parking', famille: 'Parking', type: 'Box double', annexes: [], annexesDetail: [] } } as ResumeBien);
    expect(colonne('bien')).toEqual(['Adresse', 'Immeuble', 'Type', 'Étage', 'N° de place']);
    expect(colonne('surfaces')).toEqual(['Surface']);
  });
  it('le titre reste au-dessus des deux colonnes, sans sous-titre visible ; le bouton dessous ; deux colonnes égales dès 768 px', async () => {
    await rendre(LOUE);
    const resume = container.querySelector('[data-groupe="caracteristiques"]')!;
    expect([...resume.children].map((e) => e.className)).toEqual(['rb-titre', 'rb-colonnes', 'rb-bascule']);
    expect(resume.querySelectorAll('h4, h5')).toHaveLength(1);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('@media (min-width:768px){\n  .rb-colonnes,.rb-detail-dedans{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}');
    expect(css).toContain('.rb .ann-champs{grid-template-columns:max-content minmax(0,1fr)}');
    expect(css).toContain('.rb .ann-champs dt{white-space:nowrap}');
  });
});
