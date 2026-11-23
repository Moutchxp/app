// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

/**
 * 🔴🔴 Arno (23/11/2026) — « Valider la sortie », bien sans copropriété : « Créer une copropriété » = EXACTEMENT le parcours de la Gestion (la fiche
 * Copropriété elle-même, pour l'adresse du bien). La fiche est observée (son comportement a ses propres épreuves : adresse officielle, parcelle,
 * adresses prises, anti-doublon, « Rattacher à … ? », « Non » mémorisé).
 */
const fiche = vi.fn();
vi.mock('../gestion/FicheCopropriete', () => ({
  FicheCopropriete: (p: { lotId?: number | null; immeuble?: string | null; onFerme: () => void }) => {
    fiche(p); return createElement('button', { 'data-stub-fiche': String(p.lotId), onClick: p.onFerme }, 'Fermer la fiche');
  },
}));
const arrete = vi.fn();
vi.mock('../gestion/ArreteComptes', () => ({ ArreteComptes: (p: Record<string, unknown>) => { arrete(p); return createElement('div', { 'data-stub-arrete': String(p.coproprieteId) }); }, CSS_ARRETE_COMPTES: '' }));
const { AgSortie, CSS_AG_SORTIE, saisieAgInitiale, luAgPropre, corpsAg, BANDEAU_DERNIERE_AGO_MANQUANTE, prochaineCalculee, ARRETE_SANS_COPROPRIETE, agoQuiCompte, libelleCaseAgoQuiCompte, texteAjouteAuMail, AIDE_PROCHAINE_AGO } = await import('./AgSortie');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); fiche.mockClear(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const LU = luAgPropre({ disponible: true, lotId: 7, copropriete: null, immeuble: '4 rue Fictive', coproprieteSaisie: true, suggestions: [],
  proposition: { derniere: null, prochaine: null }, adresse: '4 rue Fictive', moi: 'arno@exemple.fr' });

describe('« Créer une copropriété » depuis la fenêtre de sortie', () => {
  it('ouvre LA fiche Copropriété pour le bien (lotId), sans nom tapé ; à sa fermeture, la fenêtre se RELIT', async () => {
    const relire = vi.fn();
    const s = saisieAgInitiale(LU);
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s, onChange: () => {}, desactive: false, onRelire: relire })); });
    expect(container.querySelector('input[data-ag-copro-nom]')).toBeNull();
    await act(async () => { (container.querySelector('button[data-ag-copro="creer"]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenCalledWith(expect.objectContaining({ lotId: 7 }));
    await act(async () => { (container.querySelector('[data-stub-fiche="7"]') as HTMLButtonElement).click(); });
    expect(relire).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-stub-fiche]')).toBeNull();
  });
  it('le corps envoyé ne porte JAMAIS de création par nom (seulement « rattacher » ou rien)', () => {
    const s = saisieAgInitiale(LU);
    expect(corpsAg({ ...s, copro: 'aucune' }, LU)).not.toHaveProperty('coproprieteChoix.creer');
    expect(corpsAg({ ...s, copro: 'rattacher', rattacher: 12 }, LU)).toMatchObject({ coproprieteChoix: { rattacher: 12 } });
  });
  it('le serveur ne crée plus de copropriété depuis la sortie : `creerCoproprietePourLot` n’y est plus appelé (gardé dans agCoproprieteRepo)', () => {
    expect(readFileSync('app/lib/location/validationSortieRepo.ts', 'utf8')).not.toContain('creerCoproprietePourLot');
    expect(readFileSync('app/lib/location/agCoproprieteRepo.ts', 'utf8')).toContain('export async function creerCoproprietePourLot');
  });

});

describe('🔴 Arno (23/11/2026) — copropriété rattachée : ce qui manque est MIS EN AVANT dans la fenêtre de sortie', () => {
  it('l’arrêté des comptes : le MÊME composant que la fiche Copropriété, pour la copropriété du bien, avec son bandeau', async () => {
    const lu = { ...LU, copropriete: { id: 310, libelle: 'Copro Essai' } };
    await act(async () => { root.render(createElement(AgSortie, { lu, s: saisieAgInitiale(lu), onChange: () => {}, desactive: false })); });
    expect(arrete).toHaveBeenCalledWith(expect.objectContaining({ coproprieteId: 310, alerteSiManquante: true }));
  });
  it('la dernière AGO manquante : bandeau ; connue : pas de bandeau', async () => {
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: false })); });
    expect(container.querySelector('[data-ag-bandeau-derniere]')?.textContent).toBe(`⚠ ${BANDEAU_DERNIERE_AGO_MANQUANTE}`);
    // saisie dans la fenêtre : le bandeau a fait son office, il disparaît
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: { ...saisieAgInitiale(LU), derniere: '2026-03-25' }, onChange: () => {}, desactive: false })); });
    expect(container.querySelector('[data-ag-bandeau-derniere]')).toBeNull();
    const connu = luAgPropre({ ...LU, proposition: { derniere: { date: '2026-03-25', par: 'x', le: '2026-03-26T10:00:00Z' }, prochaine: null } });
    await act(async () => { root.render(createElement(AgSortie, { lu: connu, s: saisieAgInitiale(connu), onChange: () => {}, desactive: false })); });
    expect(container.querySelector('[data-ag-bandeau-derniere]')).toBeNull();
  });
});

describe('🔴 Arno (23/11/2026) — « Prochaine AGO » PRÉREMPLIE par le calcul du suivi des 20 % (b0453dc2), option A', () => {
  const JOUR = '2026-11-23';
  // 🔴 Arno (23/11/2026, point 10) — « Prochaine AGO » = celle de la COPROPRIÉTÉ (la première après le jour de la validation) ; l'AGO QUI COMPTE est à part
  it('la prochaine AGO de la copropriété : la première après le jour de la validation (officielle de l’année, sinon projetée)', () => {
    expect(prochaineCalculee({ officielles: ['2026-03-25'], derniere: '', jour: JOUR })).toEqual({ date: '2027-03-25', statut: 'projetee' });
    expect(prochaineCalculee({ officielles: ['2026-09-22'], derniere: '', jour: JOUR })).toEqual({ date: '2027-09-22', statut: 'projetee' });
    expect(prochaineCalculee({ officielles: ['2026-03-25', '2027-03-15'], derniere: '', jour: JOUR })).toEqual({ date: '2027-03-15', statut: 'officielle' });
    expect(prochaineCalculee({ officielles: [], derniere: '', jour: JOUR })).toBeNull();
    // la dernière AGO SAISIE dans la fenêtre sert aussi de base
    expect(prochaineCalculee({ officielles: [], derniere: '2026-06-10', jour: JOUR })).toEqual({ date: '2027-06-10', statut: 'projetee' });
  });
  it('à l’ouverture : la prochaine AGO préremplie par le calcul, « Date projetée » sélectionné d’office (Arno, 23/11) ; une officielle à venir reste prioritaire', () => {
    const lu = luAgPropre({ ...LU, officielles: ['2026-03-25'], arrete: { jour: 31, mois: 12 },
      proposition: { derniere: { date: '2026-03-25', par: 'x', le: '2026-03-26T10:00:00Z' }, prochaine: { date: '2027-03-25', statut: null, mention: 'x', par: null, le: null } } });
    expect(saisieAgInitiale(lu, JOUR)).toMatchObject({ derniere: '2026-03-25', prochaine: '2027-03-25', statut: 'projetee', alerte: null });
    const off = luAgPropre({ ...LU, officielles: ['2026-03-25', '2027-02-14'], arrete: { jour: 31, mois: 12 },
      proposition: { derniere: { date: '2026-03-25', par: 'x', le: 'y' }, prochaine: { date: '2027-02-14', statut: 'officielle', mention: null, par: 'z', le: 'w' } } });
    expect(saisieAgInitiale(off, JOUR)).toMatchObject({ prochaine: '2027-02-14', statut: 'officielle' });
  });
  it('option A : dernière AGO de plus d’un an → la décision du 17/11 (champ vide, alerte) ; rien n’est prérempli tant qu’elle n’est pas confirmée', () => {
    const vieille = luAgPropre({ ...LU, officielles: ['2015-03-12'], proposition: { derniere: { date: '2015-03-12', par: 'x', le: 'y' }, prochaine: null, projectionPerimee: '2016-03-12' } });
    expect(saisieAgInitiale(vieille, JOUR)).toMatchObject({ prochaine: '', alerte: { date: '2016-03-12', sorte: 'calculee' } });
  });
  it('option A : la dernière AGO ancienne CONFIRMÉE comme référence → la prochaine AGO suit alors le calcul (la sortie se débloque)', async () => {
    const vieille = luAgPropre({ ...LU, officielles: ['2015-03-12'], proposition: { derniere: { date: '2015-03-12', par: 'x', le: 'y' }, prochaine: null, projectionPerimee: '2016-03-12' } });
    const change = vi.fn();
    const s0 = { ...saisieAgInitiale(vieille, JOUR), alerte: null };
    await act(async () => { root.render(createElement(AgSortie, { lu: vieille, s: s0, onChange: change, desactive: false })); });
    expect(change).not.toHaveBeenCalled(); // tant qu'elle n'est pas confirmée : rien n'est prérempli
    await act(async () => { root.render(createElement(AgSortie, { lu: vieille, s: { ...s0, derniereConfirmee: true }, onChange: change, desactive: false })); });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ prochaine: expect.stringMatching(/^20(2[7-9])-03-12$/) }));
  });
});

describe('🔴 Arno (23/11/2026) — « le bouton "Créer une copropriété" doit prendre toute la largeur de la colonne »', () => {
  it('la règle du bouton : étiré sur toute la largeur (aucune largeur automatique, aucun alignement à gauche)', async () => {
    const { CSS_AG_SORTIE } = await import('./AgSortie');
    const regle = /\.vag-creer-btn\{([^}]*)\}/.exec(CSS_AG_SORTIE)?.[1] ?? '';
    expect(regle).toContain('width:100%');
    expect(regle).toContain('align-self:stretch');
    expect(regle).not.toContain('width:auto');
    expect(regle).not.toContain('flex-start');
  });
});

describe('🔴 Arno (23/11/2026) — « Si une date de clôture des comptes n’a jamais été renseignée […] cela doit être possible directement dans cette modale »', () => {
  it('sans copropriété : « Pour saisir la date d’arrêté des comptes et les AG, créez ou rattachez la copropriété (…) » ; aucun champ d’arrêté', async () => {
    arrete.mockClear();
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: false })); });
    expect(container.querySelector('[data-ag-arrete-sans-copro]')?.textContent).toBe(ARRETE_SANS_COPROPRIETE);
    // 🔴 Arno (23/11/2026, suite) — le nouveau texte, mot pour mot
    expect(ARRETE_SANS_COPROPRIETE).toBe('Pour saisir la date d’arrêté des comptes et les AG, créez ou rattachez la copropriété (bouton « Créer une copropriété » ci-dessus).');
    expect(arrete).not.toHaveBeenCalled();
  });
  it('juste après « Créer une copropriété » (fiche validée, fenêtre relue) : le champ d’arrêté de LA nouvelle copropriété, avec son bandeau', async () => {
    arrete.mockClear();
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: false })); });
    const relue = luAgPropre({ ...LU, copropriete: { id: 313, libelle: '_TEST SORTIE CREATION COPRO' } });
    await act(async () => { root.render(createElement(AgSortie, { key: 'copro-313', lu: relue, s: saisieAgInitiale(relue), onChange: () => {}, desactive: false })); });
    expect(arrete).toHaveBeenCalledWith(expect.objectContaining({ coproprieteId: 313, alerteSiManquante: true }));
    expect(container.querySelector('[data-ag-arrete-sans-copro]')).toBeNull();
  });
  it('la fenêtre repart de la copropriété relue (clé par copropriété) : l’arrêté d’une copropriété rattachée n’est pas celui d’avant', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/location/ValidationSortieEdls.tsx', 'utf8')).toContain("<AgSortie key={`copro-${ag.copropriete?.id ?? 'aucune'}`}");
  });
});

describe('🔴 Arno (23/11/2026) — « les 2 boutons (projetée et officielle) sont cerclés de rouge […] retirer le cerclage »', () => {
  it('aucun cerclage rouge du groupe de statut ; le champ date garde son contour rouge et le message reste (rien d’assoupli)', async () => {
    const { CSS_AG_SORTIE, verdictAg } = await import('./AgSortie');
    expect(CSS_AG_SORTIE).not.toMatch(/\.vag-statut\.vag-defaut\s*\{[^}]*outline/);
    expect(CSS_AG_SORTIE).toContain('.vag-defaut input,.vag-defaut input:focus{border-color:var(--color-svv-red)');
    const s = { ...saisieAgInitiale(LU, '2026-11-23'), derniere: '2026-03-25', prochaine: '2027-03-25', statut: null };
    expect(verdictAg(s, LU)).toMatchObject({ ok: false, champs: ['statut'] });
  });
});

describe('🔴 Arno (23/11/2026) — « sélectionner par défaut le bouton "Date projetée" […] passer cette date projetée en date officielle d’un clic »', () => {
  const LU2 = luAgPropre({ ...LU, copropriete: { id: 310, libelle: 'Copro Essai' }, officielles: ['2026-03-25'], arrete: { jour: 31, mois: 12 },
    proposition: { derniere: { date: '2026-03-25', par: 'x', le: '2026-03-26T10:00:00Z' }, prochaine: null } });
  it('un clic sur « Date officielle » : statut officielle, la date ne suit plus le calcul ; la saisie à la main reste possible', async () => {
    const change = vi.fn();
    const s = saisieAgInitiale(LU2);
    expect(s.statut).toBe('projetee');
    await act(async () => { root.render(createElement(AgSortie, { lu: LU2, s, onChange: change, desactive: false })); });
    change.mockClear();
    await act(async () => { (container.querySelector('[data-ag-statut-choix="officielle"]') as HTMLButtonElement).click(); });
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ statut: 'officielle', prochaineTouchee: true, prochaine: s.prochaine }));
    expect((container.querySelector('input[data-ag-prochaine]') as HTMLInputElement).disabled).toBe(false);
  });
  it('sans calcul possible (aucune AGO connue) : aucun bouton présélectionné', () => {
    expect(saisieAgInitiale(LU, '2026-11-23').statut).toBeNull();
  });
});

describe('🔴🔴 Arno (23/11/2026) — « l’utilisateur […] doit clairement savoir pour quelle date il prévient son ou ses locataires » : l’AGO QUI COMPTE', () => {
  const JOUR = '2026-11-23';
  const base = { officielles: ['2026-03-25'], derniere: '', prochaine: '2027-03-25', statut: 'projetee' as const, arrete: { jour: 31, mois: 12 }, jour: JOUR };
  it('sortie APRÈS l’arrêté : l’AGO qui compte (2028) ≠ la prochaine AGO (2027) — c’est elle qui part au locataire', () => {
    const a = agoQuiCompte({ ...base, dateSortie: '2027-01-10' })!;
    expect(a).toEqual({ date: '2028-03-25', statut: 'projetee', incertaine: false, cloture: '2027-12-31' });
    expect(libelleCaseAgoQuiCompte(a)).toBe('Indiquer au locataire l’AGO qui permettra de restituer ses 20 % : attendue vers mars 2028 (date approximative) — exercice clôturé le 31/12/2027.');
    expect(texteAjouteAuMail(a)).toBe('Pour votre logement, il s’agit de l’exercice clos le 31/12/2027, dont les comptes seront approuvés lors de l’assemblée générale ordinaire attendue vers mars 2028 (date approximative, estimée d’après les précédentes assemblées de la copropriété).');
  });
  it('sortie avant l’arrêté : l’AGO qui compte = la prochaine ; la prochaine saisie OFFICIELLE compte comme officielle (« prévue le … »)', () => {
    const a = agoQuiCompte({ ...base, dateSortie: '2026-11-15', prochaine: '2027-03-15', statut: 'officielle' })!;
    expect(a).toEqual({ date: '2027-03-15', statut: 'officielle', incertaine: false, cloture: '2026-12-31' });
    expect(libelleCaseAgoQuiCompte(a)).toBe('Indiquer au locataire l’AGO qui permettra de restituer ses 20 % : prévue le 15/03/2027 — exercice clôturé le 31/12/2026.');
    // l'année suivante se recale sur l'officielle
    expect(agoQuiCompte({ ...base, dateSortie: '2027-01-10', prochaine: '2027-03-15', statut: 'officielle' })?.date).toBe('2028-03-15');
  });
  it('arrêté MANQUANT : « estimation incertaine : date d’arrêté des comptes manquante »', () => {
    const a = agoQuiCompte({ ...base, arrete: null, dateSortie: '2026-11-15' })!;
    expect(a.incertaine).toBe(true);
    expect(libelleCaseAgoQuiCompte(a)).toBe('Indiquer au locataire l’AGO qui permettra de restituer ses 20 % : attendue vers mars 2027 (date approximative) (estimation incertaine : date d’arrêté des comptes manquante).');
  });
  it('la fenêtre : aide sous « Prochaine AGO » ; case = AGO qui compte ; encadré « Texte ajouté au mail du locataire : » = la phrase EXACTE du paragraphe', async () => {
    const lu = luAgPropre({ ...LU, copropriete: { id: 310, libelle: 'Copro' }, officielles: ['2026-03-25'], arrete: { jour: 31, mois: 12 },
      proposition: { derniere: { date: '2026-03-25', par: 'x', le: '2026-03-26T10:00:00Z' }, prochaine: null } });
    const change = vi.fn();
    const s = { ...saisieAgInitiale(lu), mention: true };
    await act(async () => { root.render(createElement(AgSortie, { lu, s, onChange: change, desactive: false, dateSortie: '2027-01-10' })); });
    expect(container.querySelector('[data-ag-aide-prochaine]')?.textContent).toBe(AIDE_PROCHAINE_AGO);
    expect(AIDE_PROCHAINE_AGO).toBe('Prochaine AGO de la copropriété — pas forcément celle qui libère les 20 % : voir ci-dessous.');
    expect(container.querySelector('[data-ag-mention-libelle]')?.textContent).toContain('attendue vers mars 2028 (date approximative) — exercice clôturé le 31/12/2027');
    const phrase = container.querySelector('[data-ag-texte-mail-phrase]')?.textContent ?? '';
    // la fenêtre remonte l'AGO qui compte : le paragraphe du mail porte la MÊME phrase
    const ago = (change.mock.calls.at(-1)?.[0] as { ago: { date: string; statut: 'projetee' } }).ago;
    expect(ago).toMatchObject({ date: '2028-03-25', statut: 'projetee' });
    const { avecMentionAgLocataire } = await import('../../../../lib/location/agCopropriete');
    const { PARAGRAPHE_RETENUE_LOCATAIRE } = await import('../../../../lib/location/validationSortie');
    expect(avecMentionAgLocataire(PARAGRAPHE_RETENUE_LOCATAIRE, ago.date, ago.statut, (ago as unknown as { cloture: string | null }).cloture)).toContain(phrase.replace(/^« … /, '').replace(/ »$/, ''));
  });
});

describe('🔴 Arno (23/11/2026) — « élargir la zone de texte explicative à destination du locataire pour qu’elle occupe toute la largeur de la colonne »', () => {
  it('le champ « Paragraphe ajouté aux mails des locataires » est étiré sur toute la largeur du bloc', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/ValidationSortieEdls.tsx', 'utf8');
    // (23/11/2026, suite) le titre dit à qui le texte est destiné : « Texte ajouté au mail du (des) locataire(s) — modifiable »
    expect(src).toContain('<label className="pvs-champ vse-paragraphe-retenue"><span className="pvs-libelle">{TITRE_TEXTE_LOCATAIRES}</span>');
    expect(src).toMatch(/\.vse-retenue \.vse-paragraphe-retenue\{align-self:stretch;box-sizing:border-box;width:100%;min-width:0\}/);
  });
});

describe('🔴 correctif (23/11/2026) — l’arrêté saisi dans la fenêtre survit au retour du récapitulatif (l’AGO qui compte, donc le mail, avec lui)', () => {
  it('saisie de l’arrêté → la fenêtre relit la copropriété ; un bloc remonté repart de la copropriété RELUE, pas de la première lecture', async () => {
    const relire = vi.fn();
    const avant = luAgPropre({ ...LU, copropriete: { id: 313, libelle: 'Copro' }, officielles: ['2026-03-25'], arrete: { jour: 31, mois: 12 },
      proposition: { derniere: { date: '2026-03-25', par: 'x', le: 'y' }, prochaine: null } });
    await act(async () => { root.render(createElement(AgSortie, { lu: avant, s: saisieAgInitiale(avant), onChange: () => {}, desactive: false, onRelire: relire })); });
    const p = arrete.mock.calls.at(-1)?.[0] as { onChange: (x: { arrete: { jour: number; mois: number } | null }) => void };
    await act(async () => { p.onChange({ arrete: { jour: 30, mois: 6 } }); });
    expect(relire).toHaveBeenCalledTimes(1);
    // le bloc remonté (retour du récapitulatif) avec la copropriété relue : l'AGO qui compte suit le 30/06
    const relue = { ...avant, arrete: { jour: 30, mois: 6 } };
    act(() => root.unmount()); root = createRoot(container);
    const change = vi.fn();
    await act(async () => { root.render(createElement(AgSortie, { lu: relue, s: { ...saisieAgInitiale(avant), mention: true }, onChange: change, desactive: false, dateSortie: '2026-11-20' })); });
    expect(container.querySelector('[data-ag-mention-libelle]')?.textContent).toContain('exercice clôturé le 30/06/2027');
  });
});

/**
 * 🔴🔴 Arno (23/11/2026) — « au-dessus du champ de saisie "Dernière AGO connue", ajouter un champ/bouton qui affiche la date de clôture des comptes
 * de la copropriété ou qui permet de renseigner cette information. »
 */
describe('🔴🔴 la date d’arrêté des comptes juste au-dessus de « Dernière AGO connue »', () => {
  const avant = (a: Element, b: Element): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  it('copropriété rattachée : le MÊME composant ArreteComptes (mis en avant), placé au-dessus du champ « Dernière AGO connue » ; une seule fois', async () => {
    const lu = luAgPropre({ ...LU, copropriete: { id: 310, libelle: 'Copro Essai' } });
    await act(async () => { root.render(createElement(AgSortie, { lu, s: saisieAgInitiale(lu), onChange: () => {}, desactive: false })); });
    const stubs = container.querySelectorAll('[data-stub-arrete]');
    expect(stubs).toHaveLength(1);
    expect(stubs[0].getAttribute('data-stub-arrete')).toBe('310');
    expect(arrete).toHaveBeenLastCalledWith(expect.objectContaining({ coproprieteId: 310, alerteSiManquante: true }));
    expect(avant(stubs[0], container.querySelector('input[data-ag-derniere]')!)).toBe(true);
    expect(avant(container.querySelector('[data-ag-copropriete]')!, stubs[0])).toBe(true);
    expect(container.querySelector('[data-ag-arrete-ligne-sans-copro]')).toBeNull();
  });
  it('aucune copropriété : « Date d’arrêté des comptes : aucune copropriété rattachée » ; le bouton de la ligne (cb744be3) est remplacé par celui de tête', async () => {
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: { ...saisieAgInitiale(LU), copro: 'aucune' }, onChange: () => {}, desactive: false })); });
    const ligne = container.querySelector('[data-ag-arrete-ligne-sans-copro]')!;
    expect(ligne.querySelector('.arc-arrete-ligne')?.textContent).toBe('Date d’arrêté des comptes : aucune copropriété rattachée');
    expect(avant(ligne, container.querySelector('input[data-ag-derniere]')!)).toBe(true);
    expect(container.querySelector('[data-ag-arrete-creer-copro]')).toBeNull();
    expect(container.textContent).not.toContain('Créer une copropriété pour la renseigner');
    expect(container.querySelector('[data-stub-arrete]')).toBeNull();
    // rien d'autre ne bouge : « Créer une copropriété », « Ne pas rattacher maintenant » et le bandeau d'avant restent
    expect(container.querySelector('button[data-ag-copro="creer"]')).not.toBeNull();
    expect(container.querySelector('input[data-ag-copro="aucune"]')).not.toBeNull();
    expect(container.querySelector('[data-ag-arrete-sans-copro]')?.textContent).toBe(ARRETE_SANS_COPROPRIETE);
  });
});

/**
 * 🔴🔴 Arno (23/11/2026) — « refaire le bouton "Créer une copropriété pour cette adresse" si aucune copropriété n'a été créée pour cette adresse […] et
 * lorsque la copropriété est déjà créée, garder ce même bouton en changeant juste le titre par "Accéder à la copropriété" ; en cliquant dessus, la
 * modale de copropriété s'ouvre. »
 */
describe('🔴🔴 le bouton de tête du bloc 20 % : « Créer une copropriété pour cette adresse » / « Accéder à la copropriété »', () => {
  it('sans copropriété : « Créer une copropriété pour cette adresse », EN TÊTE, pleine largeur ; il ouvre LA fiche du bien ; à sa fermeture, la fenêtre se relit', async () => {
    const relire = vi.fn();
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: false, onRelire: relire })); });
    const b = container.querySelector('[data-ag-bouton-copro]') as HTMLButtonElement;
    expect([b.textContent, b.getAttribute('data-ag-bouton-copro')]).toEqual(['Créer une copropriété pour cette adresse', 'creer']);
    expect(container.querySelector('[data-ag-sortie]')!.firstElementChild).toBe(b);
    expect(b.classList.contains('vag-copro-btn')).toBe(true);
    expect(CSS_AG_SORTIE).toContain('.vag-copro-btn{width:100%;min-height:44px;box-sizing:border-box;margin:0 0 8px}');
    await act(async () => { b.click(); });
    expect(fiche).toHaveBeenLastCalledWith(expect.objectContaining({ lotId: 7 }));
    await act(async () => { (container.querySelector('[data-stub-fiche="7"]') as HTMLButtonElement).click(); });
    expect(relire).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('[data-ag-bouton-copro]')).toHaveLength(1);
  });
  it('copropriété rattachée : le MÊME bouton, « Accéder à la copropriété » ; il ouvre la fiche de la copropriété du bien', async () => {
    const lu = luAgPropre({ ...LU, copropriete: { id: 310, libelle: 'Copro Essai' } });
    await act(async () => { root.render(createElement(AgSortie, { lu, s: saisieAgInitiale(lu), onChange: () => {}, desactive: false })); });
    const b = container.querySelector('[data-ag-bouton-copro]') as HTMLButtonElement;
    expect([b.textContent, b.getAttribute('data-ag-bouton-copro')]).toEqual(['Accéder à la copropriété', 'acceder']);
    await act(async () => { b.click(); });
    expect(fiche).toHaveBeenLastCalledWith(expect.objectContaining({ lotId: 7 }));
  });
  it('désactivé pendant un envoi', async () => {
    await act(async () => { root.render(createElement(AgSortie, { lu: LU, s: saisieAgInitiale(LU), onChange: () => {}, desactive: true })); });
    expect((container.querySelector('[data-ag-bouton-copro]') as HTMLButtonElement).disabled).toBe(true);
  });
});
