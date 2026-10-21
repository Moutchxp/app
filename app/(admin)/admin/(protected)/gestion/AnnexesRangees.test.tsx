// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
import { Annuaire } from './Annuaire';
import { HistoriqueAnnexes } from './AnnexesDuBien';

/**
 * 🔴 Arno (21/10/2026) — LES ANNEXES EN CASES SOUS LE BIEN PRINCIPAL, DÉTACHABLES (cas CHALAH : logement 436 + cave 437) :
 *   · une CASE pleine largeur par annexe, au-dessus de « Historique » : type en gras, N°, lot, niveau, adresse si elle diffère ;
 *     un clic ouvre la fiche de l'annexe ; le COMPTEUR « Logement · N annexes » en tête de carte ; les annexes ne comptent pas ;
 *   · « Détacher » (confirmation) → `detacher-annexe` ; l'annexe DÉTACHÉE a sa carte, comptée comme un bien, avec « Rattacher à
 *     un bien » (son bien d'origine) → `detacher-annexe` (detacher: false) ; un lot jamais lié → `rattacher-annexe` ;
 *   · l'Historique dit les détachements / rattachements.
 * Le vrai composant, routes simulées : rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
const bien = (id: number, o: Record<string, unknown>) => ({
  id, numero: String(id), adresse: '25 Rue Henri Barbusse', commune: 'GENNEVILLIERS', codePostal: '92230', nature: null, typeBien: null,
  surfaceM2: null, debut: null, fin: null, locataire: null, locataireId: null, locataireDepuis: null, mails: 0, dernierEchange: null,
  evenementsOuverts: 0, driveDossierId: null, categorie: null, nombrePieces: null, etageSaisi: null, annexeDe: null, annexes: [], porte: null,
  numLotCopro: null, detachee: false, detacheeLe: null, titulaireId: 49, ...o,
});
const DE_436 = { id: 436, adresse: '25 Rue Henri Barbusse', categorie: 'logement' };
const WIPPIMMO = bien(315, { adresse: '27 rue Royer Bendélé', nature: 'Appartement', typeBien: 'Type 2', debut: '2025-08-05' });
const LOGEMENT = bien(436, { categorie: 'logement', nombrePieces: 1, etageSaisi: '4', porte: 'C43', annexes: ['cave'] });
const CAVE = bien(437, { categorie: 'cave', etageSaisi: '-2', porte: '56', numLotCopro: '183', annexeDe: DE_436 });
let biens: unknown[];
let posts: Record<string, unknown>[];
let lectures: number;
let hote: HTMLDivElement;
let racine: Root;
let ouvertes: { sorte: string; id: number }[];
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote); ouvertes = []; posts = []; lectures = 0;
  biens = [WIPPIMMO, LOGEMENT, CAVE];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') { posts.push(JSON.parse(String(init.body)) as Record<string, unknown>); return reponse({ etat: 'ok', data: undefined }); }
    if (u.includes('/api/admin/gestion/annuaire?proprietaire=')) {
      lectures += 1;
      return reponse({ etat: 'ok', data: { id: 49, cle: 'P49', nom: 'CHALAH Ramdane', civilite: null, adresse: null, commune: null, codePostal: null,
        relationDepuis: null, absent: false, contacts: [], driveDossierId: null, lots: [], personnes: [], modifiable: false, suppressionDisponible: false, biens } });
    }
    return reponse({ etat: 'inconnu' });
  }));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => { racine.render(createElement(Annuaire as never, { fiche: { sorte: 'proprietaire', id: 49 }, onFiche: (f: { sorte: string; id: number } | null) => { if (f) ouvertes.push(f); }, onRetour: () => {} })); });
  await calmer();
};
const cartes = () => [...hote.querySelectorAll('section[aria-labelledby="ann-biens"] li.ann-carte')];
const carte = (id: number) => cartes().find((c) => c.querySelector('.ann-carte-ref')?.textContent === `Réf. Wippimmo ${id}`) as HTMLElement;
const compte = () => hote.querySelector('#ann-biens .gst-compte')?.textContent;
const clic = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); await calmer(); };

describe('🔴 les cases d’annexes sous le bien principal', () => {
  it('0 annexe : ni case ni compteur ; chaque carte dit son type', async () => {
    biens = [WIPPIMMO, bien(436, { categorie: 'logement', nombrePieces: 1, etageSaisi: '4' })];
    await monter();
    expect(compte()).toBe('2');
    expect(hote.querySelector('[data-cases-annexes]')).toBeNull();
    expect(hote.querySelector('[data-compteur-annexes]')).toBeNull();
    expect([...carte(436).querySelectorAll('.ann-carte-sous .ann-etiq')].map((e) => e.textContent)).toEqual(['Logement', '1 pièce', '4e étage']);
  });

  it('1 annexe (CHALAH) : « Logement · 1 annexe », une case « Cave » (N° 56 · Lot 183 · Niveau -2) AU-DESSUS de « Historique » ; ouvre sa fiche', async () => {
    await monter();
    expect(compte()).toBe('2');
    expect(cartes()).toHaveLength(2);
    const c = carte(436);
    expect(c.querySelector('[data-compteur-annexes]')?.textContent).toBe('Logement · 1 annexe');
    const kase = c.querySelector('[data-case-annexe="437"]') as HTMLElement;
    expect(kase.querySelector('.anx-type')?.textContent).toBe('Cave');
    expect(kase.querySelector('.anx-details')?.textContent).toBe('N° 56 · Lot 183 · Niveau -2');
    const pied = c.querySelector('.ann-carte-pied') as HTMLElement;
    const historique = [...pied.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Historique')!;
    expect(kase.compareDocumentPosition(historique) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await clic(kase.querySelector('[data-ouvrir-annexe="437"]')!);
    expect(ouvertes).toEqual([{ sorte: 'lot', id: 437 }]);
  });

  it('3 annexes : trois cases empilées, « Logement · 3 annexes » ; place de parking et adresse différente dites', async () => {
    biens = [WIPPIMMO, { ...LOGEMENT, annexes: ['cave', 'parking', 'box'] }, CAVE,
      bien(438, { categorie: 'parking', etageSaisi: '-1', porte: '12', annexeDe: DE_436, adresse: '3 rue Voisine' }),
      bien(439, { categorie: 'box', etageSaisi: 'RDC', porte: 'B2', annexeDe: DE_436 })];
    await monter();
    expect(compte()).toBe('2');
    const c = carte(436);
    expect(c.querySelector('[data-compteur-annexes]')?.textContent).toBe('Logement · 3 annexes');
    expect([...c.querySelectorAll('[data-case-annexe]')].map((k) => `${k.querySelector('.anx-type')?.textContent} | ${k.querySelector('.anx-details')?.textContent}`)).toEqual([
      'Cave | N° 56 · Lot 183 · Niveau -2', 'Parking | Place 12 · Niveau -1 · 3 rue Voisine, GENNEVILLIERS', 'Box | Place B2 · Rez-de-chaussée']);
  });
});

describe('🔴 détacher, puis rattacher', () => {
  it('« Détacher » : confirmation « Détacher cette cave du logement ? … même propriétaire » → `detacher-annexe`, puis la fiche est relue', async () => {
    await monter();
    await clic(carte(436).querySelector('[data-detacher-annexe="437"]')!);
    const m = document.querySelector('[data-modale-issue]') as HTMLElement;
    expect(m.textContent).toContain('Détacher cette cave du logement ? Elle deviendra un bien à part entière, avec le même propriétaire.');
    await clic(m.querySelector('[data-annuler-detacher]')!);
    expect(posts).toEqual([]);
    await clic(carte(436).querySelector('[data-detacher-annexe="437"]')!);
    const avant = lectures;
    await clic(document.querySelector('[data-confirmer-detacher]')!);
    expect(posts).toEqual([{ action: 'detacher-annexe', id: 437, detacher: true }]);
    expect(lectures).toBe(avant + 1);
  });

  it('l’annexe DÉTACHÉE : sa propre carte, avec son type, COMPTÉE comme un bien ; « Rattacher à un bien » ne propose que son bien d’origine', async () => {
    biens = [WIPPIMMO, LOGEMENT, { ...CAVE, detachee: true, detacheeLe: '2026-10-21 18:00:00+02' }];
    await monter();
    expect(compte()).toBe('3');
    expect(carte(436).querySelector('[data-case-annexe]')).toBeNull();
    const cave = carte(437);
    expect([...cave.querySelectorAll('.ann-carte-sous .ann-etiq')].map((e) => e.textContent)).toEqual(['Cave', 'Étage -2']);
    expect(cave.querySelector('[data-lien-annexe]')?.textContent).toBe('Annexe détachée du logement 25 Rue Henri Barbusse — bien à part entière');
    await clic(cave.querySelector('[data-ouvrir-rattacher]')!);
    const choix = [...document.querySelectorAll('[data-choix-rattacher] [data-candidat]')].map((x) => x.getAttribute('data-candidat'));
    expect(choix).toEqual(['436']);
    await clic(document.querySelector('[data-confirmer-rattacher]')!);
    expect(posts).toEqual([{ action: 'detacher-annexe', id: 437, detacher: false }]);
  });

  it('un lot de type annexe JAMAIS lié (ex. parking WIPPIMMO) : « Rattacher à un bien » propose les biens principaux du même propriétaire → `rattacher-annexe`', async () => {
    biens = [WIPPIMMO, LOGEMENT, bien(500, { adresse: '25 Rue Henri Barbusse', nature: 'Parking', typeBien: null })];
    await monter();
    expect(compte()).toBe('3');
    await clic(carte(500).querySelector('[data-ouvrir-rattacher]')!);
    expect([...document.querySelectorAll('[data-choix-rattacher] [data-candidat]')].map((x) => x.getAttribute('data-candidat'))).toEqual(['315', '436']);
    await clic(document.querySelector('[data-candidat="436"]')!);
    await clic(document.querySelector('[data-confirmer-rattacher]')!);
    expect(posts).toEqual([{ action: 'rattacher-annexe', id: 436, annexeId: 500 }]);
    // Un logement n'a pas d'action « Rattacher à un bien ».
    expect(carte(436).querySelector('[data-ouvrir-rattacher]')).toBeNull();
  });

  it('les GESTES sur « tous les biens en gestion » (co-propriétaire, contacts) gardent la liste COMPLÈTE, annexes comprises', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
    expect(src).toContain("onCreer('proprietaire', enGestionTous.map((b) => b.id), champs)");
    expect(src).toContain('useContactsDuProprietaire(enGestionTous.map((b) => b.numero), gestes.modifiable)');
  });
});

describe('🔴 l’Historique des deux biens', () => {
  it('une bande « Annexes : détachements et rattachements (N) » : date, geste, lot / bien, auteur', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/api/admin/gestion/annexes?lot=436&journal=1')
      ? reponse({ etat: 'ok', data: [
        { id: 2, quand: '2026-10-21T16:10:00Z', action: 'location_annexe_rattachee', texte: 'annexe 437 rattachée : de nouveau dans l’ensemble loué avec le logement', par: 'jb.pons@sansvisavis.com' },
        { id: 1, quand: '2026-10-21T16:00:00Z', action: 'location_annexe_detachee', texte: 'annexe 437 détachée : bien autonome, louable séparément (son lien avec le logement est gardé)', par: 'jb.pons@sansvisavis.com' }] })
      : reponse({ etat: 'inconnu' }))));
    await act(async () => { racine.render(createElement(HistoriqueAnnexes, { lotId: 436 })); });
    await calmer();
    const bande = hote.querySelector('[data-historique-annexes]') as HTMLElement;
    expect(bande.querySelector('.hdb-replier')?.textContent).toBe('▶Annexes : détachements et rattachements2');
    await clic(bande.querySelector('.hdb-replier')!);
    expect([...bande.querySelectorAll('[data-evenement-annexe] strong')].map((x) => x.textContent)).toEqual(['Annexe rattachée', 'Annexe détachée']);
    expect(bande.querySelector('[data-evenement-annexe="1"]')?.textContent).toContain('21/10/2026 à 18:00');
    expect(bande.querySelector('[data-evenement-annexe="1"]')?.textContent).toContain('par jb.pons@sansvisavis.com');
  });
});
