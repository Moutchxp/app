// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CreationBien } from './CreationBien';
import { SectionLocationBien, SectionLocationProprietaire } from '../gestion/SectionsLocationFiche';

/**
 * 🔴 Retouches d'Arno (18/10/2026) : bloc 6 aligné et « Entretien à prévoir » ; annexes annotées, Supprimer / Détacher / Fermer
 * (formulaire ET fiche commune) ; mandat de transaction visible dans la fiche commune. Vrais composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const bien = (id: number, o: Record<string, unknown> = {}) => ({
  id, numero: String(id), adresse: '10 rue de l’Essai', codePostal: '75011', commune: 'PARIS', nature: null, typeBien: null,
  categorie: 'logement', etage: null, porte: null, numLotCopro: null, surfaceCarrezM2: null, surfaceExterieureM2: null, parentId: null,
  proprietaire: 'EXEMPLE Claire', locataireEnPlace: null, creeDansLApplication: true, ...o,
});
let container: HTMLDivElement;
let root: Root;
let posts: Record<string, unknown>[];
let detachee: boolean;
let annexeLouee = false;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; detachee = false; annexeLouee = false;
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      const c = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(c);
      if (c.action === 'detacher-annexe') detachee = c.detacher === true;
      return ok({ logementId: 9 });
    }
    // Arno (18/10/2026) : « Supprimer » lit d'abord l'aperçu ; une annexe LOUÉE passe par l'avertissement.
    if (u.includes('apercuArchivage=11')) {
      return ok({ sujet: 'bien', id: 11, nom: 'Parking', sortie: null, biens: [11], partages: [], locatairesArchives: [], locatairesGardes: [],
        occupees: annexeLouee ? [{ occupationId: 5, lotId: 11, adresse: '10 rue de l’Essai', lot: '12', locataireId: 3, locataire: 'GARAGE Léa', entree: null }] : [] });
    }
    if (u.includes('cartesProprietaires=')) return ok([{ id: 1, nom: 'DUPONT Paul', telephone: null, email: null, biens: [] }]);
    if (u.includes('proprietaire=7')) {
      return ok({ fiche: { id: 7, nom: 'EXEMPLE', coordonnees: [] }, sortie: null, numeroMandat: null, numeroMandatTransaction: 'MT 2026-041', enGestion: false, biens: [], location372: true });
    }
    if (u.includes('lot=10')) {
      return ok({
        fiche: { id: 10, numero: '10', adresse: '10 rue de l’Essai', proprietaires: [], occupants: [], occupations: [], modifiable: true },
        bien: bien(10), parent: null, rattachables: [], locations: [], location372: true,
        annexes: [bien(11, { categorie: 'parking', parentId: 10, parkingSituation: 'interieur', parkingType: 'box_simple', numLotCopro: '12', porte: '4',
          annotation: 'Clé chez le gardien', detachee })],
        complements: { batiment: null, escalier: null, typeLogement: 'studio', nombrePieces: null, meuble: null, surfaceHabitableM2: null, syndicId: null, syndicNom: null,
          epoqueConstruction: null, chauffage: null, dpeClasse: null, dpeDate: null, commentaire: null, typeLocal: null, parkingSituation: null, parkingType: null,
          surfaceM2: null, ascenseur: null, digicode: null, digicodeCode: null, precisionAcces: null, agApplicable: false,
          entretienAPrevoir: true, entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-10-01' }, { sorte: 'autre', nom: 'VMC', dateAnniversaire: null }] },
      });
    }
    return ok(null);
  }) as unknown as typeof fetch;
  Object.defineProperty(window, 'location', { value: { href: '' }, writable: true, configurable: true });
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const bouton = (t: string, dans: ParentNode = container) => [...dans.querySelectorAll('button')].find((b) => b.textContent?.trim() === t) as HTMLButtonElement;
const saisir = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const remplirMinimum = async () => {
  await act(async () => { (container.querySelector('[data-famille="logement"]') as HTMLButtonElement).click(); });
  await act(async () => { [...container.querySelectorAll('[aria-label="Type de logement"] button')][0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await saisir(container.querySelector('.cab-enveloppe input') as HTMLInputElement, '3 rue du Port');
  await remplirDpeEntretien();
};
/** Arno (18/10/2026) : DPE et « Entretien à prévoir » sont obligatoires pour un logement / local — remplis ici (classe D, date, Non). */
const remplirDpeEntretien = async () => {
  await act(async () => { [...container.querySelectorAll('[aria-label="Classe DPE"] button')].find((b) => b.textContent === 'D')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await saisir(container.querySelector('[data-dpe-date] input') as HTMLInputElement, '2024-03-01');
  await act(async () => { (container.querySelector('[data-entretien-reponse="non"]') as HTMLButtonElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const soumettre = async () => { await act(async () => { (container.querySelector('[data-collant] button[type="submit"]') as HTMLButtonElement).click(); }); await calmer(); };

describe('🔴 bloc 6 : la date d’AG alignée ; « Entretien à prévoir »', () => {
  it('AG dans la même grille qu’Époque et Chauffage, alignée EN HAUT (la légende ne décale rien)', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
    await calmer();
    await remplirMinimum();
    const ligne = container.querySelector('[data-ligne-epoque]') as HTMLElement;
    expect(ligne.classList.contains('loc-grille--debut')).toBe(true);
    expect([...ligne.querySelectorAll(':scope > label')].map((l) => l.firstChild?.textContent)).toEqual(['Époque de construction', 'Chauffage', 'Date de la dernière AG']);
    const css = [...container.querySelectorAll('style')].map((x) => x.textContent).join('');
    expect(css).toContain('.loc-ample .loc-grille.loc-grille--debut{align-items:start}');
  });

  it('Oui : chaudière + date, ramonage, deux autres (un supprimé) ; envoyés ; Non vide le tout', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
    await calmer();
    await remplirMinimum();
    const bloc = () => container.querySelector('[data-entretien-bloc]') as HTMLElement;
    const pil = (mot: string) => [...bloc().querySelectorAll('[aria-label="Entretien à prévoir"] button')].find((b) => b.textContent === mot) as HTMLButtonElement;
    expect(bloc().querySelector('h4')?.textContent).toBe('Entretien à prévoir *');
    expect(bloc().querySelector('[data-entretien]')).toBeNull();
    await act(async () => { pil('Oui').click(); });
    const chaudiere = () => bloc().querySelector('[data-entretien="chaudiere"]') as HTMLElement;
    expect((chaudiere().querySelector('input[type="date"]') as HTMLInputElement).disabled).toBe(true);
    await act(async () => { (chaudiere().querySelector('input[type="checkbox"]') as HTMLInputElement).click(); });
    await saisir(chaudiere().querySelector('input[type="date"]') as HTMLInputElement, '2026-10-01');
    await act(async () => { (bloc().querySelector('[data-entretien="ramonage"] input[type="checkbox"]') as HTMLInputElement).click(); });
    for (const nom of ['Climatisation', 'VMC']) {
      await act(async () => { (bloc().querySelector('[data-ajouter-entretien]') as HTMLButtonElement).click(); });
      const autres = bloc().querySelectorAll('[data-entretien="autre"]');
      await saisir(autres[autres.length - 1].querySelector('input:not([type])') as HTMLInputElement, nom);
    }
    await saisir([...bloc().querySelectorAll('[data-entretien="autre"]')][1].querySelector('input[type="date"]') as HTMLInputElement, '2027-05-02');
    await act(async () => { bouton('Supprimer', [...bloc().querySelectorAll('[data-entretien="autre"]')][0]).click(); });
    await soumettre();
    expect(posts[0].logement).toMatchObject({ entretienAPrevoir: true, entretiens: [
      { sorte: 'chaudiere', dateAnniversaire: '2026-10-01' }, { sorte: 'ramonage', dateAnniversaire: '' }, { sorte: 'autre', nom: 'VMC', dateAnniversaire: '2027-05-02' }] });
    // Non vide le tout ; repasser à Oui repart de zéro.
    await act(async () => { pil('Non').click(); });
    expect(bloc().querySelector('[data-entretien]')).toBeNull();
    await act(async () => { pil('Oui').click(); });
    expect((chaudiere().querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(bloc().querySelectorAll('[data-entretien="autre"]')).toHaveLength(0);
  });
});

describe('🔴 annexes du formulaire : annotation ; Supprimer (confirmé) · Détacher / Rattacher · Fermer / Ouvrir', () => {
  it('annotation (2 lignes, s’agrandit) envoyée ; Fermer ⇒ ligne résumée ; Détacher ⇒ « Détachée » envoyé ; Supprimer après confirmation', async () => {
    await act(async () => { root.render(createElement(CreationBien, { proprietairesInitiaux: [1] })); });
    await calmer();
    await remplirMinimum();
    await act(async () => { bouton('+ Parking').click(); });
    const carte = () => container.querySelector('[data-annexe="parking"]') as HTMLElement;
    expect(bouton('Retirer', carte())).toBeUndefined();
    expect([...carte().querySelectorAll('.loc-annexe-actions button')].map((b) => b.textContent)).toEqual(['Supprimer', 'Détacher', 'Fermer']);
    const zone = carte().querySelector('[data-annotation] textarea') as HTMLTextAreaElement;
    expect([zone.rows, zone.classList.contains('loc-zone-auto')]).toEqual([2, true]);
    await saisir(zone, 'Accès par la cour\nclé chez le gardien\nbadge bleu');
    await act(async () => { [...carte().querySelectorAll('[aria-label="Type de parking"] button')][2].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await saisir([...carte().querySelectorAll('.loc-champ input')].find((i) => i.closest('label')?.firstChild?.textContent === 'N° de place') as HTMLInputElement, '4');
    // Fermer : une ligne résumée ; un clic la rouvre.
    await act(async () => { bouton('Fermer', carte()).click(); });
    expect(carte().querySelector('[data-resume-annexe]')?.textContent).toBe('Parking · Box simple · place 4');
    expect(carte().querySelector('[data-annotation]')).toBeNull();
    await act(async () => { (carte().querySelector('[data-resume-annexe]') as HTMLButtonElement).click(); });
    expect(carte().querySelector('[data-annotation]')).not.toBeNull();
    // Détacher / Rattacher.
    await act(async () => { bouton('Détacher', carte()).click(); });
    expect(carte().querySelector('.loc-etiquette-detachee')?.textContent).toBe('Détachée');
    expect(bouton('Rattacher', carte())).toBeDefined();
    await soumettre();
    expect((posts[0].annexes as Record<string, unknown>[])[0]).toMatchObject({ categorie: 'parking', detachee: true, annotation: 'Accès par la cour\nclé chez le gardien\nbadge bleu' });
    await act(async () => { bouton('Rattacher', carte()).click(); });
    expect(carte().querySelector('.loc-etiquette-detachee')).toBeNull();
    // Supprimer : d'abord une confirmation ; « Non » garde l'annexe, « Oui, supprimer » la retire.
    await act(async () => { bouton('Supprimer', carte()).click(); });
    await act(async () => { bouton('Non', carte()).click(); });
    expect(carte()).not.toBeNull();
    await act(async () => { bouton('Supprimer', carte()).click(); });
    await act(async () => { bouton('Oui, supprimer', carte()).click(); });
    expect(container.querySelector('[data-annexe="parking"]')).toBeNull();
  });
});

describe('🔴 fiche commune : carte d’annexe, entretien, mandat de transaction', () => {
  it('annexe sous son logement : annotation, Détacher → « Détachée » (lien gardé), Rattacher ; Supprimer = sortie du portefeuille confirmée', async () => {
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    const carte = () => container.querySelector('[data-carte-annexe="11"]') as HTMLElement;
    expect(carte().closest('[data-annexe="oui"]')).not.toBeNull();
    expect((carte().querySelector('[data-annotation] textarea') as HTMLTextAreaElement).value).toBe('Clé chez le gardien');
    await saisir(carte().querySelector('[data-annotation] textarea') as HTMLTextAreaElement, 'Clé chez la gardienne');
    await act(async () => { bouton('Enregistrer l’annotation', carte()).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'modifier-bien', id: 11, champs: { annotation: 'Clé chez la gardienne', categorie: 'parking' } });
    await act(async () => { bouton('Détacher', carte()).click(); });
    await calmer();
    expect(posts.at(-1)).toEqual({ action: 'detacher-annexe', id: 11, detacher: true });
    // Relue : toujours SOUS le logement, avec l'étiquette « Détachée ».
    expect(container.querySelector('[data-annexe="oui"] .loc-etiquette-detachee')?.textContent).toBe('Détachée');
    await act(async () => { bouton('Rattacher', carte()).click(); });
    await calmer();
    expect(posts.at(-1)).toEqual({ action: 'detacher-annexe', id: 11, detacher: false });
    await act(async () => { bouton('Fermer', carte()).click(); });
    expect(carte().querySelector('[data-resume-annexe]')?.textContent).toBe('Parking · Intérieur · Box simple · lot 12 · place 4');
    await act(async () => { bouton('Supprimer', carte()).click(); });
    expect(carte().querySelector('[data-confirmer-suppression]')?.textContent).toContain('rien n’est effacé');
    await act(async () => { bouton('Oui, supprimer', carte()).click(); });
    await calmer();
    expect(posts.at(-1)).toEqual({ action: 'sortir', sujet: 'bien', id: 11 });
    // Une annexe LOUÉE : la modale des biens occupés d'abord (même avertissement que partout), puis la confirmation envoyée.
    annexeLouee = true;
    await act(async () => { bouton('Supprimer', carte()).click(); });
    await act(async () => { bouton('Oui, supprimer', carte()).click(); });
    await calmer();
    const modale = document.querySelector('[data-modale-archivage]');
    expect(modale?.querySelector('[data-occupation="5"]')?.textContent).toContain('GARAGE Léa');
    await act(async () => { (modale?.querySelector('[data-confirmer-archivage]') as HTMLButtonElement).click(); });
    await calmer();
    expect(posts.at(-1)).toEqual({ action: 'sortir', sujet: 'bien', id: 11, confirmeOccupation: true });
  });

  it('entretien lu et modifiable ; mandat de transaction visible', async () => {
    await act(async () => { root.render(createElement(SectionLocationBien, { lotId: 10, ouvrir: () => {} })); });
    await calmer();
    const comp = container.querySelector('[data-complements]') as HTMLElement;
    expect(comp.textContent).toContain('Entretien à prévoir');
    expect(comp.textContent).toContain('Chaudière (le 01/10/2026) · VMC');
    await act(async () => { bouton('Modifier', comp).click(); });
    expect((comp.querySelector('[data-entretien="chaudiere"] input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);
    expect((comp.querySelector('[data-entretien="autre"] input:not([type])') as HTMLInputElement).value).toBe('VMC');
    await act(async () => { [...comp.querySelectorAll('[aria-label="Entretien à prévoir"] button')].find((b) => b.textContent === 'Non')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { bouton('Enregistrer', comp).click(); });
    await calmer();
    expect(posts.at(-1)).toMatchObject({ action: 'complements-bien', id: 10, champs: { entretienAPrevoir: false, entretiens: [] } });
    act(() => { root.unmount(); });
    root = createRoot(container);
    await act(async () => { root.render(createElement(SectionLocationProprietaire, { proprietaireId: 7 })); });
    await calmer();
    const mt = container.querySelector('[data-mandat="transaction"]') as HTMLElement;
    expect(mt.querySelector('h3')?.textContent).toBe('N° de mandat de transaction locative');
    expect((mt.querySelector('input') as HTMLInputElement).value).toBe('MT 2026-041');
  });
});
