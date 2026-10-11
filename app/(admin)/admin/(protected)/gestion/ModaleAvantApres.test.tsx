// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Conversation } from './Conversation';
import { CSS_MODALE_AVANT_APRES } from './ModaleAvantApres';

/**
 * ══ 🔴🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — LA FENÊTRE DU « i » DE L'ACCOLADE, OUVERTE POUR DE VRAI ══════════════
 *
 * Reprise du fichier de la fenêtre d'avant (`ModaleChangementSuivi`, remplacée sur demande d'Arno du 11/10/2026 par la
 * fenêtre en deux colonnes commune avec la pastille « one shot »). Il monte la VRAIE conversation et clique sur la VRAIE
 * pastille de l'accolade.
 *   ① rien n'est ouvert au départ, et le CLIC ouvre « Changement de suivi — <date> » ;
 *   ② DEUX COLONNES : « AVANT — suivi de fond », « APRÈS — à partir de ce mail », une ligne par bien ;
 *   ③ le bien retiré est BARRÉ côté APRÈS ; ④ sous les colonnes : par qui et quand, sur quel mail, la portée, la phrase ;
 *   ⑤ Fermer, Échap, clic à l'extérieur ; ⑥ aucune écriture (seule la lecture des lignes de biens) ; empilement mobile.
 * 🔒 AUCUNE DONNÉE RÉELLE.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Trois mails inventés, du plus ancien au plus récent — l'ordre dans lequel le serveur les rend. */
const MESSAGES = [
  {
    messageId: 101, de: 'madame.fictive@exemple.test', deNom: 'Madame Fictive', sens: 'recu',
    recuLe: '2026-09-23T13:25:00Z', objet: 'Fuite au plafond', corps: null, extrait: 'Premier courrier.',
    automatique: false, pieces: [], horsFile: false, motifHorsFile: null, nonRemises: [],
    destA: null, destCc: null, destinatairesFondus: 'gestion@exemple.test', htmlSeul: false,
  },
  {
    /* 🔴 LE MAIL QUI OUVRE LA SECONDE FENÊTRE : c'est de LUI que le repère parle, et c'est son expéditeur, sa date
       et son objet que le pied de la modale doit annoncer. */
    messageId: 102, de: 'monsieur.invente@exemple.test', deNom: 'Monsieur Inventé', sens: 'recu',
    recuLe: '2026-10-01T10:46:00Z', objet: 'Devis de réparation',
    corps: null, extrait: 'Voici le devis.',
    automatique: false, pieces: [], horsFile: false, motifHorsFile: null, nonRemises: [],
    destA: null, destCc: null, destinatairesFondus: 'gestion@exemple.test', htmlSeul: false,
  },
  {
    messageId: 103, de: 'gestion@exemple.test', deNom: 'GESTION', sens: 'envoye',
    recuLe: '2026-10-03T12:31:00Z', objet: 'Re: Devis de réparation',
    corps: 'Bien reçu.', extrait: 'Bien reçu.',
    automatique: false, pieces: [], horsFile: false, motifHorsFile: null, nonRemises: [],
    destA: null, destCc: null, destinatairesFondus: 'monsieur.invente@exemple.test', htmlSeul: false,
  },
];
const FIL = {
  filId: 4242, objet: 'Fuite au plafond', etat: 'a_classer', reference: null,
  evenementId: null, evenementObjet: null,
};

/**
 * LES DEUX FENÊTRES DE SUIVI — la forme du fil 3490.
 *
 * ⚠️ LA PREMIÈRE NE PRODUIT AUCUN REPÈRE (elle commence au premier mail : « À partir d'ici » en tête de
 * conversation ne sépare rien). C'est la SECONDE qu'on vient ouvrir, et elle change les trois lignes à la fois.
 */
const SUIVI = {
  etat: 'ok',
  mails: [101, 102, 103],
  exceptions: [],
  periodes: [
    {
      id: 11, depuisMessageId: 101,
      classement: {
        sorte: 'biens',
        biens: [{ cle: '484', libelle: '12 rue Inventée, VILLE-TEST — lot 484' }],
        personnes: [{ sorte: 'proprietaire', cle: 'p1', libelle: 'PROPRIO Fictif' }],
      },
      parLibelle: 'quelquun@exemple.test', le: '2026-09-23T15:00:00+02:00',
    },
    {
      /* 🔴 « AUCUN BIEN », POSÉE LE 01/10 À 20:12 : le cas d'Arno, à la forme près. */
      id: 22, depuisMessageId: 102,
      classement: { sorte: 'biens', biens: [] },
      parLibelle: 'a.jorel@exemple.test', le: '2026-10-01T20:12:36+02:00',
    },
  ],
};

let container: HTMLDivElement;
let root: Root;
let appels: string[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push(`${String(init?.method ?? 'GET')} ${u}`);
    if (u.includes('/gestion/suivi')) return { ok: true, json: async () => SUIVI } as unknown as Response;
    if (/\/messages\/\d+\/corps/.test(u)) {
      return { ok: true, json: async () => ({ corps: 'Le texte entier.' }) } as unknown as Response;
    }
    if (u.includes('/messages')) {
      return { ok: true, json: async () => ({ fil: FIL, messages: MESSAGES, partis: [] }) } as unknown as Response;
    }
    if (u.includes('/rattachements')) return { ok: true, json: async () => ({ etat: 'ok', data: {} }) } as unknown as Response;
    if (u.includes('/biens/lignes')) {
      return { ok: true, json: async () => ({ etat: 'ok', lignes: { '484': '12 rue Inventée, 92400 VILLE-TEST — lot 484' } }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); }); };
const monter = async () => {
  await act(async () => {
    root.render(createElement(Conversation, {
      filId: 4242, maintenant: new Date('2026-10-03T15:00:00Z'), onGeste: () => {},
    } as never));
  });
  await calmer();
};

const pastille = () => container.querySelector('button.cnv-repere-i') as HTMLButtonElement | null;
/** 🔴 ON LA CHERCHE DANS LE DOCUMENT ENTIER : son voile est `fixed`. */
const laModale = () => document.querySelector('.maa') as HTMLElement | null;
const colonne = (c: 'avant' | 'apres') => document.querySelector(`.maa-col--${c}`) as HTMLElement;
const cliquer = async (e: Element) => {
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await calmer();
};
const ouvrir = async () => { await monter(); await cliquer(pastille() as Element); };

describe('🔴🔴 ① clic → fenêtre', () => {
  it('rien n’est ouvert avant le clic ; le clic ouvre « Changement de suivi — <date> »', async () => {
    await monter();
    expect(pastille()).not.toBeNull();
    expect(laModale()).toBeNull();
    await cliquer(pastille() as Element);
    expect(laModale()?.querySelector('#maa-titre')?.textContent).toContain('Changement de suivi — ');
    expect(laModale()?.querySelector('#maa-titre')?.textContent).toContain('1 octobre 2026');
    expect(laModale()?.getAttribute('role')).toBe('dialog');
    expect(laModale()?.getAttribute('aria-modal')).toBe('true');
  });
  it('la pastille est un vrai bouton, nommé', async () => {
    await monter();
    const b = pastille() as HTMLButtonElement;
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('Voir le détail du changement');
  });
});

describe('🔴🔴 ② ③ deux colonnes : AVANT — suivi de fond / APRÈS — à partir de ce mail', () => {
  it('les titres, le statut, une ligne par bien (adresse, CP ville, lot), les parties', async () => {
    await ouvrir();
    expect(colonne('avant').querySelector('.maa-col-titre')?.textContent).toBe('AVANT — suivi de fond · 1 bien suivi');
    expect(colonne('apres').querySelector('.maa-col-titre')?.textContent).toBe('APRÈS — à partir de ce mail · aucun bien suivi');
    expect(colonne('avant').querySelector('.maa-statut')?.textContent).toBe('Statut : Classé');
    expect(colonne('avant').querySelector('.maa-bien')?.textContent).toBe('12 rue Inventée, 92400 VILLE-TEST — lot 484');
    expect(colonne('avant').querySelector('.maa-parties')?.textContent).toBe('Parties : PROPRIO Fictif (propriétaire)');
    expect(colonne('apres').querySelector('.maa-statut')?.textContent).toBe('Statut : À classer');
  });
  it('🔴 côté APRÈS, le bien retiré est barré (et dit « retiré »)', async () => {
    await ouvrir();
    const b = colonne('apres').querySelector('.maa-bien--retire') as HTMLElement;
    expect(b.textContent).toBe('12 rue Inventée, 92400 VILLE-TEST — lot 484 (retiré)');
    expect(CSS_MODALE_AVANT_APRES).toContain('.maa-bien--retire .maa-ligne{text-decoration:line-through');
  });
  it('🔴 une puce devant chaque adresse, élément à part (la 2ᵉ ligne s’aligne sous le texte) ; rouge pâle si retiré', async () => {
    await ouvrir();
    const avant = colonne('avant').querySelector('.maa-bien') as HTMLElement;
    expect(avant.firstElementChild?.className).toBe('maa-puce');
    expect(avant.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect((colonne('apres').querySelector('.maa-bien--retire') as HTMLElement).firstElementChild?.className).toBe('maa-puce');
    expect(CSS_MODALE_AVANT_APRES).toContain('.maa-puce{flex:0 0 auto;');
    expect(CSS_MODALE_AVANT_APRES).toContain('.maa-bien--retire .maa-puce{background:color-mix(in srgb, var(--color-svv-red) 55%');
  });
  it('🔴 l’avant d’une accolade vient de la fenêtre précédente : jamais « recalculé »', async () => {
    await ouvrir();
    expect(laModale()?.querySelector('.maa-recalcule')).toBeNull();
  });
  it('⚠️ sur petit écran, les deux colonnes s’empilent : AVANT puis APRÈS', () => {
    expect(CSS_MODALE_AVANT_APRES).toContain('.maa-colonnes{display:grid;grid-template-columns:1fr 1fr;');
    expect(CSS_MODALE_AVANT_APRES).toContain('@media (max-width:640px){.maa-colonnes{grid-template-columns:1fr}}');
  });
});

describe('🔴 ④ sous les colonnes, sur toute la largeur', () => {
  it('par qui et quand, sur quel mail, combien de mails couverts, la phrase de portée, Fermer', async () => {
    await ouvrir();
    const m = laModale() as HTMLElement;
    expect(m.querySelector('.maa-qui')?.textContent).toBe('Par a.jorel@exemple.test, le 01/10/2026 à 20:12');
    const comp = [...m.querySelectorAll('.maa-complement')].map((p) => p.textContent);
    expect(comp[0]).toContain('Sur le mail : Monsieur Inventé');
    expect(comp[0]).toContain('Devis de réparation');
    expect(comp[1]).toBe('Portée : 2 mails couverts par cette fenêtre');
    expect(m.querySelector('.maa-phrase')?.textContent).toBe('Les mails plus anciens ne changent pas.');
    expect([...m.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Fermer']);
  });
});

describe('🔴🔴 ⑤ Fermer, Échap, clic à l’extérieur', () => {
  it('Échap ferme, et l’on peut rouvrir', async () => {
    await ouvrir();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(laModale()).toBeNull();
    await cliquer(pastille() as Element);
    expect(laModale()).not.toBeNull();
  });
  it('« Fermer » ferme ; le clic dedans ne ferme pas, le clic sur le voile si', async () => {
    await ouvrir();
    await cliquer(laModale() as Element);
    expect(laModale()).not.toBeNull();
    await cliquer(document.querySelector('.maa-voile') as Element);
    expect(laModale()).toBeNull();
    await cliquer(pastille() as Element);
    await cliquer([...document.querySelectorAll('.maa button')].find((b) => b.textContent === 'Fermer') as Element);
    expect(laModale()).toBeNull();
  });
});

describe('🔴🔴 ⑥ une fenêtre de LECTURE', () => {
  it('ouvrir et fermer ne déclenche aucune écriture — seule la lecture des lignes de biens', async () => {
    await monter();
    const avant = appels.length;
    await cliquer(pastille() as Element);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(appels.slice(avant).every((a) => a.startsWith('GET ') && a.includes('/api/admin/gestion/biens/lignes'))).toBe(true);
  });
  it('le composant ne contient aucun verbe d’écriture', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/ModaleAvantApres.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const mot of ['POST', 'PATCH', 'DELETE', 'method:']) expect(src, mot).not.toContain(mot);
  });
});
