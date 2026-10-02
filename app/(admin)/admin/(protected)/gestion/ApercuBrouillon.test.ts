// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ApercuBrouillon } from './ApercuBrouillon';
import { BoiteMail } from './BoiteMail';
import {
  AIDE_OEIL, corpsApercu, enTeteApercu, MOT_MODIFIER, motPiecesBrouillon, objetApercu,
  TITRE_APERCU_BROUILLON,
} from '../../../../lib/gestion/apercuBrouillon';

/**
 * ══ 🔴🔴 LOT BROUILLONS-APERCU — VOIR UN BROUILLON TROUVÉ, ET LE MODIFIER ═════════════════════════════════════
 *
 * CONSTAT D'ARNO (02/10/2026), recherche « cecile thai » : « la carte “Brouillons (3)” liste les brouillons, sans
 * moyen de les voir. »
 *
 * CE QUE CE FICHIER PROTÈGE :
 *   ① l'œil est sur CHAQUE ligne — y compris un courrier neuf, qui n'était cliquable nulle part ;
 *   ② il ouvre un aperçu en LECTURE SEULE : objet, À, Cc, Cci, corps HTML, pièces jointes ;
 *   ③ « Modifier » rend la main à l'éditeur ORDINAIRE, avec LE BON brouillon ;
 *   ④ 🔴 L'APERÇU N'ÉCRIT RIEN : deux GET, et pas une seule écriture — on regarde un brouillon sans le réveiller ;
 *   ⑤ le refermer ne recharge pas les résultats : ils sont restés montés derrière.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BROUILLON = {
  id: 77, filId: 12, repondAMessageId: 345, voie: 'repondre' as const,
  a: ['cecile.thai@exemple.test'], cc: ['copie@exemple.test'], cci: ['discrete@exemple.test'],
  objet: 'Re: Contrôle ventilation',
  corps: 'Bonjour, voici le créneau.',
  corpsHtml: '<p>Bonjour, <b>voici</b> le créneau.</p>',
  citation: '> message d’origine',
  majLe: '2026-10-02T18:00:00Z',
};
const PIECES = [
  { id: 1, nom: 'devis.pdf', typeMime: 'application/pdf', taille: 2048, origine: 'ajoutee' },
  { id: 2, nom: 'photo.jpg', typeMime: 'image/jpeg', taille: 1048576, origine: 'reprise' },
];

let container: HTMLDivElement;
let root: Root;
/** Tout ce qui est appelé, avec sa méthode : c'est là qu'on prouve qu'aucune écriture n'a lieu. */
let appels: { url: string; methode: string }[];

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, methode: init?.method ?? 'GET' });
    if (u.includes('/pieces')) return { ok: true, json: async () => ({ etat: 'ok', pieces: PIECES }) } as Response;
    if (u.includes('brouillons?id=')) return { ok: true, json: async () => ({ brouillon: BROUILLON }) } as Response;
    return {
      ok: true,
      json: async () => ({
        lignes: [], suivant: null, total: 0, comptes: null, pleinTexte: true, automatiquesMasques: null,
        brouillons: { lignes: [], tronque: false },
      }),
    } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const texte = () => container.textContent ?? '';

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LE MODULE PUR — CE QU'UN APERÇU MONTRE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① ce que l’aperçu montre, décidé sans écran', () => {
  it('🔴 les trois lignes de destinataires, dans l’ordre d’un en-tête de mail', () => {
    expect(enTeteApercu(BROUILLON)).toEqual([
      { ligne: 'À', valeur: 'cecile.thai@exemple.test' },
      { ligne: 'Cc', valeur: 'copie@exemple.test' },
      { ligne: 'Cci', valeur: 'discrete@exemple.test' },
    ]);
  });

  it('⚠️ une ligne vide ne s’affiche pas — mais « À » reste, même vide', () => {
    const nu = { ...BROUILLON, a: [], cc: [], cci: [] };
    expect(enTeteApercu(nu)).toEqual([{ ligne: 'À', valeur: '' }]);
    expect(enTeteApercu({ ...BROUILLON, cc: ['  '], cci: [] }).map((l) => l.ligne)).toEqual(['À']);
  });

  it('🔴 un brouillon sans objet le DIT, il ne laisse pas un titre vide', () => {
    expect(objetApercu({ ...BROUILLON, objet: '   ' })).toBe('(sans objet)');
    expect(objetApercu(BROUILLON)).toBe('Re: Contrôle ventilation');
  });

  it('🔴 le HTML d’abord, le texte en repli', () => {
    expect(corpsApercu({ ...BROUILLON, citation: null }).sorte).toBe('html');
    const sansHtml = corpsApercu({ ...BROUILLON, corpsHtml: null, citation: null });
    expect(sansHtml).toEqual({ sorte: 'texte', texte: 'Bonjour, voici le créneau.' });
  });

  /**
   * 🔴🔴 LE PIÈGE QUE CE CAS FERME : la citation est stockée en TEXTE. La recoller telle quelle dans du HTML
   * ferait lire ses chevrons comme des balises. L'appelant fournit la version HTML — celle que l'éditeur
   * fabrique déjà — et c'est elle, et elle seule, qui est concaténée.
   */
  it('🔴🔴 la citation HTML est celle qu’on lui donne, jamais du texte recollé', () => {
    const avec = corpsApercu({ ...BROUILLON, citationHtml: '<blockquote>origine</blockquote>' });
    expect(avec).toEqual({
      sorte: 'html', html: '<p>Bonjour, <b>voici</b> le créneau.</p><blockquote>origine</blockquote>',
    });
    // Sans version HTML fournie, le texte de la citation N'ENTRE PAS dans le HTML.
    const sans = corpsApercu({ ...BROUILLON, citationHtml: null });
    expect(sans).toEqual({ sorte: 'html', html: '<p>Bonjour, <b>voici</b> le créneau.</p>' });
  });

  it('🔴 le compte des pièces, écrit comme on le lit', () => {
    expect(motPiecesBrouillon(0)).toBe('aucune pièce jointe');
    expect(motPiecesBrouillon(1)).toBe('1 pièce jointe');
    expect(motPiecesBrouillon(3)).toBe('3 pièces jointes');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LA FENÊTRE, MONTÉE POUR DE VRAI
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② l’aperçu, monté', () => {
  const monter = async (o?: { onFermer?: () => void; onModifier?: (b: unknown) => void }) => {
    await act(async () => {
      root.render(createElement(ApercuBrouillon, {
        brouillonId: 77, onFermer: o?.onFermer ?? (() => {}), onModifier: o?.onModifier ?? (() => {}),
      }));
    });
    await calmer();
  };

  it('🔴🔴 il montre l’objet, À, Cc, Cci, le corps mis en forme et les pièces', async () => {
    await monter();
    expect(texte()).toContain(TITRE_APERCU_BROUILLON);
    expect(texte()).toContain('Re: Contrôle ventilation');
    expect(texte()).toContain('cecile.thai@exemple.test');
    expect(texte()).toContain('copie@exemple.test');
    expect(texte()).toContain('discrete@exemple.test');
    // 🔴 LE CORPS EST RENDU EN HTML, par la visionneuse des mails : le gras est un <b>, pas des caractères.
    expect(container.querySelector('.cnv-html b')?.textContent).toBe('voici');
    expect(texte()).toContain('devis.pdf');
    expect(texte()).toContain('photo.jpg');
    expect(texte()).toContain('2 pièces jointes');
  });

  /**
   * 🔴🔴 LE CAS QUI COMPTE LE PLUS : regarder un brouillon ne doit RIEN écrire. Un aperçu qui enregistrerait,
   * ne serait-ce qu'en touchant `maj_le`, ferait remonter en tête de liste tous les brouillons qu'on a seulement
   * regardés — et l'on ne saurait plus lesquels on a vraiment repris.
   */
  it('🔴🔴 il n’émet QUE des lectures — aucune écriture, jamais', async () => {
    await monter();
    expect(appels.every((a) => a.methode === 'GET')).toBe(true);
    expect(appels.map((a) => a.url).some((u) => u.includes('brouillons?id=77'))).toBe(true);
    expect(appels.map((a) => a.url).some((u) => u.includes('/brouillons/77/pieces'))).toBe(true);
  });

  it('🔴🔴 « Modifier » rend la main à l’éditeur, avec LE BON brouillon, et referme l’aperçu', async () => {
    const vus: { id: number; filId: number | null; repondAMessageId: number | null }[] = [];
    let ferme = 0;
    await monter({
      onFermer: () => { ferme += 1; },
      onModifier: (b) => vus.push(b as { id: number; filId: number | null; repondAMessageId: number | null }),
    });
    const bouton = [...container.querySelectorAll('button')]
      .find((x) => x.textContent === MOT_MODIFIER) as HTMLButtonElement;
    expect(bouton).toBeTruthy();
    await act(async () => { bouton.click(); });
    expect(vus).toHaveLength(1);
    // Le brouillon entier, avec de quoi le rouvrir SOUS SON MESSAGE dans sa conversation.
    expect(vus[0].id).toBe(77);
    expect(vus[0].filId).toBe(12);
    expect(vus[0].repondAMessageId).toBe(345);
    // ⚠️ ET L'APERÇU SE REFERME : deux fenêtres sur le même brouillon montreraient deux états, dont un faux.
    expect(ferme).toBe(1);
  });

  it('🔴 la croix et la touche Échap ferment, sans rien écrire', async () => {
    let ferme = 0;
    await monter({ onFermer: () => { ferme += 1; } });
    const croix = container.querySelector('button[aria-label="Fermer l’aperçu"]') as HTMLButtonElement;
    await act(async () => { croix.click(); });
    expect(ferme).toBe(1);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(ferme).toBe(2);
    expect(appels.every((a) => a.methode === 'GET')).toBe(true);
  });

  it('⚠️ un brouillon illisible le dit, il ne laisse pas une fenêtre vide', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/pieces')) return { ok: true, json: async () => ({ etat: 'ok', pieces: [] }) } as Response;
      return { ok: true, json: async () => ({ brouillon: null }) } as Response;
    }) as unknown as typeof fetch;
    await monter();
    expect(texte()).toContain('n’a pas pu être lu');
  });

  /** ⚠️ SANS LA MIGRATION 252, la route des pièces rend « sans_schema » : le brouillon reste lisible. */
  it('⚠️ des pièces illisibles n’empêchent pas de lire le brouillon', async () => {
    global.fetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/pieces')) return { ok: false, json: async () => ({}) } as Response;
      return { ok: true, json: async () => ({ brouillon: BROUILLON }) } as Response;
    }) as unknown as typeof fetch;
    await monter();
    expect(texte()).toContain('Re: Contrôle ventilation');
    expect(texte()).toContain('aucune pièce jointe');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ L'ŒIL, DANS LES RÉSULTATS DE RECHERCHE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ l’œil sur chaque ligne de la carte « Brouillons »', () => {
  const RESULTATS = {
    lignes: [], suivant: null, total: 0, comptes: null, pleinTexte: true, automatiquesMasques: null,
    brouillons: {
      tronque: false,
      lignes: [
        {
          brouillonId: 77, filId: 12, objet: 'Re: Contrôle ventilation', destinataire: 'cecile.thai@exemple.test',
          majLe: '2026-10-02T18:00:00Z', extrait: null, aPiece: true,
        },
        {
          brouillonId: 78, filId: null, objet: 'Devis ascenseur', destinataire: null,
          majLe: '2026-10-01T10:00:00Z', extrait: null, aPiece: false,
        },
      ],
    },
  };

  /** Saisir dans un champ contrôlé par React : par le setter natif, sinon React ignore la valeur. */
  const taper = async (champ: HTMLInputElement, valeur: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, valeur);
    await act(async () => { champ.dispatchEvent(new Event('input', { bubbles: true })); });
    await calmer();
  };

  const chercher = async (o?: { avecOeil?: boolean; vus?: number[] }) => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => RESULTATS }) as Response) as unknown as typeof fetch;
    await act(async () => {
      root.render(createElement(BoiteMail, {
        onOuvrir: () => {},
        ...(o?.avecOeil === false ? {} : { onApercuBrouillon: (id: number) => o?.vus?.push(id) }),
      }));
    });
    await calmer();
    await taper(container.querySelector('input[type="search"]') as HTMLInputElement, 'cecile thai');
    const f = container.querySelector('form.bte-recherche') as HTMLFormElement;
    await act(async () => { f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await calmer();
  };

  it('🔴🔴 un œil par ligne — y compris sur le courrier neuf, qui n’était cliquable nulle part', async () => {
    const vus: number[] = [];
    await chercher({ vus });
    const yeux = [...container.querySelectorAll(`button[aria-label="${AIDE_OEIL}"]`)];
    expect(yeux).toHaveLength(2);
    // ⚠️ ET LE LIBELLÉ D'ARNO N'A PAS BOUGÉ D'UN CARACTÈRE.
    expect(texte()).toContain('courrier neuf, à rouvrir dans « Brouillons »');
    expect(texte()).toContain('Brouillons (2)');
  });

  it('🔴🔴 cliquer l’œil demande l’aperçu DU BON brouillon', async () => {
    const vus: number[] = [];
    await chercher({ vus });
    const yeux = [...container.querySelectorAll(`button[aria-label="${AIDE_OEIL}"]`)] as HTMLButtonElement[];
    await act(async () => { yeux[1].click(); });
    expect(vus).toEqual([78]);
    await act(async () => { yeux[0].click(); });
    expect(vus).toEqual([78, 77]);
  });

  /**
   * 🔴🔴 LE RETOUR AUX RÉSULTATS. L'aperçu est posé PAR-DESSUS par l'écran parent : la carte reste montée, avec
   * ses mêmes lignes. Ce cas le prouve là où ça compte — cliquer l'œil ne relance AUCUNE recherche.
   */
  it('🔴🔴 ouvrir un aperçu ne relance aucune recherche : les résultats sont intacts', async () => {
    const vus: number[] = [];
    await chercher({ vus });
    const avant = (global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    const yeux = [...container.querySelectorAll(`button[aria-label="${AIDE_OEIL}"]`)] as HTMLButtonElement[];
    await act(async () => { yeux[0].click(); });
    await calmer();
    expect((global.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(avant);
    expect(texte()).toContain('Brouillons (2)');
    // ⚠️ « Re: » est retiré à l'AFFICHAGE par `nettoyerObjet`, comme sur toutes les lignes de liste du module.
    expect(texte()).toContain('Contrôle ventilation');
    expect(texte()).toContain('cecile.thai@exemple.test');
  });

  /** ⚠️ SANS LE GESTE, PAS D'ŒIL : une icône qui n'ouvre rien est pire que pas d'icône. */
  it('⚠️ sans `onApercuBrouillon`, la carte est exactement celle d’avant ce lot', async () => {
    await chercher({ avecOeil: false });
    expect(container.querySelectorAll(`button[aria-label="${AIDE_OEIL}"]`)).toHaveLength(0);
    expect(texte()).toContain('Brouillons (2)');
  });
});
