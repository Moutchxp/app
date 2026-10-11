// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { HistoriqueDuBien } from './HistoriqueDuBien';
import { AccoladeSuivi, CSS_ACCOLADE_SUIVI } from './AccoladeSuivi';
import { CSS_CONVERSATION } from './Conversation';
import type { LigneHistorique } from '../../../../lib/gestion/historique';

/**
 * ══ 🔴🔴 LOT ACCOLADE-PARTOUT — L'ACCOLADE ROUGE, MODÈLE UNIQUE, ET SA PLACE DANS L'HISTORIQUE D'UN BIEN ══════════════
 *   ① la vue conversation est INCHANGÉE : même JSX (déplacé), même feuille (coupée sans retouche) ;
 *   ② l'historique du bien pose l'accolade à la place du premier mail concerné, avec le libellé du bien ;
 *   ③ plusieurs accolades, dans l'ordre ; ④ aucune quand la route n'en rend pas (période qui ne concerne pas ce bien).
 * 🔒 AUCUNE DONNÉE RÉELLE : `fetch` simulé.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('① la vue conversation est inchangée', () => {
  it('la feuille de l’accolade est coupée de CSS_CONVERSATION sans retouche, et y revient telle quelle', () => {
    expect(CSS_CONVERSATION).toContain(CSS_ACCOLADE_SUIVI.trim());
    for (const r of ['.cnv-repere{position:relative;display:grid;grid-template-columns:1fr auto 1fr;',
      '.cnv-repere-mot{font-size:.76rem;font-weight:700;', '.cnv-repere-bras::after{content:"";position:absolute;width:0;height:0;border:5px solid transparent}',
      '.cnv-repere--dessus .cnv-repere-bras--gauche::before{border-left-width:1px;border-top-left-radius:10px}']) {
      expect(CSS_ACCOLADE_SUIVI).toContain(r);
    }
    /* Une seule définition dans le dépôt : ni la conversation ni l'historique n'en ont de copie. */
    const conv = readFileSync('app/(admin)/admin/(protected)/gestion/Conversation.tsx', 'utf8');
    expect(conv).not.toContain('.cnv-repere{position:relative');
    expect(conv).toContain('<AccoladeSuivi cote={cote} libelle={r.versQuoi}');
  });

  it('le même DOM qu’avant : li.cnv-repere, deux bras, la phrase rouge, qui et quand, le « i »', async () => {
    const hote = document.createElement('ol'); document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => {
      racine.render(createElement(AccoladeSuivi, {
        cote: 'dessus', libelle: 'aucun bien', parLibelle: 'a.jorel@sansvisavis.com', le: '2026-10-02T19:39:00Z',
        comparatif: { avant: null, apres: { statut: 'À classer', biens: 'aucun bien', personnes: 'aucune personne nommée' },
          choix: 'ce mail et la conversation à venir', qui: 'a.jorel@sansvisavis.com', quand: '2026-10-02T19:39:00Z' },
        mail: null, nbMails: 2,
      }));
    });
    const li = hote.querySelector('li.cnv-repere.cnv-repere--dessus') as HTMLElement;
    expect(li).not.toBeNull();
    expect(li.querySelectorAll('.cnv-repere-bras')).toHaveLength(2);
    expect(li.querySelector('.cnv-repere-mot')?.textContent).toBe('À partir d’ici : aucun bien');
    expect(li.querySelector('.cnv-repere-qui')?.textContent).toContain('a.jorel@sansvisavis.com');
    expect(li.querySelector('button.cnv-repere-i')?.textContent).toBe('i');
    act(() => racine.unmount()); hote.remove();
  });
});

/* ══ ② ③ ④ L'HISTORIQUE DU BIEN ════════════════════════════════════════════════════════════════════════════════ */

const ligne = (messageId: number, filId: number, recuLe: string): LigneHistorique => ({
  messageId, filId, messageIdRfc: null, recuLe, sens: 'recu', de: 'x@fictif.test', deNom: 'X', destinataires: [],
  a: [], cc: [], cci: [], repondreA: [], adressesTexte: [], objet: `Mail ${messageId}`, extrait: '', pieces: [],
  parCible: { sorte: 'lot', cle: '155', id: null }, cibleLibelle: 'Lot 155', source: 'rattachement',
  evenements: [], statut: null, statutDetail: null,
});
const LIGNES = [ligne(3, 20, '2026-03-15T09:00:00Z'), ligne(2, 20, '2026-02-15T09:00:00Z'), ligne(1, 10, '2026-01-10T09:00:00Z')];
const accolade = (filId: number, depuisMessageId: number, recuLe: string, sens: 'ajout' | 'retrait') => ({
  filId, depuisMessageId, recuLe, sens,
  libelle: sens === 'ajout' ? 'suivi aussi par ce bien' : 'sorti du suivi de ce bien',
  parLibelle: 'a.jorel@sansvisavis.com', le: '2026-10-01T10:00:00Z', comparatif: null, nbMails: 2,
  mail: { de: 'x@fictif.test', deNom: 'X', recuLe, objet: 'o' },
});

let hote: HTMLDivElement;
let racine: Root;
let accolades: unknown[] = [];
let demandes: string[] = [];
const reponse = (corps: unknown) => ({ ok: true, json: async () => corps }) as unknown as Response;

beforeEach(() => {
  accolades = []; demandes = [];
  hote = document.createElement('div'); document.body.appendChild(hote); racine = createRoot(hote);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/historique/accolades')) { demandes.push(u); return reponse({ etat: 'ok', accolades }); }
    if (u.includes('/historique/evenements')) return reponse({ etat: 'ok', evenements: [] });
    if (u.includes('/historique/pieces')) return reponse({ etat: 'ok', messages: [], total: 0 });
    if (u.includes('/pieces-drive')) return reponse({ etat: 'ok', depots: [], emplacements: [] });
    return reponse({ etat: 'ok', data: {
      lignes: LIGNES, suite: false, entete: { nbMails: 3 }, selection: { nbMails: 3 },
      interlocuteurs: [], interlocuteursTronques: false,
    } });
  }));
  vi.stubGlobal('open', vi.fn());
});
afterEach(() => { act(() => racine.unmount()); hote.remove(); vi.unstubAllGlobals(); });

const monter = async () => {
  await act(async () => {
    racine.render(createElement(HistoriqueDuBien, {
      lotCle: '155', maintenant: new Date('2026-10-04T08:00:00Z'), occupations: [], categories: new Map(),
    }));
  });
  await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); });
};
/** La liste, dans l'ordre d'affichage : « m<id> » pour un mail, « A:<libellé> » pour une accolade. */
const liste = () => [...hote.querySelectorAll('ol.hdb-liste > li')].map((li) => (li.classList.contains('cnv-repere')
  ? `A:${li.querySelector('.cnv-repere-mot')?.textContent}` : `m${li.id.replace('hdb-mail-', '')}`));

describe('② l’historique du bien', () => {
  it('🔴 il demande les accolades des conversations de la page, pour CE bien', async () => {
    await monter();
    expect(demandes.some((u) => u.includes('cible=lot-155') && /fils=(20,10|10,20)/.test(u))).toBe(true);
  });

  it('🔴 « suivi aussi par ce bien » au premier mail concerné ; « sorti du suivi de ce bien » à sa place dans le temps', async () => {
    accolades = [accolade(20, 2, '2026-02-15T09:00:00Z', 'ajout'), accolade(10, 99, '2026-01-20T09:00:00Z', 'retrait')];
    await monter();
    expect(liste()).toEqual([
      'm3', 'm2', 'A:À partir d’ici : suivi aussi par ce bien', 'A:À partir d’ici : sorti du suivi de ce bien', 'm1',
    ]);
    /* Plus récent en haut : l'accolade est EN DESSOUS du mail qu'elle ouvre (côté qui le précède dans le temps). */
    expect(hote.querySelectorAll('li.cnv-repere--dessous')).toHaveLength(2);
  });

  it('④ aucune accolade quand la période ne concerne pas ce bien (la route n’en rend pas)', async () => {
    await monter();
    expect(hote.querySelector('li.cnv-repere')).toBeNull();
    expect(liste()).toEqual(['m3', 'm2', 'm1']);
  });
});
