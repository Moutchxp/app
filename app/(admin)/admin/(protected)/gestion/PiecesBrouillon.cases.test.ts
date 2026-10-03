// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PiecesBrouillon } from './PiecesBrouillon';
import {
  MENTION_PIECE_INDISPONIBLE, motCasesPieces, motToutCocher, piecesCochees, tailleQuiPartira,
} from '../../../../lib/gestion/piecesEnvoi';

/**
 * ══ 🔴🔴 LOT TRANSFERT-AVEC-PIECES — LES CASES DES PIÈCES D'UN TRANSFERT ════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * RÈGLE D'ARNO (03/10/2026) : « chaque pièce reprise a une case : on la décoche pour ne pas l'envoyer, on la
 * recoche. Un compteur “N pièce(s) jointe(s) sur M” et un lien “Tout cocher / Tout décocher”. Seules les pièces
 * cochées partent. Si une pièce est introuvable : ligne grisée “Pièce indisponible”, non cochée, avec un message
 * clair. Jamais un envoi qui échoue en silence. »
 *
 * 🔴 DÉCOCHER N'EST PAS RETIRER, et les deux gestes coexistent à l'écran : la case laisse la ligne en place (on la
 * recoche), la croix la fait disparaître. Ils écrivent le même champ en base (`retire_le`) parce que c'est lui que
 * l'envoi lit — mais ils ne disent pas la même chose à qui regarde, et ce fichier tient la différence.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
/** Ce que le serveur rend, et ce qu'il a reçu. */
let pieces: Record<string, unknown>[];
let patchs: { piece: number; cochee: boolean }[];
let refusProchainPatch: string | null;

const PIECE = (id: number, nom: string, o: Record<string, unknown> = {}) =>
  ({ id, nom, typeMime: 'application/pdf', taille: 1000 * id, origine: 'reprise', cochee: true, disponible: true, ...o });

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  pieces = []; patchs = []; refusProchainPatch = null;
  global.fetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const methode = init?.method ?? 'GET';
    if (u.includes('/pieces-recentes')) {
      return { ok: true, json: async () => ({ etat: 'ok', disponible: false, lignes: [] }) } as unknown as Response;
    }
    if (methode === 'PATCH') {
      const c = JSON.parse(String(init?.body ?? '{}')) as { piece: number; cochee: boolean };
      patchs.push(c);
      if (refusProchainPatch !== null) {
        const m = refusProchainPatch; refusProchainPatch = null;
        return { ok: false, json: async () => ({ etat: 'refuse', message: m }) } as unknown as Response;
      }
      // Le serveur applique : la relecture suivante doit montrer le nouvel état.
      pieces = pieces.map((p) => (p.id === c.piece ? { ...p, cochee: c.cochee } : p));
      return { ok: true, json: async () => ({ etat: 'ok', cochee: c.cochee }) } as unknown as Response;
    }
    if (methode === 'DELETE') {
      const id = Number(new URL(u, 'http://x').searchParams.get('piece'));
      pieces = pieces.filter((p) => p.id !== id);
      return { ok: true, json: async () => ({ etat: 'ok' }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ etat: 'ok', pieces }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 14; i++) await Promise.resolve(); }); };
let compteRemonte = 0;
const monter = async () => {
  compteRemonte = -1;
  await act(async () => {
    root.render(createElement(PiecesBrouillon, {
      brouillonId: 7, onChange: (n: number) => { compteRemonte = n; },
    } as never));
  });
  await calmer();
};
const cases = () => [...container.querySelectorAll('input.pjb-case')] as HTMLInputElement[];
const lignes = () => [...container.querySelectorAll('.pjb-carte')];
const compteur = () => container.querySelector('.pjb-compte')?.textContent ?? '';
const boutonTout = () => container.querySelector('.pjb-tout') as HTMLButtonElement | null;
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① LES MOTS, ÉPROUVÉS SEULS
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴 ① les mots du compteur et du lien', () => {
  it('🔴 « N pièce(s) jointe(s) sur M », au pluriel juste', () => {
    expect(motCasesPieces(3, 3)).toBe('3 pièces jointes sur 3');
    expect(motCasesPieces(1, 3)).toBe('1 pièce jointe sur 3');
    expect(motCasesPieces(0, 3)).toBe('0 pièce jointe sur 3');
  });

  /** 🔴 LE LIEN DIT CE QU'IL VA FAIRE, jamais l'état courant : « Tout décocher » quand tout est coché. */
  it('🔴 le lien annonce son effet', () => {
    expect(motToutCocher(true)).toBe('Tout décocher');
    expect(motToutCocher(false)).toBe('Tout cocher');
  });

  /** ⚠️ ABSENTE ⇒ COCHÉE : les pièces d'avant ce lot ne portent pas le champ, et elles sont jointes. */
  it('⚠️ une pièce sans `cochee` compte comme cochée', () => {
    expect(piecesCochees([{ cochee: true }, { cochee: false }, {}])).toHaveLength(2);
  });

  /** 🔴 LE POIDS EST CELUI DE CE QUI PART : une pièce décochée ne pèse rien. */
  it('🔴 la taille ne compte que les cochées', () => {
    expect(tailleQuiPartira([{ taille: 100 }, { taille: 50, cochee: false }, { taille: 7, cochee: true }])).toBe(107);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LES CASES À L'ÉCRAN
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ② trois pièces reprises, cochées par défaut', () => {
  beforeEach(() => { pieces = [PIECE(1, 'bail.pdf'), PIECE(2, 'quittance.pdf'), PIECE(3, 'edl.pdf')]; });

  it('🔴🔴 les trois cases sont là, et cochées', async () => {
    await monter();
    expect(cases()).toHaveLength(3);
    expect(cases().every((c) => c.checked)).toBe(true);
    expect(compteur()).toContain('3 pièces jointes sur 3');
  });

  /** 🔴🔴 LE COMPTE QUI REMONTE À « Envoyer (N pièces jointes) » EST CELUI DES COCHÉES. */
  it('🔴🔴 décocher une pièce : 2 sur 3, et le bouton « Envoyer » suit', async () => {
    await monter();
    expect(compteRemonte).toBe(3);
    await act(async () => { cases()[1].click(); }); await calmer();
    expect(patchs).toEqual([{ piece: 2, cochee: false }]);
    expect(compteur()).toContain('2 pièces jointes sur 3');
    expect(compteRemonte).toBe(2);
    // ⚠️ LA LIGNE RESTE : décocher n'est pas retirer.
    expect(lignes()).toHaveLength(3);
  });

  it('🔴 recocher la remet dans l’envoi', async () => {
    await monter();
    await act(async () => { cases()[1].click(); }); await calmer();
    await act(async () => { cases()[1].click(); }); await calmer();
    expect(patchs).toEqual([{ piece: 2, cochee: false }, { piece: 2, cochee: true }]);
    expect(compteur()).toContain('3 pièces jointes sur 3');
  });

  it('🔴🔴 « Tout décocher » puis « Tout cocher »', async () => {
    await monter();
    expect(boutonTout()?.textContent).toBe('Tout décocher');
    await cliquer(boutonTout());
    expect(compteur()).toContain('0 pièce jointe sur 3');
    expect(boutonTout()?.textContent).toBe('Tout cocher');
    await cliquer(boutonTout());
    expect(compteur()).toContain('3 pièces jointes sur 3');
  });

  /** ⚠️ LA CROIX EXISTE TOUJOURS, et elle fait autre chose : elle RETIRE la ligne. */
  it('⚠️ la croix retire la ligne, la case ne la retire pas', async () => {
    await monter();
    const croix = container.querySelector('.pjb-retirer');
    await cliquer(croix);
    expect(lignes()).toHaveLength(2);
    expect(patchs).toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LA PIÈCE INTROUVABLE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('🔴🔴 ③ une pièce dont les octets sont introuvables', () => {
  beforeEach(() => {
    pieces = [PIECE(1, 'bail.pdf'), PIECE(2, 'perdu.pdf', { cochee: false, disponible: false })];
  });

  it('🔴🔴 elle est MONTRÉE, grisée, non cochée, et sa case est inerte', async () => {
    await monter();
    expect(lignes()).toHaveLength(2);
    expect(container.textContent).toContain(MENTION_PIECE_INDISPONIBLE);
    const c = cases()[1];
    expect(c.checked).toBe(false);
    expect(c.disabled).toBe(true);
    expect(lignes()[1].className).toContain('pjb-carte--indisponible');
  });

  it('🔴 elle ne compte pas parmi les pièces jointes', async () => {
    await monter();
    expect(compteur()).toContain('1 pièce jointe sur 2');
    expect(compteRemonte).toBe(1);
  });

  /** 🔴 ET « Tout cocher » NE LA COCHE PAS : elle ne peut pas partir, et l'on ne fait pas semblant. */
  it('🔴🔴 « Tout cocher » la saute', async () => {
    await monter();
    await cliquer(boutonTout());            // tout décocher (bail était cochée)
    await cliquer(boutonTout());            // tout cocher
    expect(patchs.map((p) => p.piece)).not.toContain(2);
    expect(compteur()).toContain('1 pièce jointe sur 2');
  });

  /**
   * 🔴🔴 ET SI LE SERVEUR REFUSE, ON LE DIT. L'écran a bougé la case tout de suite pour que le clic réponde ; la
   * relecture remet la vérité, et le motif se LIT — jamais un envoi qui échoue en silence.
   */
  it('🔴🔴 un refus du serveur est affiché, et la case revient', async () => {
    pieces = [PIECE(1, 'bail.pdf', { cochee: false })];
    refusProchainPatch = 'Cette pièce ne peut pas être jointe : ses octets sont introuvables.';
    await monter();
    await act(async () => { cases()[0].click(); }); await calmer();
    expect(container.textContent).toContain('ses octets sont introuvables');
    expect(cases()[0].checked).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ UNE SEULE PIÈCE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('⚠️ ④ sur une seule pièce, pas de compteur ni de lien', () => {
  it('⚠️ la case suffit : « 1 sur 1 » et « Tout cocher » seraient du bruit', async () => {
    pieces = [PIECE(1, 'bail.pdf')];
    await monter();
    expect(cases()).toHaveLength(1);
    expect(container.querySelector('.pjb-compte')).toBeNull();
    expect(boutonTout()).toBeNull();
  });
});
