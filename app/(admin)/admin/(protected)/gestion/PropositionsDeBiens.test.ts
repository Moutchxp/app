// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PropositionsDeBiens } from './PropositionsDeBiens';

/**
 * 🔴 LOT AFFECTATION-PAR-BIEN — « UNE PROPOSITION À TRANCHER » : DES BIENS, ÉPROUVÉS À L'ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QU'ON CORRIGE, sur le cas réel d'Arno : le mail « Contestation de la retenue de 450 € sur dépôt de
 * garantie » affichait « PROPRIÉTAIRE MARTY Jean-François (310) ». Ce qui est protégé ici :
 *   ① chaque ligne est un BIEN — jamais une personne ;
 *   ② chacune porte son PROPRIÉTAIRE et son LOCATAIRE à la date du mail (« vacant » quand il n'y en a pas) ;
 *   ③ le MOTIF est écrit en clair ;
 *   ④ plusieurs biens sont cochables ;
 *   ⑤ 🔴 RIEN n'est écrit avant « Valider » — ouvrir, cocher, décocher : aucune requête d'écriture ;
 *   ⑥ une ancienne proposition « propriétaire » est rendue comme la LISTE DE SES BIENS, sans rien réécrire.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string }[];
let contexte: Record<string, unknown> | null;

const partie = (role: string, nom: string, o: Record<string, unknown> = {}) => ({ role, cle: nom, nom, ...o });
const bien = (cle: string, o: Record<string, unknown> = {}) => ({
  cle, libelle: `18 rue Danton, Levallois-Perret — lot ${cle}`, adresse: '18 rue Danton',
  commune: 'Levallois-Perret', typeBien: 'appartement',
  parties: [partie('proprietaire', 'MARTY Jean-François'), partie('locataire', 'DUPONT Claire')],
  recommande: false, dejaRattache: false,
  motif: 'un des 2 biens de MARTY Jean-François', cas: 'c', certitude: 'a_trancher', ...o,
});
const CONTEXTE = (o: Record<string, unknown> = {}) => ({
  messageId: 900, filId: 101, dateMail: '2026-09-28', nbMailsDuFil: 1,
  proprietaire: { cle: 'P1', nom: 'MARTY Jean-François' },
  examen: { issue: 'a_trancher', motif: '2 bien(s) proposé(s), à trancher' },
  pieces: [], biens: [bien('310a'), bien('310b')], disponible: true, ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  contexte = CONTEXTE();
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push({ url: u, methode: init?.method ?? 'GET' });
    if (u.includes('/classement?message=')) {
      return {
        ok: true,
        json: async () => (contexte === null ? { etat: 'erreur' } : { etat: 'ok', contexte }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(PropositionsDeBiens, {
      messageId: 900, occupe: false, onChange: () => {}, onClasser: () => {}, ...props,
    } as never));
  });
  await calmer();
};
const boutons = () => [...container.querySelectorAll('button')] as HTMLButtonElement[];
const boutonPar = (m: RegExp) => boutons().find((b) => m.test(b.textContent ?? ''));
const cliquer = async (e: Element | null | undefined) => {
  await act(async () => { (e as HTMLElement | undefined)?.click(); }); await calmer();
};
const cases = () => [...container.querySelectorAll('input[type="checkbox"]')] as HTMLInputElement[];
const ecritures = () => appels.filter((a) => a.methode !== 'GET');

describe('🔴 ① chaque ligne est un BIEN, jamais une personne', () => {
  it('le bloc annonce des biens, avec leur adresse et leur n° de lot', async () => {
    await monter();
    expect(container.textContent).toContain('2 propositions à trancher');
    expect(container.textContent).toContain('18 rue Danton, Levallois-Perret — lot 310a');
    expect(cases()).toHaveLength(2);
  });

  it('🔴 aucune ligne ne s’intitule « Propriétaire … » comme cible', async () => {
    await monter();
    const titres = [...container.querySelectorAll('.pdb-nom')].map((e) => e.textContent ?? '');
    expect(titres.every((t) => t.includes('lot'))).toBe(true);
  });
});

describe('🔴 ② ③ le couple du bien, à la date du mail, et le motif en clair', () => {
  it('propriétaire ET locataire sont écrits sous chaque bien', async () => {
    await monter();
    expect(container.textContent).toContain('Propriétaire :');
    expect(container.textContent).toContain('MARTY Jean-François');
    expect(container.textContent).toContain('Locataire :');
    expect(container.textContent).toContain('DUPONT Claire');
  });

  it('🔴 un bien sans locataire à cette date est dit « vacant » — un blanc n’est pas une réponse', async () => {
    contexte = CONTEXTE({ biens: [bien('310a', { parties: [partie('proprietaire', 'MARTY Jean-François')] })] });
    await monter();
    expect(container.textContent).toContain('vacant à la date du mail');
  });

  it('le motif est affiché tel quel, et la certitude aussi', async () => {
    contexte = CONTEXTE({
      biens: [bien('445', {
        certitude: 'quasi_certaine', motif: 'locataire en place à la date du mail (x@y.fr)', cas: 'a',
      })],
    });
    await monter();
    expect(container.textContent).toContain('locataire en place à la date du mail');
    expect(container.textContent).toContain('Quasi certain');
  });

  it('ce que le moteur conclut est rappelé en tête', async () => {
    await monter();
    expect(container.textContent).toContain('2 bien(s) proposé(s), à trancher');
  });
});

describe('🔴 ④ plusieurs biens cochables, et la pré-coche vient du moteur', () => {
  it('aucune case n’est cochée quand le moteur n’en recommande aucune (cas c)', async () => {
    await monter();
    expect(cases().every((c) => c.checked === false)).toBe(true);
    expect(boutonPar(/^Valider$/)?.disabled).toBe(true);
    expect(container.textContent).toContain('Aucun bien coché');
  });

  it('la case pré-cochée par le moteur l’est à l’écran, et une seule fois', async () => {
    contexte = CONTEXTE({ biens: [bien('310a', { recommande: true }), bien('310b')] });
    await monter();
    expect(cases().map((c) => c.checked)).toEqual([true, false]);
    // …et la décocher ne la fait pas revenir au rendu suivant.
    await cliquer(cases()[0]);
    expect(cases().map((c) => c.checked)).toEqual([false, false]);
  });

  it('cocher DEUX biens en pose deux : un mail parle parfois de deux appartements', async () => {
    await monter();
    await cliquer(cases()[0]);
    await cliquer(cases()[1]);
    expect(container.textContent).toContain('1 mail classé sur 2 biens');
    await cliquer(boutonPar(/^Valider$/));
    const posts = ecritures();
    expect(posts).toHaveLength(2);
    expect(posts.every((a) => a.methode === 'POST' && a.url.includes('/rattachements'))).toBe(true);
  });
});

describe('🔴 ⑤ rien n’est écrit avant « Valider »', () => {
  it('ouvrir, cocher, décocher : aucune requête d’écriture', async () => {
    await monter();
    await cliquer(cases()[0]);
    await cliquer(cases()[1]);
    await cliquer(cases()[0]);
    expect(ecritures()).toEqual([]);
  });

  it('la lecture, elle, n’a lieu qu’UNE fois : pas une requête par ligne', async () => {
    await monter();
    expect(appels.filter((a) => a.url.includes('/classement?message='))).toHaveLength(1);
  });
});

describe('🔴 ⑥ une ancienne proposition « propriétaire » devient la liste de ses biens', () => {
  it('elle est montrée comme des biens, avec le motif qui dit d’où elle vient', async () => {
    contexte = CONTEXTE({
      biens: [
        bien('310a', { motif: 'ancienne proposition « propriétaire MARTY Jean-François » — voici ses biens' }),
        bien('310b', { motif: 'ancienne proposition « propriétaire MARTY Jean-François » — voici ses biens' }),
      ],
    });
    await monter();
    expect(container.textContent).toContain('ancienne proposition « propriétaire MARTY Jean-François »');
    // 🔴 ET RIEN N'EST RÉÉCRIT EN BASE tant que personne n'a validé.
    expect(ecritures()).toEqual([]);
  });
});

describe('les états où le bloc ne rend rien', () => {
  it('aucun bien proposable ⇒ le bloc disparaît, il n’affiche pas un cadre vide', async () => {
    contexte = CONTEXTE({ biens: [] });
    await monter();
    expect(container.querySelector('.pdb-liste')).toBeNull();
  });

  it('annuaire ou migration absents ⇒ rien non plus, et surtout aucune erreur rouge', async () => {
    contexte = CONTEXTE({ disponible: false, biens: [] });
    await monter();
    expect(container.textContent).not.toContain('erreur');
    expect(container.querySelector('.pdb-liste')).toBeNull();
  });

  it('une réponse de serveur plus ancienne que ce lot ne fait pas tomber l’écran', async () => {
    // Pas de `biens`, pas d'`examen`, pas de `pieces` : `undefined.length` ferait s'écrouler le bandeau.
    contexte = { messageId: 900, disponible: true };
    await monter();
    expect(container.querySelector('.pdb-liste')).toBeNull();
  });
});
