// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { RecapTachesDuBien } from './TachesDuBien';
import { TableauTaches } from './TableauTaches';
import { ajouterJours, jourDecale, jourParisDe, type RaccourciDecalage, type Tache } from '../../../../lib/gestion/taches';

/**
 * ══ 🔴🔴 LOT TACHES-1 — LES DEUX ÉCRANS DISENT LA MÊME CHOSE ═══════════════════════════════════════════════════
 *
 * La fiche du bien et le récapitulatif général sont montés ENSEMBLE, sur une base simulée. Quatre tâches, une par
 * couleur. On marque une tâche faite DEPUIS LE RÉCAPITULATIF, on en décale une DEPUIS LA FICHE : les deux écrans
 * doivent se mettre à jour pareil — même couleur, mêmes tâches ouvertes. Puis le filtre « Les miennes ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AUJ = jourParisDe(new Date());
const base = (p: Partial<Tache>): Tache => ({
  id: 0, lotId: 10, lotCle: '315', adresseBien: '12 rue des Lilas, Paris', evenement: null, objet: '', note: null,
  jour: AUJ, heure: null, rappels: [], etat: 'a_faire', confieeA: 1, confieeALibelle: 'Arno Jorel',
  creeLe: '2026-10-01T08:00:00.000Z', creeParLibelle: 'Arno Jorel', majLe: '2026-10-01T08:00:00.000Z',
  faiteLe: null, faiteParLibelle: null, annuleeLe: null, annuleeParLibelle: null, ...p,
});

let taches: Tache[];
let gestes: { id: number; corps: Record<string, unknown> }[];
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  taches = [
    base({ id: 1, objet: 'Relancer le plombier', jour: ajouterJours(AUJ, -1) }),
    base({ id: 2, objet: 'Visite du bien', jour: AUJ, heure: '10:00', confieeA: 2, confieeALibelle: 'Claire Martin' }),
    base({ id: 3, objet: 'Appeler le syndic', jour: ajouterJours(AUJ, 2) }),
    base({ id: 4, objet: 'État des lieux', jour: ajouterJours(AUJ, 5), confieeA: 2, confieeALibelle: 'Claire Martin' }),
  ];
  gestes = [];
  vi.stubGlobal('fetch', vi.fn(async (entree: unknown, init?: { method?: string; body?: string }) => {
    const url = String(entree);
    const m = /\/api\/admin\/gestion\/taches\/(\d+)$/.exec(url);
    if (m && init?.method === 'PATCH') {
      const id = Number(m[1]);
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      gestes.push({ id, corps });
      taches = taches.map((t) => {
        if (t.id !== id) return t;
        if (corps.geste === 'faite') return { ...t, etat: 'faite', faiteLe: new Date().toISOString(), faiteParLibelle: 'Arno Jorel' };
        if (corps.geste === 'decaler') return { ...t, jour: jourDecale(t.jour, corps.raccourci as RaccourciDecalage, new Date()) };
        return t;
      });
      return Response.json({ etat: 'ok', id, message: 'ok' });
    }
    const bien = new URL(url, 'http://x').searchParams.get('bien');
    const l = bien === null ? taches : taches.filter((t) => t.lotId === Number(bien));
    return Response.json({ etat: 'ok', taches: l, moi: 1, tronque: false });
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.unstubAllGlobals(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };

const monter = async () => {
  await act(async () => {
    root.render(createElement(Fragment, null,
      createElement('div', { id: 'fiche' }, createElement(RecapTachesDuBien, { lotId: 10 })),
      createElement('div', { id: 'general' }, createElement(TableauTaches, { onOuvrirBien: () => {} }))));
  });
  await calmer();
};

/** Ce qu'un écran montre des tâches OUVERTES : numéro → couleur, dans l'ordre d'affichage. */
const ouvertes = (ecran: 'fiche' | 'general') =>
  [...container.querySelectorAll(`#${ecran} .tch-liste:not(details .tch-liste) > .tch-ligne`)]
    .map((li) => `${li.getAttribute('data-tache')}:${li.getAttribute('data-couleur')}`);

const bouton = (ecran: 'fiche' | 'general', tache: number, mot: string) => {
  const b = [...container.querySelectorAll<HTMLButtonElement>(`#${ecran} [data-tache="${tache}"] button`)]
    .find((x) => x.textContent?.includes(mot));
  if (!b) throw new Error(`bouton « ${mot} » absent sur la tâche ${tache} (${ecran})`);
  return b;
};

describe('🔴 la fiche du bien et le récapitulatif général se mettent à jour pareil', () => {
  it('quatre couleurs, dans l’ordre rouge, blanc, orange, vert, sur les deux écrans', async () => {
    await monter();
    const attendu = ['1:retard', '2:jour', '3:proche', '4:plus_tard'];
    expect(ouvertes('fiche')).toEqual(attendu);
    expect(ouvertes('general')).toEqual(attendu);
    // Les compteurs en tête du récapitulatif général.
    expect(container.querySelector('#general .tch-compteurs')?.textContent).toBe('1 en retard1 du jour1 2 jours1 plus tard');
  });

  it('« Faite » depuis le récapitulatif : la tâche quitte les ouvertes des DEUX écrans, et reste consultable grisée', async () => {
    await monter();
    await act(async () => { bouton('general', 1, 'Faite').click(); });
    await calmer();
    expect(gestes).toEqual([{ id: 1, corps: { geste: 'faite' } }]);
    expect(ouvertes('fiche')).toEqual(['2:jour', '3:proche', '4:plus_tard']);
    expect(ouvertes('general')).toEqual(['2:jour', '3:proche', '4:plus_tard']);
    const grisee = container.querySelector('#general details [data-tache="1"]');
    expect(grisee?.getAttribute('data-couleur')).toBe('terminee');
    expect(grisee?.textContent).toContain('Faite par Arno Jorel');
  });

  it('« Décaler +1 semaine » depuis la fiche : nouvelle couleur sur les DEUX écrans', async () => {
    await monter();
    await act(async () => { bouton('fiche', 3, 'Décaler').click(); });
    await act(async () => { bouton('fiche', 3, '+1 semaine').click(); });
    await calmer();
    expect(gestes).toEqual([{ id: 3, corps: { geste: 'decaler', raccourci: '+1s' } }]);
    const attendu = ['1:retard', '2:jour', '4:plus_tard', '3:plus_tard'];
    expect(ouvertes('fiche')).toEqual(attendu);
    expect(ouvertes('general')).toEqual(attendu);
  });

  it('🔴 le filtre « Les miennes » ne garde que les tâches confiées à moi', async () => {
    await monter();
    const miennes = [...container.querySelectorAll<HTMLButtonElement>('#general .tch-filtre-btn')]
      .find((b) => b.textContent === 'Les miennes');
    await act(async () => { miennes?.click(); });
    expect(ouvertes('general')).toEqual(['1:retard', '3:proche']);
    expect(miennes?.getAttribute('aria-pressed')).toBe('true');
    // La fiche du bien, elle, n'a pas de filtre : elle montre toujours toutes les tâches du bien.
    expect(ouvertes('fiche')).toHaveLength(4);
  });

  it('une fiche sans tâche ouverte ne montre rien d’autre que son bouton', async () => {
    taches = [];
    await monter();
    expect(container.querySelector('#fiche')?.innerHTML).toBe('');
  });
});

describe('🔴 non-régression : rien n’est déplacé', () => {
  const vue = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
  const annuaire = readFileSync('app/(admin)/admin/(protected)/gestion/Annuaire.tsx', 'utf8');
  it('le récapitulatif général est APRÈS « Échanges sans événement », sous les deux colonnes', () => {
    const colonnes = vue.indexOf('<div className="gst-deux">');
    const echanges = vue.indexOf('<details className="gst-file-echanges">');
    const tableau = vue.indexOf('<TableauTaches');
    expect(colonnes).toBeGreaterThan(0);
    expect(echanges).toBeGreaterThan(colonnes);
    expect(tableau).toBeGreaterThan(echanges);
  });
  it('« + Tâche » est à côté de « Dossier Drive ↗ », qui reste en place', () => {
    // « Dossier Drive ↗ » existe aussi sur d'autres fiches : on prend celui qui précède le bouton, et l'on vérifie
    //   qu'ils sont dans la MÊME zone d'actions (aucune fin de zone ni d'en-tête entre les deux).
    const tache = annuaire.indexOf('<BoutonTache');
    const drive = annuaire.lastIndexOf('Dossier Drive ↗', tache);
    const actions = annuaire.lastIndexOf('<div className="ann-tete-actions">', drive);
    expect(drive).toBeGreaterThan(0);
    expect(actions).toBeGreaterThan(0);
    expect(annuaire.slice(drive, tache)).not.toContain('</header>');
    expect(annuaire.slice(actions, tache)).not.toMatch(/<\/div>\s*<\/header>/);
    expect(annuaire.indexOf('</header>', tache)).toBeGreaterThan(tache);
  });
});
