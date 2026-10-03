// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { Conversation } from './Conversation';
import { CSS_MODALE_CHANGEMENT_SUIVI } from './ModaleChangementSuivi';

/**
 * ══ 🔴🔴 LOT REPERE-INTEGRE-ET-MODALE-AVANT-APRES, POINT 2 — LA MODALE, OUVERTE POUR DE VRAI ══════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO (03/10/2026) : « Tests : clic → modale ; deux colonnes alignées ; différences marquées ; Échap
 * ferme. »
 *
 * 🔴 CE FICHIER MONTE LA VRAIE CONVERSATION, et clique sur la VRAIE pastille — pas un décor qui refait le même
 * geste à côté. C'est la seule façon d'éprouver ce qu'Arno décrit : il clique sur la pastille d'un repère, dans la
 * liste des mails d'une conversation. Un essai sur la modale seule aurait laissé passer un câblage manquant (c'est
 * d'ailleurs exactement ce qui s'est produit ce matin sur le CÔTÉ du repère : le module pur était juste, l'écran
 * ne l'écoutait pas).
 *
 * ═══ CE QUE CE FICHIER PROTÈGE ════════════════════════════════════════════════════════════════════════════════════
 *   ① rien n'est ouvert au départ, et le CLIC ouvre ;
 *   ② DEUX COLONNES ALIGNÉES : les mêmes quatre lignes de part et d'autre, sur un seul gabarit de grille ;
 *   ③ les lignes qui DIFFÈRENT sont marquées — fond léger ET mot « modifié » ;
 *   ④ le pied dit qui, quand, sur quel mail, et combien de mails la fenêtre couvre ;
 *   ⑤ trois portes pour sortir : Fermer, Échap, clic à l'extérieur ;
 *   ⑥ 🔴 AUCUNE ÉCRITURE, AUCUNE REQUÊTE : ouvrir la fenêtre ne parle à personne.
 *
 * 🔒 AUCUNE DONNÉE RÉELLE : un fil inventé, des adresses inventées, `fetch` simulé — rien ne sort. La FORME, elle,
 * est celle du fil 3490 d'Arno (une fenêtre sur le premier mail, une autre plus loin qui ne classe plus rien) :
 * c'est le cas qu'il regarde, et celui qui produit un repère.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
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
/** 🔴 ON LA CHERCHE DANS LE DOCUMENT ENTIER : son voile est `fixed`, et c'est tout le point. */
const laModale = () => document.querySelector('.mcs') as HTMLElement | null;
const lignes = () => [...document.querySelectorAll('.mcs-ligne')] as HTMLElement[];
const ligne = (libelle: string) =>
  lignes().find((l) => (l.querySelector('.mcs-axe')?.textContent ?? '').startsWith(libelle));
const valeurs = (l: HTMLElement) => [...l.querySelectorAll('.mcs-val')].map((v) => v.textContent ?? '');

const cliquer = async (e: Element) => {
  await act(async () => { e.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};
const ouvrir = async () => { await monter(); await cliquer(pastille() as Element); };

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① 🔴🔴 LE CLIC OUVRE — ET RIEN NE S'OUVRE AVANT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ① clic → modale', () => {
  it('🔴🔴 la pastille est là, et rien n’est ouvert avant le clic', async () => {
    await monter();
    expect(pastille()).not.toBeNull();
    expect(laModale()).toBeNull();
  });

  it('🔴🔴 un clic sur la pastille ouvre « Changement de suivi — <date> »', async () => {
    await ouvrir();
    const m = laModale();
    expect(m).not.toBeNull();
    const titre = m?.querySelector('#mcs-titre')?.textContent ?? '';
    expect(titre).toContain('Changement de suivi — ');
    /* 🔴 LA DATE EST CELLE DU GESTE, écrite en clair — jamais un horodatage brut. */
    expect(titre).toContain('1 octobre 2026');
  });

  /**
   * 🔴 LE CLAVIER PASSE PAR LE BOUTON NATIF : Entrée et Espace déclenchent son `onClick`, c'est le navigateur qui
   * le fait. On fige donc ce qui le GARANTIT — un vrai `<button type="button">`, annoncé comme ouvrant une
   * fenêtre. Un `onKeyDown` de plus l'aurait ouvert DEUX fois sur Entrée.
   */
  it('🔴🔴 c’est un vrai bouton, donc Entrée et Espace l’ouvrent', async () => {
    await monter();
    const b = pastille() as HTMLButtonElement;
    expect(b.tagName).toBe('BUTTON');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    /* ⚠️ ET LE SURVOL NE FAIT PLUS QU'UNE CHOSE : dire ce que le clic va ouvrir. */
    expect(b.getAttribute('title')).toBe('Voir le détail du changement');
    expect(b.getAttribute('aria-label')).toBe('Voir le détail du changement');
  });

  /** ⚠️ ET LA FENÊTRE SE DIT FENÊTRE : sans `aria-modal` et sans titre nommé, on lit la page derrière. */
  it('⚠️ c’est une vraie fenêtre modale, avec un titre nommé', async () => {
    await ouvrir();
    const m = laModale() as HTMLElement;
    expect(m.getAttribute('role')).toBe('dialog');
    expect(m.getAttribute('aria-modal')).toBe('true');
    expect(m.getAttribute('aria-labelledby')).toBe('mcs-titre');
    expect(pastille()?.getAttribute('aria-expanded')).toBe('true');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② 🔴🔴 DEUX COLONNES ALIGNÉES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② deux colonnes alignées', () => {
  it('🔴🔴 « Avant » à gauche, « Après » à droite, nommées une seule fois', async () => {
    await ouvrir();
    const cols = [...document.querySelectorAll('.mcs-tete .mcs-col')].map((c) => c.textContent);
    expect(cols).toEqual(['Avant', 'Après']);
  });

  /**
   * 🔴🔴 L'ALIGNEMENT EST UNE GRILLE, PAS DEUX LISTES. Les quatre lignes d'Arno sont là, dans son ordre, et
   * chacune porte EXACTEMENT deux valeurs — celle d'avant et celle d'après, en regard.
   *
   * ⚠️ DEUX LISTES CÔTE À CÔTE SE DÉCALENT dès qu'un côté a une valeur de plus, et c'est précisément ce qu'on
   * vient comparer. C'est pour cela que l'intitulé vit dans une colonne à part.
   */
  it('🔴🔴 les quatre lignes d’Arno, deux valeurs chacune, en regard', async () => {
    await ouvrir();
    expect(lignes().map((l) => (l.querySelector('.mcs-axe')?.textContent ?? '').replace('modifié', '')))
      .toEqual(['Statut', 'Bien(s)', 'Personnes concernées', 'Choix de suivi']);
    for (const l of lignes()) expect(valeurs(l)).toHaveLength(2);
  });

  /**
   * 🔴🔴 ET LES COLONNES SE LISENT DE HAUT EN BAS : les valeurs sont CALÉES À GAUCHE, pas centrées.
   *
   * ⚠️ CE N'EST PAS UN ORNEMENT. La modale est rendue DANS la phrase du repère, qui est centrée
   * (`.cnv-repere-phrase`) : sans cette règle, les deux colonnes héritaient du centrage et chaque valeur flottait
   * au milieu de la sienne — l'œil ne pouvait plus suivre une colonne du regard. Relevé à l'écran le 03/10/2026,
   * sur le fil 3490.
   */
  it('🔴🔴 les valeurs sont calées à gauche, malgré la phrase centrée qui les porte', () => {
    expect(CSS_MODALE_CHANGEMENT_SUIVI).toContain('background:rgba(17,19,24,.45);text-align:left}');
  });

  /** 🔴 UN SEUL GABARIT DE COLONNES pour l'en-tête ET les lignes : c'est ce qui FAIT l'alignement. */
  it('🔴🔴 un seul gabarit de colonnes pour l’en-tête et les lignes', () => {
    expect(CSS_MODALE_CHANGEMENT_SUIVI)
      .toContain('.mcs-tete,.mcs-ligne{display:grid;grid-template-columns:9.5rem 1fr 1fr');
  });

  /** ⚠️ EN MOBILE, LES COLONNES S'EMPILENT, et chaque valeur reprend son étiquette (demande d'Arno). */
  it('⚠️ en mobile les colonnes s’empilent, étiquetées', async () => {
    await ouvrir();
    expect(CSS_MODALE_CHANGEMENT_SUIVI).toContain('@media (max-width:640px){');
    expect(CSS_MODALE_CHANGEMENT_SUIVI).toContain('.mcs-ligne{grid-template-columns:1fr;gap:.2rem}');
    expect(CSS_MODALE_CHANGEMENT_SUIVI).toContain(".mcs-val::before{content:attr(data-cote) ' : '");
    const l = ligne('Statut') as HTMLElement;
    expect([...l.querySelectorAll('.mcs-val')].map((v) => v.getAttribute('data-cote')))
      .toEqual(['Avant', 'Après']);
  });

  /** 🔴 LES VALEURS SONT CELLES DU MODULE PUR, mot pour mot — et le statut vide dit « À classer ». */
  it('🔴🔴 le contenu est celui du comparatif, « À classer » compris', async () => {
    await ouvrir();
    expect(valeurs(ligne('Statut') as HTMLElement)).toEqual(['Classé', 'À classer']);
    expect(valeurs(ligne('Bien(s)') as HTMLElement))
      .toEqual(['12 rue Inventée, VILLE-TEST — lot 484', 'aucun bien']);
    /* 🔴🔴 « AVEC RÔLE » (Arno) : un nom seul ne dit pas si c'est le bailleur ou l'occupant. */
    expect(valeurs(ligne('Personnes concernées') as HTMLElement))
      .toEqual(['PROPRIO Fictif (propriétaire)', 'aucune personne nommée']);
    expect(valeurs(ligne('Choix de suivi') as HTMLElement))
      .toEqual(['—', 'ce mail et la conversation à venir']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ 🔴🔴 LES DIFFÉRENCES SONT MARQUÉES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ les lignes qui diffèrent sont mises en évidence', () => {
  /**
   * 🔴🔴 FOND LÉGER **ET** MOT « MODIFIÉ ». La couleur SIGNALE, le mot INFORME : un aplat seul ne se lit ni en
   * niveaux de gris, ni au lecteur d'écran, et Arno demande les deux (« fond léger, marque “modifié” »).
   */
  it('🔴🔴 les trois lignes qui changent portent le fond ET le mot', async () => {
    await ouvrir();
    const marquees = lignes().filter((l) => l.classList.contains('mcs-ligne--modifiee'));
    expect(marquees.map((l) => (l.querySelector('.mcs-axe')?.textContent ?? '').replace('modifié', '')))
      .toEqual(['Statut', 'Bien(s)', 'Personnes concernées']);
    for (const l of marquees) expect(l.querySelector('.mcs-marque')?.textContent).toBe('modifié');
  });

  /**
   * ⚠️ « CHOIX DE SUIVI » N'EST JAMAIS MARQUÉ : c'est le geste qui a produit CETTE fenêtre, pas un état antérieur.
   * Il n'a rien à comparer, et le signaler « modifié » serait un mensonge poli.
   */
  it('⚠️ la ligne « Choix de suivi » ne compare rien, donc ne se marque pas', async () => {
    await ouvrir();
    const l = ligne('Choix de suivi') as HTMLElement;
    expect(l.classList.contains('mcs-ligne--modifiee')).toBe(false);
    expect(l.querySelector('.mcs-marque')).toBeNull();
  });

  /** 🔴 LE FOND EST UN APLAT DU JETON ROUGE, jamais un gris : lisible en Clair comme en Sombre. */
  it('🔴 la mise en évidence n’est faite que de jetons', () => {
    expect(CSS_MODALE_CHANGEMENT_SUIVI)
      .toContain('.mcs-ligne--modifiee{background:color-mix(in srgb, var(--color-svv-red) 12%, var(--color-svv-field))');
    /* ⚠️ AUCUNE COULEUR EN DUR hors les deux ombres portées, qui sont celles des autres fenêtres du module. */
    const couleurs = CSS_MODALE_CHANGEMENT_SUIVI.match(/#[0-9a-f]{3,8}|rgba?\(/gi) ?? [];
    expect(couleurs).toEqual(['rgba(', 'rgba(']);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE PIED : QUI, QUAND, SUR QUEL MAIL, ET CE QUE LA FENÊTRE COUVRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ④ le pied de la modale', () => {
  it('🔴🔴 qui, quand, et SUR QUEL MAIL (expéditeur, date, objet)', async () => {
    await ouvrir();
    const pied = document.querySelector('.mcs-pied')?.textContent ?? '';
    expect(pied).toContain('a.jorel@exemple.test');
    expect(pied).toContain('1 octobre 2026');
    /* 🔴 LE MAIL VISÉ EST BIEN LE 102, celui qui OUVRE la fenêtre — pas son voisin. */
    expect(pied).toContain('Monsieur Inventé');
    expect(pied).toContain('Devis de réparation');
  });

  /** 🔴🔴 « LE NOMBRE DE MAILS COUVERTS PAR LA NOUVELLE FENÊTRE » (Arno) : du mail 102 jusqu'au bout, donc deux. */
  it('🔴🔴 le nombre de mails couverts par la fenêtre', async () => {
    await ouvrir();
    expect(document.querySelector('.mcs-pied')?.textContent)
      .toContain('2 mails couverts par cette fenêtre');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑤ TROIS PORTES POUR SORTIR
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑤ Fermer, Échap, clic à l’extérieur', () => {
  it('🔴🔴 Échap ferme', async () => {
    await ouvrir();
    expect(laModale()).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(laModale()).toBeNull();
  });

  it('🔴 le bouton « Fermer » ferme', async () => {
    await ouvrir();
    const bouton = [...document.querySelectorAll('.mcs-boutons button')]
      .find((b) => b.textContent === 'Fermer') as HTMLButtonElement;
    expect(bouton).toBeDefined();
    await cliquer(bouton);
    expect(laModale()).toBeNull();
  });

  it('🔴 le clic à l’extérieur ferme — et le clic DEDANS ne ferme pas', async () => {
    await ouvrir();
    await cliquer(laModale() as Element);
    expect(laModale()).not.toBeNull();
    const voile = document.querySelector('.mcs-voile') as HTMLElement;
    await act(async () => { voile.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(laModale()).toBeNull();
  });

  /** ⚠️ ET ON PEUT ROUVRIR : la pastille n'est pas à usage unique. */
  it('⚠️ rouvrir après avoir fermé', async () => {
    await ouvrir();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await cliquer(pastille() as Element);
    expect(laModale()).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ⑥ 🔴🔴 AUCUNE ÉCRITURE, AUCUNE REQUÊTE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ⑥ une fenêtre de LECTURE', () => {
  /** 🔴🔴 « AUCUNE ÉCRITURE » (Arno) : ouvrir la fenêtre ne parle à personne — elle n'a rien à demander. */
  it('🔴🔴 ouvrir et fermer ne déclenche aucun appel', async () => {
    await monter();
    const avant = appels.length;
    await cliquer(pastille() as Element);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(appels.slice(avant)).toEqual([]);
  });

  /** 🔴 ET LE COMPOSANT N'A MÊME PAS DE QUOI ÉCRIRE : ni `fetch`, ni verbe d'écriture, ni route. */
  it('🔴🔴 le composant ne contient ni fetch ni verbe d’écriture', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/gestion/ModaleChangementSuivi.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//')).join('\n');
    for (const mot of ['fetch(', 'POST', 'PATCH', 'DELETE', '/api/']) {
      expect(src, mot).not.toContain(mot);
    }
  });
});
