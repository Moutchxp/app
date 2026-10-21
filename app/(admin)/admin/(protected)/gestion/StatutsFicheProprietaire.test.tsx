// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
import { Annuaire } from './Annuaire';

/**
 * 🔴 Arno (21/10/2026, 403) — LA FICHE PROPRIÉTAIRE SELON LE STATUT DES BIENS :
 *   · GESTION (la route écarte la location seule et la compte) : « Biens en gestion », « Anciens biens » = l'ancienne gestion, et la
 *     ligne discrète « + N bien(s) en location seule → voir dans la Location » ;
 *   · LOCATION (la route rend tout) : une section « Biens en location seule », pastille bleue ; pas de ligne discrète ;
 *   · la fiche se demande avec `vue=gestion` — c'est la route qui décide (jamais depuis la Location).
 * Le vrai composant, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const bien = (id: number, o: Record<string, unknown>) => ({
  id, numero: String(id), adresse: `${id} rue Fictive`, commune: 'PUTEAUX', codePostal: '92800', nature: null, typeBien: null,
  surfaceM2: null, debut: null, fin: null, locataire: null, locataireId: null, locataireDepuis: null, mails: 3, dernierEchange: null,
  evenementsOuverts: 0, driveDossierId: null, categorie: 'logement', nombrePieces: null, etageSaisi: null, annexeDe: null, annexes: [], porte: null,
  numLotCopro: null, detachee: false, detacheeLe: null, titulaireId: 49, ...o,
});
let fiche: Record<string, unknown>;
let urls: string[];
let hote: HTMLDivElement;
let racine: Root;
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); urls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    urls.push(u);
    if (u.includes('/api/admin/gestion/annuaire?proprietaire=')) {
      return reponse({ etat: 'ok', data: { id: 49, cle: 'P49', nom: 'MIXTE Paul', civilite: null, adresse: null, commune: null, codePostal: null,
        relationDepuis: null, absent: false, contacts: [], driveDossierId: null, lots: [], personnes: [], modifiable: false, suppressionDisponible: false, ...fiche } });
    }
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { racine.render(createElement(Annuaire as never, { fiche: { sorte: 'proprietaire', id: 49 }, onFiche: () => {}, onRetour: () => {} })); });
  await calmer();
};
const refs = (sel: string) => [...hote.querySelectorAll(`${sel} li.ann-carte .ann-carte-ref`)].map((r) => r.textContent);

describe('🔴 la fiche propriétaire selon le statut des biens', () => {
  it('GESTION : en gestion, anciens = ancienne gestion, et la ligne discrète vers la Location', async () => {
    fiche = { biens: [bien(1, { statut: 'en_gestion' }), bien(3, { statut: 'ancienne_gestion', fin: '2026-10-01' })], biensLocationSeule: 2 };
    await monter();
    expect(urls[0]).toBe('/api/admin/gestion/annuaire?proprietaire=49&vue=gestion');
    expect(refs('section[aria-labelledby="ann-biens"]')).toEqual(['Réf. Wippimmo 1']);
    const ligne = hote.querySelector('[data-location-seule-ailleurs]')!;
    expect(ligne.textContent).toBe('+ 2 biens en location seule → voir dans la Location');
    expect(ligne.querySelector('a')?.getAttribute('href')).toBe('/admin/location/proprietaire/49');
    expect(hote.querySelector('[data-biens-location-seule]')).toBeNull();
    // Les anciens (repliés) : l'ancienne gestion, pastille grise.
    const repli = [...hote.querySelectorAll('button.ann-repli')].find((b) => b.textContent?.includes('Anciens biens'))!;
    expect(repli.textContent).toContain('1');
    await act(async () => { (repli as HTMLElement).click(); });
    await calmer();
    const ancienne = [...hote.querySelectorAll('li.ann-carte')].find((c) => c.querySelector('.ann-carte-ref')?.textContent === 'Réf. Wippimmo 3')!;
    expect(ancienne.querySelector('[data-statut-bien]')?.className).toContain('sdb-pastille--gris');
    // Le bien en gestion ne porte pas de pastille (sa section le dit).
    const vivant = [...hote.querySelectorAll('li.ann-carte')].find((c) => c.querySelector('.ann-carte-ref')?.textContent === 'Réf. Wippimmo 1')!;
    expect(vivant.querySelector('[data-statut-bien]')).toBeNull();
  });

  it('« + 1 bien » au singulier ; rien quand aucun bien n’est en location seule', async () => {
    fiche = { biens: [bien(1, { statut: 'en_gestion' })], biensLocationSeule: 1 };
    await monter();
    expect(hote.querySelector('[data-location-seule-ailleurs]')?.textContent).toBe('+ 1 bien en location seule → voir dans la Location');
    act(() => racine.unmount()); racine = createRoot(hote);
    fiche = { biens: [bien(1, { statut: 'en_gestion' })], biensLocationSeule: 0 };
    await monter();
    expect(hote.querySelector('[data-location-seule-ailleurs]')).toBeNull();
  });

  it('LOCATION (tout est rendu) : la section « Biens en location seule », pastille bleue, ni dans « en gestion » ni dans « anciens »', async () => {
    fiche = { biens: [bien(1, { statut: 'en_gestion' }), bien(2, { statut: 'location_seule' }), bien(3, { statut: 'ancienne_gestion', fin: '2026-10-01' })] };
    await monter();
    expect(refs('section[aria-labelledby="ann-biens"]')).toEqual(['Réf. Wippimmo 1']);
    expect(refs('[data-biens-location-seule]')).toEqual(['Réf. Wippimmo 2']);
    expect(hote.querySelector('[data-biens-location-seule] .gst-compte')?.textContent).toBe('1');
    expect(hote.querySelector('[data-biens-location-seule] [data-statut-bien]')?.className).toContain('sdb-pastille--bleu');
    expect(hote.querySelector('[data-location-seule-ailleurs]')).toBeNull();
    // « En gestion depuis » est propre à la gestion : absent de la carte en location seule, présent sur celle en gestion.
    expect(hote.querySelector('[data-biens-location-seule] li.ann-carte')?.textContent).not.toContain('En gestion depuis');
    expect(hote.querySelector('section[aria-labelledby="ann-biens"] li.ann-carte')?.textContent).toContain('En gestion depuis');
    const repli = [...hote.querySelectorAll('button.ann-repli')].find((b) => b.textContent?.includes('Anciens biens'))!;
    expect(repli.querySelector('.gst-compte')?.textContent).toBe('1');
  });

  it('🔴 405 — « Gestion terminée » : bandeau gris en tête de carte, pastille « Gestion terminée », hors « Biens en gestion » ; archivé : pastille « Ancienne gestion »', async () => {
    fiche = { biens: [bien(1, { statut: 'en_gestion' }), bien(3, { statut: 'ancienne_gestion', fin: '2026-10-21', finStatut: '2026-10-21', archiveLe: null }),
      bien(4, { statut: 'ancienne_gestion', fin: '2024-01-10', finStatut: '2024-01-10', archiveLe: '2026-01-10 05:15:00+01' })] };
    await monter();
    expect(refs('section[aria-labelledby="ann-biens"]')).toEqual(['Réf. Wippimmo 1']);
    expect(hote.querySelector('section[aria-labelledby="ann-biens"] .gst-compte')?.textContent).toBe('1');
    const repli = [...hote.querySelectorAll('button.ann-repli')].find((b) => b.textContent?.includes('Anciens biens'))!;
    await act(async () => { (repli as HTMLElement).click(); });
    await calmer();
    const carte = (n: number) => [...hote.querySelectorAll('li.ann-carte')].find((c) => c.querySelector('.ann-carte-ref')?.textContent === `Réf. Wippimmo ${n}`)!;
    expect(carte(3).firstElementChild?.getAttribute('data-gestion-terminee')).not.toBeNull();
    expect(carte(3).querySelector('[data-gestion-terminee]')?.textContent).toBe('Gestion terminée le 21/10/2026 — plus en gestion active');
    expect(carte(3).querySelector('[data-statut-bien]')?.textContent).toBe('Gestion terminée');
    expect(carte(4).querySelector('[data-gestion-terminee]')).toBeNull();
    expect(carte(4).querySelector('[data-statut-bien]')?.textContent).toBe('Ancienne gestion');
    expect(carte(1).querySelector('[data-gestion-terminee]')).toBeNull();
  });

  it('🔴 405 — fiche du bien : bandeau en tête (après la bande d’événement), plus de « + Tâche » pour un bien qui n’est plus en gestion active', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toMatch(/\{f\.statut !== 'ancienne_gestion' && \(\s*<BoutonTache lotId=\{Number\(f\.id\)\}/);
    expect(src).toMatch(/<CartoucheEvenement nb=\{f\.evenementsOuverts\}[\s\S]{0,400}\{enGestionTerminee\(f\) && <><style>\{CSS_PASTILLE_STATUT\}<\/style><BandeauGestionTerminee fin=\{f\.finStatut\} \/><\/>\}/);
    expect(src).toMatch(/\{enGestionTerminee\(o\) && <><style>\{CSS_PASTILLE_STATUT\}<\/style><BandeauGestionTerminee fin=\{o\.finStatut\} \/><\/>\}/);
  });
});
