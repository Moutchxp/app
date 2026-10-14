// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Annuaire } from './Annuaire';

/**
 * ══ 🔴🔴 LOT COULEURS-CARTOUCHES-ET-ALIGNEMENT-STATUTS-BOITE (Arno, 14/10/2026) ══════════════════════════════════════
 *   ① fiche propriétaire : le cartouche « Propriétaire » en ROUGE transparent (rouge « propriétaire » de la légende) ;
 *   ② fiche locataire, carte « Coordonnées » : la capsule de CHAQUE personne prend la couleur de SON statut — vert en
 *      place, violet ancien —, le mot inchangé ; les autres écrans gardent la teinte déduite du mot ;
 *   ③ boîte mail : « À classer », « Auto », « Classé » dans la MÊME boîte, colonne heure + biens de largeur fixe.
 *      (L'alignement au pixel se MESURE au navigateur — jsdom ne calcule aucune mise en page ; voir le rapport du lot.)
 * Le vrai composant `Annuaire`, routes simulées : rien ne part, rien n'est écrit.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const lire = (f: string) => readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');

const personne = (id: number, nom: string) => ({
  sujet: 'locataire' as const, id, cle: `L${id}`, civilite: null, prenom: null, nom, nomAffiche: nom, qualite: null, note: null,
  rang: 0, archive: false, archiveLe: null, archivePar: null, adresse: null, commune: null, codePostal: null, absent: false,
  creeLe: null, importeLe: '2026-09-25T10:00:00Z', contacts: [],
});
const logement = (o: Record<string, unknown>) => ({
  lotId: 25, numero: '25', adresse: '3 rue des Lilas', commune: 'Paris', codePostal: '75011', nature: 'Appartement',
  typeBien: 'Studio', immeuble: null, surfaceM2: null, entree: '2022-06-24', sortie: null, encours: true, horsGestion: false,
  proprietaireId: 9, proprietaireNom: 'MARTIN Paul', mails: 12, dernierEchange: null, driveDossierId: null, ...o,
});

let hote: HTMLDivElement;
let racine: Root;
let ficheServie: unknown;
const reponse = (d: unknown) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('/api/admin/gestion/annuaire?locataire=')
    ? reponse({ etat: 'ok', data: ficheServie }) : reponse({ etat: 'inconnu' }))));
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); }); };
async function monterLocataire(logements: ReturnType<typeof logement>[], personnes: ReturnType<typeof personne>[]): Promise<void> {
  ficheServie = { id: 92, nom: 'DURAND Léa', adresse: null, commune: null, codePostal: null, cle: 'L92', absent: false, contacts: [],
    occupations: [], logements, personnes, modifiable: false, suppressionDisponible: false };
  await act(async () => {
    racine.render(createElement(Annuaire as never, {
      fiche: { sorte: 'locataire', id: 92 }, onFiche: () => {}, onRetour: () => {}, maintenant: new Date('2026-10-14T08:00:00Z'),
    }));
  });
  await calmer();
}
const capsules = () => [...hote.querySelectorAll('#ann-coord-loc ~ * .cp-role, .cp-role')]
  .filter((e, i, t) => t.indexOf(e) === i) as HTMLElement[];

describe('① fiche propriétaire — « Propriétaire » en rouge transparent', () => {
  it('la capsule du titre porte le modificateur rouge ; les jetons de la légende, aucune couleur en dur ; le mot reste', () => {
    const src = lire('Annuaire.tsx');
    expect(src).toContain('<span className="ann-role-capsule ann-role-capsule--proprietaire">Propriétaire</span>');
    expect(src).toContain('.ann-role-capsule--proprietaire{color:var(--color-svv-red);background:var(--color-svv-red-soft);\n  border-color:var(--color-svv-red)}');
    // La légende de l'historique dit « propriétaire » avec le MÊME jeton rouge.
    expect(lire('HistoriqueDuBien.tsx')).toContain('.hdb-legende-pastille--rouge{border-left-color:var(--color-svv-red)');
    // La fiche d'un bien garde sa capsule grise.
    expect(src).toContain('<span className="ann-role-capsule">Bien</span>');
  });
});

describe('② fiche locataire — la capsule « Locataire » de chaque carte suit SON statut', () => {
  it('locataire EN PLACE : sa capsule verte, celle du co-occupant aussi (occupant en cours du même logement)', async () => {
    await monterLocataire([logement({})], [personne(92, 'DURAND Léa'), personne(93, 'DURAND Marc')]);
    const [moi, autre] = capsules();
    expect(moi.textContent).toBe('Locataire');
    expect(moi.className).toBe('cp-role cp-role--en_place');
    expect(autre.textContent).toBe('Même logement');
    expect(autre.className).toBe('cp-role cp-role--en_place');
  });
  it('ANCIEN locataire : sa capsule violette, le mot « Locataire » inchangé', async () => {
    await monterLocataire([logement({ sortie: '2026-01-23', encours: false })], [personne(92, 'DURAND Léa')]);
    const [moi] = capsules();
    expect(moi.textContent).toBe('Locataire');
    expect(moi.className).toBe('cp-role cp-role--ancien');
  });
  it('le violet est celui de la légende (jetons --color-svv-violet*), et les autres écrans gardent la teinte du mot', () => {
    const cartes = lire('CartesPersonnes.tsx');
    expect(cartes).toContain('.cp-role--ancien{background:var(--color-svv-violet-soft);color:var(--color-svv-violet)}');
    // Sans teinte donnée, la teinte se déduit du mot, comme avant.
    expect(cartes).toContain('const t = ton ?? tonDuRoleClient(role);');
    // Seule la fiche locataire donne une teinte explicite.
    expect(lire('Annuaire.tsx').match(/tonRole=\{/g)).toHaveLength(1);
  });
});

describe('③ boîte mail — les trois statuts dans la même boîte, la colonne de l’heure fixe', () => {
  const boite = lire('BoiteMail.tsx');
  const partage = lire('BoiteReception.tsx');
  it('liste de la boîte : la capsule de statut porte sa classe commune ; la boîte se mesure sur « À classer », mot centré', () => {
    expect(boite).toContain('className={`bte-capsule bte-capsule--statut bte-capsule--${capsuleDeLaLigne(l)}`}');
    expect(boite).toContain('.bte-capsule--statut{display:inline-grid;justify-items:center;align-items:center;text-align:center}');
    expect(boite).toContain('.bte-capsule--statut::after{content:"À classer";height:0;line-height:0;overflow:hidden;visibility:hidden}');
    // Couleurs et mots inchangés : les tons des trois états sont ceux d'avant.
    expect(boite).toContain('.bte-capsule--a_classer{color:var(--color-svv-red);border-color:var(--color-svv-red);background:transparent}');
    expect(boite).toContain('.bte-capsule--auto{color:var(--color-svv-green-ink);border-color:transparent;background:var(--color-svv-green-soft)}');
  });
  it('sur ordinateur : la colonne « heure + N biens » a une largeur minimale fixe, alignée à droite', () => {
    expect(boite).toContain('grid-template-columns:minmax(7rem,12rem) minmax(0,1fr) auto minmax(6.5rem,auto)');
    expect(boite).toContain('.bte-liste--dense .bte-ligne>.cbm-pile,.bte-liste--dense .bte-ligne>.bte-quand{justify-self:end}');
  });
  it('sur téléphone : trombone et statut poussés au bout de la rangée (le trombone ne décale plus le statut)', () => {
    expect(boite).toContain('.bte-bas>.bte-marque--pieces{margin-left:auto}');
    expect(boite).toContain('.bte-bas>.bte-capsule--statut{margin-left:auto}');
    expect(boite).toContain('.bte-bas>.bte-marque--pieces+.bte-capsule--statut{margin-left:0}');
  });
  it('écran partagé (Réception de l’accueil) : la même boîte commune, la capsule restant au bout de la rangée', () => {
    expect(partage).toContain('.brc-capsule{display:inline-grid;justify-items:center;align-items:center;text-align:center}');
    expect(partage).toContain('.brc-capsule::after{content:"À classer";height:0;line-height:0;overflow:hidden;visibility:hidden}');
    expect(partage).toContain('.brc-capsule{margin-left:auto;');
  });
});
