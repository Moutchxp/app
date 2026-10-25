// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocOrigineLocation } from './BlocOrigineLocation';

/**
 * 🔴 Arno (25/10/2026, 425) — BLOC 9 « ORIGINE DU CONTACT » DE LA FICHE DU BIEN : seulement depuis une ligne du Suivi du mois ; l'origine
 * de la LOCATION ; son propre bouton (un bien incomplet ne le bloque pas) ; « reprise du propriétaire » quand elle est encore à
 * renseigner ; récapitulatif puis Confirmer ; ligne sans location : en lecture, « Dossier non rattaché ». Serveur simulé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const postes: Record<string, unknown>[] = [];
let lecture: Record<string, unknown>;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  postes.length = 0;
  lecture = { origineContact: null, origineContactPrecision: null, apporteurId: null, collegueId: null, empreinte: '|||', avecGestion: false,
    bien: { proprietaireId: 7, nom: 'DUPONT Jean', origine: { origine: 'internet', precision: null, apporteurId: null, collegueId: null }, coproprietairesDifferents: false } };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { postes.push(JSON.parse(String(init.body)) as Record<string, unknown>); return new Response(JSON.stringify({ etat: 'ok', data: { mot: 'Internet' } })); }
    if (url.includes('vue=origine-activite')) return new Response(JSON.stringify({ etat: 'ok', data: lecture }));
    return new Response(JSON.stringify({ etat: 'ok', data: { disponible: true, apporteurs: [], negociateurs: [], collegues: [], regles: [], annuaire: true, moi: 2 } }));
  }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };

describe('🔴 bloc 9 « Origine du contact »', () => {
  it('à renseigner : l’origine du propriétaire est proposée (« reprise du propriétaire »), enregistrable SANS le bien (son propre bouton)', async () => {
    const relu = vi.fn();
    await act(async () => { root.render(createElement(BlocOrigineLocation, { activiteId: 41, numero: 9, origineLigne: '', onEnregistre: relu })); });
    await calmer();
    expect(container.querySelector('#loc-b9')?.textContent).toBe('9Origine du contact');
    expect(container.querySelector('[data-mention-origine="reprise"]')?.textContent).toBe('reprise du propriétaire DUPONT Jean');
    const bouton = container.querySelector('[data-enregistrer-origine]') as HTMLButtonElement;
    expect(bouton.type).toBe('button');
    expect(bouton.disabled).toBe(false);
    await act(async () => { bouton.click(); });
    expect(document.querySelector('[data-recap-origine]')?.textContent).toContain('à renseigner → Internet');
    await act(async () => { (document.querySelector('[data-confirmer-origine]') as HTMLButtonElement).click(); });
    await calmer();
    expect(postes).toEqual([{ action: 'origine-activite', id: 41, empreinte: '|||',
      origine: { origineContact: 'internet', origineContactPrecision: '', apporteurId: null, collegueId: null } }]);
    expect(relu).toHaveBeenCalled();
    // La modale (l'hôte) reste ouverte : le bloc dit l'enregistrement.
    expect(container.querySelector('[data-issue-origine="ok"]')?.textContent).toContain('Origine enregistrée');
  });

  it('une origine déjà saisie n’est pas remplacée ; différente du propriétaire : la mention', async () => {
    lecture = { ...lecture, origineContact: 'passage_agence', empreinte: 'passage_agence|||' };
    await act(async () => { root.render(createElement(BlocOrigineLocation, { activiteId: 41, numero: 9, origineLigne: 'Passage agence', onEnregistre: () => {} })); });
    await calmer();
    expect(container.querySelector('[data-mention-origine="differente"]')?.textContent).toBe('différente de l’origine du propriétaire');
    expect((container.querySelector('[data-enregistrer-origine]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('ligne sans location : en lecture, « Dossier non rattaché », rien n’est lu ni écrit', async () => {
    await act(async () => { root.render(createElement(BlocOrigineLocation, { activiteId: null, numero: 9, origineLigne: 'Internet', onEnregistre: () => {} })); });
    await calmer();
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
  });
});
