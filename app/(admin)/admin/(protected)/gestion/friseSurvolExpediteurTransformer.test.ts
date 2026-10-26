// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FriseAvancement } from './FriseAvancement';
import { cartesDuReservoir, motEtape } from '../../../../lib/gestion/mongaEtape';
import { cartesPourTransformer } from '../../../../lib/gestion/correctionEtape';
import { lignesExpediteur, MOT_EXPEDITEUR_INCONNU } from '../../../../lib/gestion/frise';

/**
 * 🔴 Arno (26/10/2026) — trois retouches de la frise (GES-2026-000011, « Problème de chauffage ») :
 *   R1 le survol d'un point ouvre SA bulle (la géométrie est éprouvée dans `zonesPoints.test.ts`, et dans Chrome — .captures/frise-survol/) ;
 *   R2 « Envoyé par : <nom> <adresse> » puis « À l'origine : <auteur> », « expéditeur inconnu » si l'information manque ;
 *   R3 « Transformer en étape » dans la bulle dépliée : la liste du « + », le geste de correction de la 429, « Remettre en point ».
 * Les VRAIS composants, route simulée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Etape = Record<string, unknown>;
const etape = (id: number, p: Etape = {}): Etape => ({ id, reference: 'MNG-20922', type: 'commentaire', survenuLe: '2026-10-23 10:00:00', heureConnue: true, jourConnu: true,
  heureFin: null, numero: null, rang: null, montantCents: null, texte: `commentaire ${id}`, auteur: 'Jean-Baptiste PONS', source: 'monga', certitude: 'confirmee',
  statut: 'vif', messageId: 900 + id, messageCle: `cle-${id}`, aEuUnMail: true, filId: 50, pieceNom: null, creeParLibelle: null, creeLe: '2026-10-23 10:00:00', titre: null,
  rangPose: id, poseChoisie: false, rangDevis: null, expediteurNom: 'Monga Support', expediteurAdresse: 'support@monga.fr', ...p });

let container: HTMLDivElement; let root: Root;
let appels: { url: string; methode: string; corps: unknown }[]; let etapes: Etape[]; let correction: boolean;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = []; correction = true;
  etapes = [1, 2, 3, 4, 5].map((i) => etape(i, i === 4 ? { auteur: null, source: 'manuelle', expediteurNom: 'DUPONT Marie', expediteurAdresse: 'marie.dupont@exemple.fr', reference: null, type: 'note' }
    : i === 5 ? { expediteurNom: null, expediteurAdresse: null, filId: null, messageId: null } : {}));
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method !== undefined && init.method !== 'GET') { appels.push({ url, methode: init.method, corps: JSON.parse(String(init.body ?? 'null')) }); return Response.json({ etat: 'ok' }); }
    return Response.json({ etat: 'ok', ouvert: true, ouvertLe: '2026-10-23 09:00:00', typesAjoutables: [], passagesEnFiableProposes: [], correction, etapes, taches: [] });
  }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const monter = async (p: Record<string, unknown> = {}) => {
  await act(async () => { root.render(createElement(FriseAvancement, { evenementId: 37, onOuvrirFil: () => {}, ...p })); });
  await calmer();
};
const point = (id: number) => container.querySelector(`.fav-point[data-carte="${id}"]`) as HTMLButtonElement;
const flottante = () => container.querySelector('.fav-flottante .fav-bulle') as HTMLElement | null;
const fixee = () => container.querySelector('.fav-zone .fav-bulle') as HTMLElement | null;

describe('R1 — le survol de chaque point, même rapprochés, ouvre la bulle de CE point', () => {
  it('cinq points le même jour : chacun montre son propre texte au survol, et s’épingle au clic', async () => {
    await monter();
    for (const id of [1, 2, 3, 4, 5]) {
      await act(async () => { point(id).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
      expect(flottante()?.textContent, `point ${id}`).toContain(id === 4 ? 'commentaire 4' : `commentaire ${id}`);
      await act(async () => { point(id).dispatchEvent(new MouseEvent('mouseout', { bubbles: true })); });
    }
    await act(async () => { point(2).click(); });
    expect(fixee()?.textContent).toContain('commentaire 2');
  });
});

describe('R2 — « Envoyé par » et « À l’origine »', () => {
  it('Monga : l’expéditeur réel, puis l’auteur du commentaire ; le collaborateur n’est plus dans l’en-tête', async () => {
    await monter();
    await act(async () => { point(1).click(); });
    expect(fixee()?.querySelector('[data-envoye-par]')?.textContent).toBe('Envoyé par : Monga Support <support@monga.fr>');
    expect(fixee()?.querySelector('[data-a-l-origine]')?.textContent).toBe('À l’origine : Jean-Baptiste PONS');
    expect(fixee()?.querySelector('.fav-bulle-tete')?.textContent).not.toContain('Jean-Baptiste PONS');
  });
  it('mail ordinaire (locataire) : « Envoyé par » seul ; mail supprimé : « expéditeur inconnu » ; aussi au survol', async () => {
    await monter();
    await act(async () => { point(4).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(flottante()?.querySelector('[data-envoye-par]')?.textContent).toBe('Envoyé par : DUPONT Marie <marie.dupont@exemple.fr>');
    expect(flottante()?.querySelector('[data-a-l-origine]')).toBeNull();
    await act(async () => { point(5).click(); });
    expect(fixee()?.querySelector('[data-envoye-par]')?.textContent).toBe(`Envoyé par : ${MOT_EXPEDITEUR_INCONNU}`);
  });
  it('un élément sans mail (posé à la main) : aucune ligne, l’en-tête d’avant', () => {
    expect(lignesExpediteur({ messageId: null, aEuUnMail: false, auteur: 'Arnaud', expediteurNom: null, expediteurAdresse: null })).toBeNull();
    expect(lignesExpediteur({ messageId: 3, aEuUnMail: true, auteur: 'Monga Support', expediteurNom: 'Monga Support', expediteurAdresse: 'a@b.fr' }))
      .toEqual({ envoyePar: 'Monga Support <a@b.fr>', aLOrigine: null });
  });
});

describe('R3 — « Transformer en étape » dans la bulle dépliée', () => {
  it('la liste est celle du « + » (même source), sans les bornes ni les repères ; le choix transforme à la date du point', async () => {
    await monter();
    await act(async () => { point(2).click(); });
    expect(fixee()?.querySelector('[data-transformer-en-etape="2"]')?.textContent).toBe('Transformer en étape');
    // « Voir le mail d'origine » et « Fermer » restent.
    expect(fixee()?.textContent).toContain('Voir le mail d’origine');
    expect(fixee()?.textContent).toContain('Fermer');
    await act(async () => { (fixee()?.querySelector('[data-transformer-en-etape="2"]') as HTMLButtonElement).click(); });
    const proposes = [...container.querySelectorAll('[data-liste-transformer="2"] [data-transformer-vers]')].map((b) => b.getAttribute('data-transformer-vers'));
    expect(proposes).toEqual(cartesPourTransformer(true));
    expect(proposes.every((t) => cartesDuReservoir(true).includes(t as never))).toBe(true);
    expect(proposes).not.toContain('cloture');
    const devis = container.querySelector('[data-liste-transformer="2"] [data-transformer-vers="devis_recu"]') as HTMLButtonElement;
    expect(devis.textContent).toBe(motEtape('devis_recu'));
    await act(async () => { devis.click(); });
    await calmer();
    expect(appels).toEqual([{ url: '/api/admin/gestion/etapes/2/correction', methode: 'PATCH', corps: { geste: 'corriger', type: 'devis_recu', titre: null, jour: '2026-10-23' } }]);
  });
  it('« Remettre en point d’information » sur une carte qui était un point (Monga) : le retour au classement automatique', async () => {
    etapes = [etape(8, { type: 'devis_recu', autoType: 'commentaire', corrigeLe: '2026-10-26 10:00:00', corrigeParLibelle: 'Arnaud' })];
    await monter();
    // Le détail d'une carte s'ouvre par son « … » (le geste d'avant, inchangé).
    const menu = [...container.querySelectorAll('.fav-pictos button')].find((x) => x.textContent === '…') as HTMLButtonElement;
    await act(async () => { menu.click(); });
    await calmer();
    const b = container.querySelector('[data-remettre-en-point="8"]') as HTMLButtonElement;
    expect(b.textContent).toBe('Remettre en point d’information');
    await act(async () => { b.click(); });
    await calmer();
    expect(appels.at(-1)).toEqual({ url: '/api/admin/gestion/etapes/8/correction', methode: 'PATCH', corps: { geste: 'automatique' } });
  });
  it('sans la migration 429 : bouton visible, inactif, « disponible après la mise à jour » ; en lecture seule : rien', async () => {
    correction = false;
    await monter();
    await act(async () => { point(1).click(); });
    expect((fixee()?.querySelector('[data-transformer-en-etape="1"]') as HTMLButtonElement).disabled).toBe(true);
    expect(fixee()?.querySelector('[data-transformation-indisponible]')?.textContent).toContain('disponible après la mise à jour');
    act(() => root.unmount()); root = createRoot(container);
    await monter({ lectureSeule: true });
    await act(async () => { point(1).click(); });
    expect(container.querySelector('[data-transformer-en-etape]')).toBeNull();
  });
});
