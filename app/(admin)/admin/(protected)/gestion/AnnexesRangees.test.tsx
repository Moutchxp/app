// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
import { Annuaire } from './Annuaire';

/**
 * 🔴 Arno (21/10/2026) — FICHE CHALAH (production) : un logement et sa cave créés ensemble dans la Location (lots 436 et 437, même
 * adresse) se lisaient comme DEUX FOIS LE MÊME BIEN. Ce n'est pas un doublon : l'annexe se range SOUS son bien principal, avec
 * son type ; elle ne compte pas comme un bien en gestion à part ; les cartes disent leur type. Une annexe dont le bien
 * principal n'est pas sur la fiche garde sa carte, avec « Annexe du … ». Le vrai composant, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const bien = (id: number, o: Record<string, unknown>) => ({
  id, numero: String(id), adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS', codePostal: '92230', nature: null, typeBien: null,
  surfaceM2: null, debut: null, fin: null, locataire: null, locataireId: null, locataireDepuis: null, mails: 0, dernierEchange: null,
  evenementsOuverts: 0, driveDossierId: null, categorie: null, nombrePieces: null, etageSaisi: null, annexeDe: null, annexes: [], porte: null, numLotCopro: null, ...o,
});
let biens: unknown[];
let hote: HTMLDivElement;
let racine: Root;
let ouvertes: { sorte: string; id: number }[];
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); ouvertes = [];
  biens = [
    bien(315, { adresse: '27 rue Royer Bendélé', nature: 'Appartement', typeBien: 'Type 2', debut: '2025-08-05' }),
    bien(436, { categorie: 'logement', nombrePieces: 1, etageSaisi: '4', porte: 'C43', annexes: ['cave'] }),
    bien(437, { categorie: 'cave', etageSaisi: '-2', porte: '56', numLotCopro: '183', annexeDe: { id: 436, adresse: '25 Rue Henri Barbusse', categorie: 'logement' } }),
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/admin/gestion/annuaire?proprietaire=')) {
      return reponse({ etat: 'ok', data: { id: 49, cle: 'P49', nom: 'CHALAH Ramdane', civilite: null, adresse: null, commune: null, codePostal: null,
        relationDepuis: null, absent: false, contacts: [], driveDossierId: null, lots: [], personnes: [], modifiable: false, suppressionDisponible: false, biens } });
    }
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });
const monter = async () => {
  await act(async () => { racine.render(createElement(Annuaire as never, { fiche: { sorte: 'proprietaire', id: 49 }, onFiche: (f: { sorte: string; id: number } | null) => { if (f) ouvertes.push(f); }, onRetour: () => {} })); });
  await act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });
};
const cartes = () => [...hote.querySelectorAll('#ann-biens ~ ul > li.ann-carte, section[aria-labelledby="ann-biens"] li.ann-carte')];

describe('🔴 la fiche propriétaire : l’annexe sous son bien principal', () => {
  it('« Biens en gestion 2 » (la cave ne compte pas à part) ; deux cartes : 315 et le logement 436, chacune avec son type', async () => {
    await monter();
    expect(hote.querySelector('#ann-biens .gst-compte')?.textContent).toBe('2');
    expect(cartes().map((c) => c.querySelector('.ann-carte-ref')?.textContent)).toEqual(['Réf. Wippimmo 315', 'Réf. Wippimmo 436']);
    const logement = cartes()[1];
    expect([...logement.querySelectorAll('.ann-carte-sous .ann-etiq')].map((e) => e.textContent)).toEqual(['Logement', '1 pièce', '4e étage']);
    expect([...cartes()[0].querySelectorAll('.ann-carte-sous .ann-etiq')].map((e) => e.textContent)).toEqual(['Appartement', '2 pièces']);
  });

  it('la cave, rangée DANS la carte du logement, avec son type (étage, n°, lot) ; un clic ouvre SA fiche', async () => {
    await monter();
    const logement = cartes()[1];
    const rangee = logement.querySelector('[data-annexes-rangees]') as HTMLElement;
    expect(rangee.querySelector('.ann-fait-mot')?.textContent).toBe('Annexe');
    const b = rangee.querySelector('[data-annexe-rangee="437"]') as HTMLButtonElement;
    expect(b.textContent).toBe('Cave · Étage -2 · n° 56 · lot 183');
    // Pas de doublon de l'information : la ligne « Annexes : Cave » n'est pas répétée quand la cave est rangée.
    expect(logement.querySelector('[data-lien-annexe]')).toBeNull();
    await act(async () => { b.click(); });
    expect(ouvertes).toEqual([{ sorte: 'lot', id: 437 }]);
  });

  it('une annexe dont le bien principal N’EST PAS sur la fiche garde sa carte, avec « Annexe du logement … »', async () => {
    biens = [biens[0], bien(437, { categorie: 'cave', etageSaisi: '-2', annexeDe: { id: 999, adresse: '25 Rue Henri Barbusse', categorie: 'logement' } })];
    await monter();
    expect(hote.querySelector('#ann-biens .gst-compte')?.textContent).toBe('2');
    expect(cartes()[1].querySelector('[data-lien-annexe]')?.textContent).toBe('Annexe du logement 25 Rue Henri Barbusse');
    expect([...cartes()[1].querySelectorAll('.ann-carte-sous .ann-etiq')].map((e) => e.textContent)).toEqual(['Cave', 'Étage -2']);
  });

  it('les GESTES sur « tous les biens en gestion » (co-propriétaire, contacts) gardent la liste COMPLÈTE, annexes comprises', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toContain("onCreer('proprietaire', enGestionTous.map((b) => b.id), champs)");
    expect(src).toContain('useContactsDuProprietaire(enGestionTous.map((b) => b.numero), gestes.modifiable)');
  });
});
