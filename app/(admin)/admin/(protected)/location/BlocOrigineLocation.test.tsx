// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocOrigineLocation } from './BlocOrigineLocation';

/**
 * 🔴 Arno (25/10/2026) — BLOC 9 « ORIGINE DU CONTACT » DE LA FICHE DU BIEN (le composant `OrigineActivite`, le même que le Dossier de
 * location) : seulement depuis une ligne du Suivi du mois ; une origine enregistrée en LECTURE avec « Modifier » ; la DOUBLE VALIDATION
 * (conséquences, case « J'ai bien compris… », « Confirmer la modification ») ; la PREMIÈRE saisie en une validation ; l'origine imposée par
 * « Relocation » seulement si la case est cochée ET l'origine est « Relocation » ; ligne sans location : en lecture. Serveur simulé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const postes: Record<string, unknown>[] = [];
let lecture: Record<string, unknown>;
const proprietaire = { proprietaireId: 7, nom: 'DUPONT Jean', origine: { origine: 'internet', precision: null, apporteurId: null, collegueId: null }, coproprietairesDifferents: false };
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  postes.length = 0;
  lecture = { origineContact: null, origineContactPrecision: null, apporteurId: null, collegueId: null, empreinte: '|||', avecGestion: false, mandatGestion: false, source: 'saisie',
    validation: null, bien: proprietaire };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      postes.push(corps);
      if (corps.simuler === true) return new Response(JSON.stringify({ etat: 'ok', data: { lignes: [{ groupe: 'Origine', libelle: 'Origine du contact', avant: 'à renseigner', apres: 'Internet' },
        { groupe: 'Dossier', libelle: 'Statut du bien', avant: 'À qualifier', apres: 'Nouveau sans gestion' }] } }));
      return new Response(JSON.stringify({ etat: 'ok', data: { mot: 'Internet' } }));
    }
    if (url.includes('vue=origine-activite')) return new Response(JSON.stringify({ etat: 'ok', data: lecture }));
    return new Response(JSON.stringify({ etat: 'ok', data: { disponible: true, apporteurs: [], negociateurs: [], collegues: [{ id: 2, libelle: 'Arnaud Jorel' }], regles: [], annuaire: true, moi: 2 } }));
  }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); }); };
const monter = async (props: Partial<Parameters<typeof BlocOrigineLocation>[0]> = {}) => {
  await act(async () => { root.render(createElement(BlocOrigineLocation, { activiteId: 41, numero: 9, origineLigne: '', onEnregistre: () => {}, ...props })); });
  await calmer();
};
const clic = async (sel: string) => { await act(async () => { (document.querySelector(sel) as HTMLElement).click(); }); await calmer(); };

describe('🔴 bloc 9 « Origine du contact » : première saisie', () => {
  it('à renseigner : les champs directement, l’origine du propriétaire PROPOSÉE ; UNE validation (conséquences, sans case) ; enregistrable sans le bien', async () => {
    const relu = vi.fn();
    await monter({ onEnregistre: relu });
    expect(container.querySelector('#loc-b9')?.textContent).toBe('9Origine du contact');
    expect(container.querySelector('[data-origine-activite="edition"]')).not.toBeNull();
    expect(container.querySelector('[data-mention-origine="reprise"]')?.textContent).toBe('reprise du propriétaire DUPONT Jean');
    const bouton = container.querySelector('[data-enregistrer-origine]') as HTMLButtonElement;
    expect([bouton.type, bouton.disabled]).toEqual(['button', false]);
    await clic('[data-enregistrer-origine]');
    expect(document.querySelector('[data-validation-origine="premiere"]')).not.toBeNull();
    expect(document.querySelector('[data-compris]')).toBeNull();
    expect([...document.querySelectorAll('[data-consequence]')].map((e) => e.getAttribute('data-consequence'))).toEqual(['Origine du contact', 'Statut du bien']);
    expect(postes).toEqual([{ action: 'origine-activite', id: 41, ecran: 'Fiche du bien (Suivi du mois)', simuler: true,
      origine: { origineContact: 'internet', origineContactPrecision: '', apporteurId: null, collegueId: null } }]);
    await clic('[data-confirmer-origine]');
    expect(postes[1]).toMatchObject({ action: 'origine-activite', id: 41, empreinte: '|||' });
    expect(postes[1].simuler).toBeUndefined();
    expect(relu).toHaveBeenCalled();
    expect(container.querySelector('[data-issue-origine="ok"]')?.textContent).toBe('✓ Origine enregistrée.');
  });
});

describe('🔴 une origine enregistrée : LECTURE par défaut, « Modifier », DOUBLE validation', () => {
  beforeEach(() => { lecture = { ...lecture, origineContact: 'passage_agence', empreinte: 'passage_agence|||', validation: { par: 'Arnaud Jorel', le: '2026-10-20 10:00:00+02' } }; });

  it('lecture : la valeur, « validé par <nom> le <date> », la mention ; aucun champ ; un bouton « Modifier »', async () => {
    await monter();
    expect(container.querySelector('[data-origine-activite="lecture"]')).not.toBeNull();
    expect(container.querySelector('[data-origine-valeur]')?.textContent).toBe('Passage agence');
    expect(container.querySelector('[data-origine-trace]')?.textContent).toBe('Validé par Arnaud Jorel le 20/10/2026. Différente de l’origine du propriétaire.');
    expect(container.querySelector('[data-origine-contact]')).toBeNull();
    expect(container.querySelector('[data-modifier-origine]')?.textContent).toBe('Modifier');
  });

  it('« Modifier » → champs, « Annuler » / « Enregistrer l’origine » ; puis la case obligatoire : « Confirmer la modification » inactif tant qu’elle n’est pas cochée', async () => {
    const relu = vi.fn();
    await monter({ onEnregistre: relu });
    await clic('[data-modifier-origine]');
    expect(container.querySelector('[data-origine-activite="edition"]')).not.toBeNull();
    expect(container.querySelector('[data-annuler-origine]')).not.toBeNull();
    await clic('[data-enregistrer-origine]');
    expect(document.querySelector('[data-validation-origine="modification"]')).not.toBeNull();
    const confirmer = document.querySelector('[data-confirmer-origine]') as HTMLButtonElement;
    expect([confirmer.textContent, confirmer.disabled]).toEqual(['Confirmer la modification', true]);
    await clic('[data-confirmer-origine]');
    expect(postes.filter((p) => p.simuler !== true)).toEqual([]);
    // « Revenir » ramène aux champs sans rien perdre.
    await clic('[data-revenir-origine]');
    expect(container.querySelector('[data-origine-activite="edition"]')).not.toBeNull();
    await clic('[data-enregistrer-origine]');
    await clic('[data-compris]');
    expect((document.querySelector('[data-confirmer-origine]') as HTMLButtonElement).disabled).toBe(false);
    await clic('[data-confirmer-origine]');
    expect(postes.filter((p) => p.simuler !== true)).toHaveLength(1);
    expect(relu).toHaveBeenCalled();
    expect(container.querySelector('[data-issue-origine="ok"]')?.textContent).toBe('✓ Origine modifiée.');
  });
});

describe('🔴 l’origine IMPOSÉE par Relocation — et l’incohérence de CHEKROUNE', () => {
  it('case « Relocation » cochée ET origine « Relocation » : « Modifier » dit d’abord comment la changer, avec un lien vers les cases', async () => {
    lecture = { ...lecture, origineContact: 'relocation', avecGestion: true, empreinte: 'relocation|||' };
    const cases = vi.fn();
    await monter({ onAllerAuxCases: cases });
    expect(container.querySelector('[data-origine-trace]')?.textContent).toContain('Imposée par la case « Relocation »');
    await clic('[data-modifier-origine]');
    expect(container.querySelector('[data-origine-imposee-avertissement]')?.textContent).toContain('L’origine est imposée par la case Relocation. Pour la changer, décochez Relocation.');
    await clic('[data-aller-aux-cases]');
    expect(cases).toHaveBeenCalled();
  });

  it('🔴 CHEKROUNE : une ligne reprise du fichier « avec gestion » dont l’origine est « Collègue directement » n’est PAS imposée (rien n’est grisé)', async () => {
    lecture = { ...lecture, origineContact: 'collegue', collegueId: 2, avecGestion: true, mandatGestion: true, source: 'import', empreinte: 'collegue||2|',
      bien: { ...proprietaire, nom: 'CHEKROUNE Martine', origine: { origine: 'collegue', precision: null, apporteurId: null, collegueId: 2 } } };
    await monter();
    expect(container.querySelector('[data-origine-trace]')?.textContent).toBe('Reprise du fichier de suivi. Identique à l’origine du propriétaire CHEKROUNE Martine.');
    await clic('[data-modifier-origine]');
    expect(container.querySelector('[data-origine-imposee-avertissement]')).toBeNull();
    expect((container.querySelector('[data-origine-contact]') as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('[data-origine-imposee]')).toBeNull();
  });
});

describe('🔴 bloc 9 : sa place', () => {
  it('ligne sans location : en lecture, « Dossier non rattaché », rien n’est lu ni écrit', async () => {
    await monter({ activiteId: null, origineLigne: 'Internet' });
    expect(container.querySelector('[data-origine-non-rattache]')?.textContent).toContain('Dossier non rattaché');
    expect(container.querySelector('[data-enregistrer-origine]')).toBeNull();
    expect(postes).toEqual([]);
  });

  it('présent SEULEMENT depuis le Suivi du mois : seule la feuille du mois passe le bloc à la Fiche du bien', () => {
    const lire = (f: string) => readFileSync(path.join(process.cwd(), 'app/(admin)/admin/(protected)', f), 'utf8');
    expect(lire('location/FeuilleDuMois.tsx')).toContain('blocApres={(numero) => <BlocOrigineLocation');
    for (const f of ['location/CreationLocataire.tsx', 'location/ModaleDossierLocation.tsx', 'location/ModaleFicheLocataire.tsx']) expect(lire(f)).not.toContain('blocApres');
    // Le bloc est rendu sous « Statut du bien », hors du bouton d'enregistrement du bien (un bien incomplet ne le bloque pas).
    expect(lire('location/CreationBien.tsx')).toContain('{modification.blocApres?.(n(\'gestion\') + 1)}');
    // Le Dossier de location passe par le MÊME composant (`OrigineActivite`).
    expect(lire('location/ModaleDossierLocation.tsx')).toContain('origineFlux={{ activiteId,');
  });
});
