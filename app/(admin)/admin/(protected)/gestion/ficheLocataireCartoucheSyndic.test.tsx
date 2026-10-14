// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Annuaire } from './Annuaire';
import { cleImmeuble } from '../../../../lib/gestion/syndics';
import { bienDuNouveauMessageLocataire, type LogementPourNouveauMessage } from '../../../../lib/gestion/bienNouveauMessageLocataire';

/**
 * ══ 🔴🔴 LOT FICHE-LOCATAIRE-CARTOUCHE-ET-SYNDIC (Arno, 14/10/2026) ══════════════════════════════════════════════════
 *   ① le cartouche de statut : VERT (locataire en place) ou VIOLET (ancien locataire), le MOT toujours écrit ;
 *   ② le bouton syndic de la carte « Son logement » : sous l'en-tête gris, au-dessus d'OCCUPATION, hors du bouton de
 *      carte (jamais un bouton dans un bouton), les deux états (« Créer le syndic » / nom du syndic) ;
 *   ③ « Nouveau message » d'un ancien locataire : à sortie égale, le logement avant le parking.
 * Le vrai composant `Annuaire`, routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const logement = (o: Record<string, unknown>) => ({
  lotId: 25, numero: '25', adresse: '3 rue des Lilas', commune: 'Paris', codePostal: '75011', nature: 'Appartement',
  typeBien: 'Studio', immeuble: 'IMM-SANS', surfaceM2: null, entree: '2022-06-24', sortie: null, encours: true, horsGestion: false,
  proprietaireId: 9, proprietaireNom: 'MARTIN Paul', mails: 12, dernierEchange: '2026-09-17T10:00:00Z', driveDossierId: null, ...o,
});
const fiche = (logements: ReturnType<typeof logement>[]) => ({
  id: 92, nom: 'DURAND Léa', adresse: null, commune: null, codePostal: null, cle: 'L92', absent: false, contacts: [],
  occupations: [], logements, personnes: [], modifiable: false, suppressionDisponible: false,
});

let hote: HTMLDivElement;
let racine: Root;
let ficheServie: unknown;
let ouvertes: { sorte: string; id: number }[];
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  ouvertes = [];
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/api/admin/gestion/annuaire?locataire=')) return reponse({ etat: 'ok', data: ficheServie });
    if (u.includes('/syndics/immeubles')) {
      return reponse({ etat: 'ok', disponible: true, immeubles: [
        { cle: cleImmeuble('IMM-AVEC'), libelle: 'IMM-AVEC', codePostal: '75011', commune: 'Paris', syndic: { id: 1, nom: 'FONCIA', ville: 'Paris' } },
      ] });
    }
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
async function monter(logements: ReturnType<typeof logement>[]): Promise<void> {
  ficheServie = fiche(logements);
  await act(async () => {
    racine.render(createElement(Annuaire as never, {
      fiche: { sorte: 'locataire', id: 92 }, onFiche: (f: { sorte: string; id: number } | null) => { if (f) ouvertes.push(f); },
      onRetour: () => {}, maintenant: new Date('2026-10-14T08:00:00Z'),
    }));
  });
  await calmer();
}
const capsule = () => hote.querySelector('.ann-tete .ann-role-capsule') as HTMLElement;
const carte = () => hote.querySelector('li.ann-carte') as HTMLElement;
const avant = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('① le cartouche de statut', () => {
  it('locataire EN PLACE : vert, et le mot « Locataire en place »', async () => {
    await monter([logement({})]);
    expect(capsule().textContent).toBe('Locataire en place');
    expect(capsule().classList.contains('ann-role-capsule--en-place')).toBe(true);
    expect(capsule().classList.contains('ann-role-capsule--ancien')).toBe(false);
  });
  it('ANCIEN locataire : violet, et le mot « Ancien locataire »', async () => {
    await monter([logement({ sortie: '2026-01-23', encours: false })]);
    expect(capsule().textContent).toBe('Ancien locataire');
    expect(capsule().classList.contains('ann-role-capsule--ancien')).toBe(true);
    expect(capsule().classList.contains('ann-role-capsule--en-place')).toBe(false);
  });
  it('les jetons : vert « locataire » et violet « ancien locataire » de la légende, aucune couleur en dur', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toContain('.ann-role-capsule--en-place{color:var(--color-svv-green-ink);background:var(--color-svv-green-soft);\n  border-color:var(--color-svv-green)}');
    expect(src).toContain('.ann-role-capsule--ancien{color:var(--color-svv-violet);background:var(--color-svv-violet-soft);');
    // La fiche propriétaire et la fiche d'un bien gardent la capsule grise, sans modificateur.
    expect(src).toContain('<span className="ann-role-capsule">Propriétaire</span>');
    expect(src).toContain('<span className="ann-role-capsule">Bien</span>');
  });
});

describe('② le bouton syndic de la carte « Son logement »', () => {
  it('« Créer le syndic » : sous l’en-tête gris, AU-DESSUS d’OCCUPATION, hors du bouton de carte', async () => {
    await monter([logement({})]);
    const c = carte();
    const tete = c.querySelector('.ann-carte-tete')!;
    const syndic = c.querySelector('.bsy') as HTMLButtonElement;
    const occupation = c.querySelector('.ann-fait')!;
    expect(syndic.textContent).toBe('Créer le syndic');
    expect(occupation.textContent).toContain('Occupation');
    expect(avant(tete, syndic)).toBe(true);
    expect(avant(syndic, occupation)).toBe(true);
    expect(syndic.parentElement!.closest('button')).toBeNull(); // jamais un bouton dans un bouton
    // Les autres boutons restent à leur place, dans le pied, sous les faits.
    const pied = c.querySelector('.ann-carte-pied')!;
    expect(avant(occupation, pied)).toBe(true);
    expect(pied.textContent).toContain('Historique');
    expect(pied.textContent).toContain('Fiche du propriétaire');
  });
  it('syndic RENSEIGNÉ : le bouton rose à son nom, à la même place', async () => {
    await monter([logement({ immeuble: 'IMM-AVEC' })]);
    const c = carte();
    const syndic = c.querySelector('.bsy') as HTMLButtonElement;
    expect(syndic.classList.contains('bsy--connu')).toBe(true);
    expect(syndic.textContent).toContain('FONCIA');
    expect(avant(c.querySelector('.ann-carte-tete')!, syndic)).toBe(true);
    expect(avant(syndic, c.querySelector('.ann-fait')!)).toBe(true);
  });
  it('la carte s’ouvre toujours : l’en-tête ET les faits ouvrent la fiche du bien ; un seul arrêt clavier', async () => {
    await monter([logement({})]);
    const [teteBtn, faitsBtn] = [...carte().querySelectorAll('button.ann-carte-corps')] as HTMLButtonElement[];
    expect(teteBtn.querySelector('.ann-carte-tete')).not.toBeNull();
    expect(faitsBtn.querySelector('.ann-fait')).not.toBeNull();
    expect(teteBtn.tabIndex).toBe(0);
    expect(faitsBtn.tabIndex).toBe(-1);
    await act(async () => { teteBtn.click(); });
    await act(async () => { faitsBtn.click(); });
    expect(ouvertes).toEqual([{ sorte: 'lot', id: 25 }, { sorte: 'lot', id: 25 }]);
  });
  it('ancien locataire : même place dans les cartes de « Logements précédents »', async () => {
    await monter([logement({ sortie: '2026-01-23', encours: false })]);
    const c = carte();
    expect(avant(c.querySelector('.ann-carte-tete')!, c.querySelector('.bsy')!)).toBe(true);
    expect(avant(c.querySelector('.bsy')!, c.querySelector('.ann-fait')!)).toBe(true);
  });
});

describe('③ « Nouveau message » d’un ancien locataire — sortie le même jour', () => {
  const L = (o: Partial<LogementPourNouveauMessage>): LogementPourNouveauMessage => ({
    lotId: 1, numero: '1', adresse: 'a', commune: 'c', entree: '2020-01-01', sortie: '2026-01-23', horsGestion: false, ...o,
  });
  it('🔴 fiche 44 : le STUDIO (lot 239) passe avant le PARKING (lot 322), même si le parking est entré plus tard', () => {
    expect(bienDuNouveauMessageLocataire([
      L({ lotId: 1, numero: '322', nature: 'Parking', typeBien: 'Garage', entree: '2025-11-19' }),
      L({ lotId: 141, numero: '239', nature: 'Appartement meublé', typeBien: 'Studio', entree: '2023-11-24' }),
    ])?.cle).toBe('239');
  });
  it('cave et box aussi après le logement ; à catégorie égale, l’entrée la plus récente', () => {
    expect(bienDuNouveauMessageLocataire([L({ numero: 'C', nature: 'Cave' }), L({ numero: 'A', nature: 'Appartement' })])?.cle).toBe('A');
    expect(bienDuNouveauMessageLocataire([L({ numero: 'B', nature: 'Box' }), L({ numero: 'M', nature: 'Maison' })])?.cle).toBe('M');
    expect(bienDuNouveauMessageLocataire([
      L({ numero: 'X', nature: 'Appartement', entree: '2021-01-01' }), L({ numero: 'Y', nature: 'Appartement', entree: '2024-01-01' }),
    ])?.cle).toBe('Y');
  });
  it('la sortie la plus récente l’emporte toujours, même sur un parking', () => {
    expect(bienDuNouveauMessageLocataire([
      L({ numero: 'P', nature: 'Parking', sortie: '2026-05-01' }), L({ numero: 'A', nature: 'Appartement', sortie: '2026-01-23' }),
    ])?.cle).toBe('P');
  });
});
