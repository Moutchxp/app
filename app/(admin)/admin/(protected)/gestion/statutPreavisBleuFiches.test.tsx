// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Annuaire } from './Annuaire';
import { BlocCartes, type GestesCartes } from './CartesPersonnes';
import type { PersonneAnnuaire } from '../../../../lib/gestion/annuaireRepo';

/**
 * Arno (19/10/2026) — LE STATUT « EN PRÉAVIS » EN BLEU TRANSPARENT sur la FICHE COMMUNE (fiche locataire et fiche bien),
 * toujours avec le mot ; un occupant sans préavis reste vert « en place ». Vrais composants, routes simulées.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const lire = (f: string) => readFileSync(`app/(admin)/admin/(protected)/gestion/${f}`, 'utf8');

const personne = (id: number, nom: string): PersonneAnnuaire => ({
  sujet: 'locataire', id, cle: `L${id}`, civilite: null, prenom: null, nom, nomAffiche: nom, qualite: null, note: null,
  rang: 0, archive: false, archiveLe: null, archivePar: null, adresse: null, commune: null, codePostal: null, absent: false,
  creeLe: null, importeLe: '2026-09-25T10:00:00Z', contacts: [],
} as unknown as PersonneAnnuaire);
const logement = {
  lotId: 25, numero: '25', adresse: '3 rue des Lilas', commune: 'Paris', codePostal: '75011', nature: 'Appartement',
  typeBien: 'Studio', immeuble: null, surfaceM2: null, entree: '2022-06-24', sortie: null, encours: true, horsGestion: false,
  proprietaireId: 9, proprietaireNom: 'MARTIN Paul', mails: 12, dernierEchange: null, driveDossierId: null,
};

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

async function monterLocataire(preavis: Record<string, string> | undefined): Promise<void> {
  ficheServie = { id: 92, nom: 'DURAND Léa', adresse: null, commune: null, codePostal: null, cle: 'L92', absent: false, contacts: [],
    occupations: [], logements: [logement], personnes: [personne(92, 'DURAND Léa'), personne(93, 'DURAND Marc')], preavis,
    modifiable: false, suppressionDisponible: false };
  await act(async () => {
    racine.render(createElement(Annuaire as never, {
      fiche: { sorte: 'locataire', id: 92 }, onFiche: () => {}, onRetour: () => {}, maintenant: new Date('2026-10-19T08:00:00Z'),
    }));
  });
  await calmer();
}
const roles = () => [...hote.querySelectorAll('.cp-role')] as HTMLElement[];

describe('fiche locataire', () => {
  it('EN PRÉAVIS : capsule « Locataire en préavis » en bleu ; sa carte « Locataire — en préavis » en bleu ; le co-occupant reste vert', async () => {
    await monterLocataire({ 92: '2026-11-30' });
    const capsule = hote.querySelector('.ann-role-capsule') as HTMLElement;
    expect(capsule.textContent).toBe('Locataire en préavis');
    expect(capsule.className).toBe('ann-role-capsule ann-role-capsule--preavis');
    const [moi, autre] = roles();
    expect(moi.textContent).toBe('Locataire — en préavis');
    expect(moi.className).toBe('cp-role cp-role--preavis');
    expect(autre.textContent).toBe('Même logement');
    expect(autre.className).toBe('cp-role cp-role--en_place');
  });

  it('SANS préavis : tout reste vert « en place », comme avant', async () => {
    await monterLocataire(undefined);
    const capsule = hote.querySelector('.ann-role-capsule') as HTMLElement;
    expect(capsule.textContent).toBe('Locataire en place');
    expect(capsule.className).toBe('ann-role-capsule ann-role-capsule--en-place');
    expect(roles().map((r) => r.className)).toEqual(['cp-role cp-role--en_place', 'cp-role cp-role--en_place']);
  });
});

describe('fiche bien — « Locataires en place »', () => {
  const gestes = { modifiable: true } as unknown as GestesCartes;
  it('la fiche donne aux occupants le mot ET le ton du préavis (texte de la fiche)', () => {
    const src = lire('Annuaire.tsx');
    expect(src).toContain("role={(p) => (f.preavis?.[String(p.id)] !== undefined ? 'En préavis' : 'En place')}");
    expect(src).toContain("tonRole={(p) => (f.preavis?.[String(p.id)] !== undefined ? 'preavis' : 'en_place')}");
  });

  it('montées ainsi, les cartes : « En préavis » en bleu, « En place » en vert', async () => {
    const preavis: Record<string, string> = { 92: '2026-11-30' };
    await act(async () => {
      racine.render(createElement(BlocCartes, {
        titre: 'Locataires en place', id: 'ann-occ', famille: 'locataire', personnes: [personne(92, 'DURAND Léa'), personne(93, 'DURAND Marc')],
        motAjouter: 'Ajouter un occupant', gestes,
        role: (p: PersonneAnnuaire) => (preavis[String(p.id)] !== undefined ? 'En préavis' : 'En place'),
        tonRole: (p: PersonneAnnuaire) => (preavis[String(p.id)] !== undefined ? 'preavis' : 'en_place'),
      } as never));
    });
    expect(roles().map((r) => [r.textContent, r.className])).toEqual([
      ['En préavis', 'cp-role cp-role--preavis'], ['En place', 'cp-role cp-role--en_place']]);
  });
});

describe('couleurs : la paire bleue du thème, jamais une couleur en dur', () => {
  it('les classes bleues lisent --color-svv-blue / --color-svv-blue-soft, définis en Clair ET en Sombre', () => {
    expect(lire('CartesPersonnes.tsx')).toContain('.cp-role--preavis{background:var(--color-svv-blue-soft);color:var(--color-svv-blue)}');
    expect(lire('Annuaire.tsx')).toContain('.ann-role-capsule--preavis{color:var(--color-svv-blue);background:var(--color-svv-blue-soft);\n  border-color:var(--color-svv-blue)}');
    const theme = readFileSync('app/globals.css', 'utf8');
    // :root (clair), [data-theme='dark'] et la media query sombre.
    expect(theme.match(/--color-svv-blue-soft:/g)?.length).toBeGreaterThanOrEqual(3);
    expect(theme.match(/--color-svv-blue:/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('le vert « locataire » de la légende de l’historique ne change pas', () => {
    expect(lire('HistoriqueDuBien.tsx')).toContain('.hdb-legende-pastille--vert{border-left-color:var(--color-svv-green);border-right-color:var(--color-svv-green)}');
  });
});
