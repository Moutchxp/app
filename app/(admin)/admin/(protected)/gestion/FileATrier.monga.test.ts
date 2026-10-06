// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FileATrier } from './FileATrier';

/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 4 — LE FILTRE « INTERVENTIONS MONGA À RELIER (N) » ═══════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Arno : « dans “À rattacher”, un filtre “Interventions Monga à relier (N)” — une ligne par référence non reliée
 * (libellé, adresse, nombre de mails, dernière étape). »
 *
 * 🔴 CE FILTRE CHANGE L'UNITÉ DE LA LISTE, et c'est tout son intérêt : les trois autres comptent des MAILS, celui-
 * ci compte des INTERVENTIONS. Les 40 références du corpus portent 156 mails ; les trier mail par mail, c'est
 * répéter quarante fois la même décision.
 *
 * ⚠️ AUCUN GESTE N'EST OFFERT SUR CES LIGNES, et une épreuve l'exige. Relier se fait dans la fenêtre « Classer »,
 * où l'encart montre les lots candidats avec leur propriétaire et leur locataire. Un bouton « Relier » posé ici
 * relierait sans rien avoir montré — l'inverse de la décision n° 1 d'Arno.
 *
 * 🔒 AUCUN ENVOI, aucune donnée réelle : `fetch` simulé, interventions inventées.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PAGE = {
  lignes: [{
    messageId: 1, filId: 2, objet: 'Un mail ordinaire', de: 'x@exemple.test', deNom: null,
    recuLe: '2026-10-01T10:00:00Z', sens: 'recu', nbPieces: 0, issue: 'a_trier', motif: null, candidats: [],
  }],
  totaux: { aTrier: 1, sansCandidat: 0, automatiques: 0, nonExamines: 0 },
  tronque: false,
};

const INTERVENTIONS = [
  {
    reference: 'MNG-23987', libelle: 'barre de douche defixer',
    adresse: '53 avenue des Ternes, 75017 PARIS', lienMission: null, nbMails: 4,
    derniereEtape: 'devis_rappel', derniereEtapeLe: '2026-10-05T10:00:00Z',
    derniereEtapeMot: 'Devis en attente de validation · 05/10',
    dernierMessageId: '57489', dernierFilId: '36708', evenementId: null, evenementNom: null,
  },
  {
    reference: 'MNG-20354', libelle: 'Porte de box défaillante manque un ressort',
    adresse: null, lienMission: null, nbMails: 5,
    derniereEtape: 'commentaire', derniereEtapeLe: '2026-09-28T10:00:00Z',
    derniereEtapeMot: 'Nouveau commentaire · 28/09',
    dernierMessageId: '5045', dernierFilId: '3200', evenementId: null, evenementNom: null,
  },
];

/** 🔴 LOT MONGA-1, POINT 5 — le compte par cas voyage AVEC la liste, dans la même réponse. */
const CAS = {
  total: 2, unique: 1, plusieurs: 0, aucun: 1, nbLots: { 'MNG-23987': 1, 'MNG-20354': 0 },
};

let container: HTMLDivElement;
let root: Root;
let interventions: unknown[];
let ouvertures: { filId: number; messageId?: number | null }[];
let appels: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  interventions = INTERVENTIONS;
  ouvertures = [];
  appels = [];
  global.fetch = vi.fn(async (url: string | URL) => {
    const u = String(url);
    appels.push(u);
    const corps = u.includes('/monga?')
      ? { etat: 'ok', interventions, cas: CAS }
      : { etat: 'ok', data: PAGE };
    return { ok: true, json: async () => corps } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const monter = async () => {
  await act(async () => {
    root.render(createElement(FileATrier, {
      onRetour: () => {},
      onOuvrirFil: (filId: number, messageId?: number | null) => ouvertures.push({ filId, messageId }),
    }));
  });
  await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (motif: RegExp) => boutons().find((b) => motif.test(b.textContent ?? ''));
const cliquer = async (b: HTMLElement | null | undefined) => {
  await act(async () => { b?.click(); });
  await act(async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); });
};

describe('① le bouton du filtre, et son nombre', () => {
  it('🔴 « Interventions Monga à relier (2) » — le nombre AVANT le clic', async () => {
    await monter();
    const b = boutonPar(/Interventions Monga à relier/);
    expect(b?.textContent).toBe('Interventions Monga à relier (2)');
    /* ⚠️ Les trois filtres d'avant ce lot sont TOUJOURS là : on ajoute une entrée, on n'en retire aucune. */
    expect(boutonPar(/^Tous$/)).toBeDefined();
    expect(boutonPar(/^À départager$/)).toBeDefined();
    expect(boutonPar(/^Sans candidat$/)).toBeDefined();
  });

  it('🔴🔴 AUCUNE INTERVENTION ⇒ AUCUN BOUTON : on n’ajoute pas un filtre vide', async () => {
    interventions = [];
    await monter();
    expect(boutonPar(/Interventions Monga/)).toBeUndefined();
    // Et l'écran reste exactement celui d'avant ce lot.
    expect(container.textContent).toContain('Un mail ordinaire');
  });

  it('⚠️ une route muette (migration 311 absente) ne casse rien : la file se trie comme avant', async () => {
    global.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/monga?')) throw new Error('route absente');
      return { ok: true, json: async () => ({ etat: 'ok', data: PAGE }) } as unknown as Response;
    }) as unknown as typeof fetch;
    await monter();
    expect(boutonPar(/Interventions Monga/)).toBeUndefined();
    expect(container.textContent).toContain('Un mail ordinaire');
  });
});

describe('② une ligne par INTERVENTION, et ce qu’elle porte', () => {
  it('🔴 le libellé, l’adresse, le nombre de mails et la dernière étape', async () => {
    await monter();
    await cliquer(boutonPar(/Interventions Monga à relier/));
    const t = container.textContent ?? '';
    expect(t).toContain('MNG-23987 · barre de douche defixer');
    expect(t).toContain('53 avenue des Ternes, 75017 PARIS');
    expect(t).toContain('4 mails');
    expect(t).toContain('Devis en attente de validation · 05/10');
    /* ⚠️ UNE ADRESSE NON LUE EST DITE, jamais laissée vide : c'est le cas de 3 références sur 40. */
    expect(t).toContain('adresse non lue');
    expect(container.querySelectorAll('.fat-monga')).toHaveLength(2);
  });

  it('🔴🔴 LE COMPTE PAR CAS EST AFFICHÉ, et chaque ligne dit combien de biens porte son adresse', async () => {
    await monter();
    await cliquer(boutonPar(/Interventions Monga à relier/));
    const t = container.textContent ?? '';
    /* Il dit PAR OÙ COMMENCER : un seul bien se relie d'un coup d'œil, aucun demande une recherche. */
    expect(t).toContain('2 interventions à relier : 1 à un seul bien · 1 sans bien reconnu.');
    expect(t).toContain('1 bien à cette adresse');
    expect(t).toContain('aucun bien reconnu');
  });

  it('🔴🔴 AUCUN GESTE DE RATTACHEMENT SUR CES LIGNES — relier se fait dans la fenêtre « Classer »', async () => {
    await monter();
    await cliquer(boutonPar(/Interventions Monga à relier/));
    expect(boutonPar(/Relier/)).toBeUndefined();
    expect(boutonPar(/Confirmer/)).toBeUndefined();
    expect(container.querySelectorAll('input[type=checkbox]')).toHaveLength(0);
  });

  it('« Ouvrir le dernier mail » mène au mail le plus récent de la référence', async () => {
    await monter();
    await cliquer(boutonPar(/Interventions Monga à relier/));
    const ouvrir = [...container.querySelectorAll('.fat-monga button')] as HTMLButtonElement[];
    expect(ouvrir).toHaveLength(2);
    await cliquer(ouvrir[0]);
    expect(ouvertures).toEqual([{ filId: 36708, messageId: 57489 }]);
  });

  it('⚠️ ni liste de mails ni pagination dans ce filtre : ce ne sont pas des mails', async () => {
    await monter();
    expect(container.textContent).toContain('Un mail ordinaire');
    await cliquer(boutonPar(/Interventions Monga à relier/));
    expect(container.textContent).not.toContain('Un mail ordinaire');
    // La barre de pages dirait « page 1 sur 1 » au-dessus d'une liste d'interventions : elle ne paraît pas.
    expect(container.querySelector('.bpg')).toBeNull();
  });

  it('revenir à « Tous » rend la liste des mails, intacte', async () => {
    await monter();
    await cliquer(boutonPar(/Interventions Monga à relier/));
    await cliquer(boutonPar(/^Tous$/));
    expect(container.textContent).toContain('Un mail ordinaire');
    expect(container.querySelectorAll('.fat-monga')).toHaveLength(0);
  });
});
