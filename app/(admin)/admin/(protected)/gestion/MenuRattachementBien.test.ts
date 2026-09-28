// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MenuRattachementBien } from './MenuRattachementBien';

/**
 * 🔴 LOT BIEN-RATTACHE — LE MENU DE RATTACHEMENT, ÉPROUVÉ À L'ÉCRAN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Ce qui est protégé ici, demande par demande :
 *   ③a les PROPOSITIONS de l'automatisation sont EN HAUT — et la zone disparaît s'il n'y en a aucune ;
 *   ③b la RECHERCHE LIBRE est en dessous, et ses résultats sont des BIENS, jamais des personnes ;
 *       un bien déjà proposé n'est pas répété ; « aucun bien trouvé » dit ce qu'on a cherché ;
 *   ③c UNE SEULE VALIDATION pour les deux zones, avec la portée et « Hors gestion » ;
 *   🔴 RIEN n'est écrit avant « Rattacher ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let appels: { url: string; methode: string; corps: unknown }[];
let contexte: Record<string, unknown> | null;
let resultats: { lignes: unknown[]; tronque?: boolean };

const partie = (role: string, nom: string) => ({ role, cle: nom, nom, emails: [], telephones: [] });
const propose = (cle: string, o: Record<string, unknown> = {}) => ({
  cle, libelle: `4 rue Alpha, 92000 VILLE — lot ${cle}`, adresse: '4 rue Alpha', commune: 'VILLE',
  typeBien: 'Type 2', adresseComplete: '4 rue Alpha, 92000 VILLE',
  caracteristiques: [{ libelle: 'Nature', valeur: 'Appartement' }],
  parties: [partie('proprietaire', 'BAILLEUR A'), partie('locataire', 'LOCATAIRE A')],
  recommande: false, dejaRattache: false,
  motif: 'un des 2 biens de BAILLEUR A', cas: 'c', certitude: 'a_trancher', ...o,
});
const trouve = (cle: string, o: Record<string, unknown> = {}) => ({
  cle, libelle: `9 rue Beta, 92000 VILLE — lot ${cle}`, adresse: '9 rue Beta, 92000 VILLE',
  nature: 'Appartement', typeBien: 'Studio',
  parties: [partie('proprietaire', 'BAILLEUR B'), partie('locataire', 'LOCATAIRE B')],
  raisons: [{ sorte: 'adresse', detail: '' }], ...o,
});

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  appels = [];
  resultats = { lignes: [] };
  contexte = {
    messageId: 900, filId: 101, dateMail: '2026-08-13', nbMailsDuFil: 3,
    proprietaire: null, examen: { issue: 'a_trancher', motif: '2 bien(s) proposé(s), à trancher' },
    pieces: [], biens: [propose('445'), propose('446')], disponible: true,
  };
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    appels.push({
      url: u, methode: init?.method ?? 'GET',
      corps: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (u.includes('/classement?message=')) {
      return { ok: true, json: async () => ({ etat: 'ok', contexte }) } as unknown as Response;
    }
    if (u.includes('/classement?fil=')) {
      return { ok: true, json: async () => ({ etat: 'ok', mails: [900, 901] }) } as unknown as Response;
    }
    if (u.includes('/biens?')) {
      return { ok: true, json: async () => ({ etat: 'ok', ...resultats }) } as unknown as Response;
    }
    return { ok: true, json: async () => ({ ok: true }) } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });

const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const monter = async (props: Record<string, unknown> = {}) => {
  await act(async () => {
    root.render(createElement(MenuRattachementBien, {
      messageId: 900, filId: 101, onFerme: () => {}, onChange: () => {}, onHorsGestion: () => {}, ...props,
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
const champ = () => container.querySelector('.mrb-saisie') as HTMLInputElement;
const taper = async (t: string) => {
  await act(async () => {
    const c = champ();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(c, t);
    c.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // La frappe est temporisée : on laisse passer le délai avant de lire les résultats.
  await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
  await calmer();
};
const ecritures = () => appels.filter((a) => a.methode !== 'GET');

describe('🔴 ③a les propositions de l’automatisation, EN HAUT', () => {
  it('elles sont affichées, avec leur motif, avant la recherche', async () => {
    await monter();
    expect(container.textContent).toContain('2 propositions de l’automatisation');
    expect(container.textContent).toContain('un des 2 biens de BAILLEUR A');
    const html = container.innerHTML;
    expect(html.indexOf('propositions de l’automatisation')).toBeLessThan(html.indexOf('Chercher un autre bien'));
  });

  it('chaque proposition garde sa fiche : propriétaire, locataire, certitude', async () => {
    await monter();
    expect(container.querySelector('.pdb-proprios')?.textContent).toContain('BAILLEUR A');
    expect(container.querySelector('.pdb-col--loc')?.textContent).toContain('LOCATAIRE A');
    expect(container.textContent).toContain('À trancher');
  });

  it('🔴 AUCUNE proposition ⇒ la zone ne s’affiche PAS du tout', async () => {
    contexte = { ...contexte, biens: [] };
    await monter();
    expect(container.textContent).not.toContain('de l’automatisation');
    // …mais la recherche, elle, reste : c'est par elle qu'on rattachera.
    expect(container.textContent).toContain('Chercher un autre bien');
  });

  it('la pré-coche vient du moteur, et se décoche sans revenir', async () => {
    contexte = { ...contexte, biens: [propose('445', { recommande: true }), propose('446')] };
    await monter();
    expect(cases().map((c) => c.checked)).toEqual([true, false]);
    await cliquer(cases()[0]);
    expect(cases().map((c) => c.checked)).toEqual([false, false]);
  });
});

describe('🔴 ③b la recherche libre : des BIENS, et rien que des biens', () => {
  it('elle n’interroge pas avant deux caractères', async () => {
    await monter();
    await taper('v');
    expect(appels.filter((a) => a.url.includes('/biens?'))).toHaveLength(0);
  });

  it('elle passe la requête ET la date du mail — c’est elle qui décide qui est locataire', async () => {
    await monter();
    await taper('victor hugo');
    const r = appels.find((a) => a.url.includes('/biens?'));
    expect(r?.url).toContain('q=victor+hugo');
    expect(r?.url).toContain('date=2026-08-13');
  });

  it('chaque résultat est un BIEN, avec sa raison de correspondance en clair', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await taper('9 rue beta');
    const bloc = container.querySelector('.mrb-resultats');
    expect(bloc?.textContent).toContain('9 rue Beta, 92000 VILLE');
    expect(bloc?.textContent).toContain('lot 999');
    expect(bloc?.textContent).toContain('trouvé par adresse');
    expect(bloc?.textContent).toContain('BAILLEUR B');
    expect(bloc?.textContent).toContain('LOCATAIRE B');
  });

  it('🔴 un bien DÉJÀ PROPOSÉ n’est pas répété dans les résultats', async () => {
    resultats = { lignes: [trouve('445'), trouve('999')] };
    await monter();
    await taper('rue');
    const bloc = container.querySelector('.mrb-resultats');
    expect(bloc?.textContent).toContain('lot 999');
    expect(bloc?.textContent).not.toContain('lot 445');
  });

  it('🔴 aucun résultat ⇒ on DIT ce qu’on a cherché, jamais « aucun résultat » tout court', async () => {
    resultats = { lignes: [] };
    await monter();
    await taper('victor hugo');
    expect(container.textContent).toContain('Aucun bien trouvé pour « victor hugo »');
  });

  it('une liste tronquée est annoncée', async () => {
    resultats = { lignes: [trouve('999')], tronque: true };
    await monter();
    await taper('puteaux');
    expect(container.textContent).toContain('précisez votre recherche');
  });
});

describe('🔴 ③c une seule validation pour les DEUX zones', () => {
  it('rien n’est écrit tant qu’on n’a pas validé', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await cliquer(cases()[0]);
    await taper('rue');
    await cliquer(cases()[cases().length - 1]);
    expect(ecritures()).toEqual([]);
  });

  it('🔴 une proposition ET un résultat de recherche se valident ENSEMBLE', async () => {
    resultats = { lignes: [trouve('999')] };
    await monter();
    await cliquer(cases()[0]);            // la proposition 445
    await taper('rue');
    await cliquer(cases()[cases().length - 1]);   // le résultat 999
    await cliquer(boutonPar(/^Rattacher$/));

    const posts = ecritures().filter((a) => a.methode === 'POST');
    expect(posts).toHaveLength(2);
    const cles = posts.map((p) => (p.corps as { cible: { cle: string } }).cible.cle).sort();
    expect(cles).toEqual(['445', '999']);
    // 🔴 ET LA CIBLE EST TOUJOURS UN LOT : jamais une personne.
    expect(posts.every((p) => (p.corps as { cible: { sorte: string } }).cible.sorte === 'lot')).toBe(true);
  });

  it('sans rien de coché, « Rattacher » est INACTIF et le dit', async () => {
    await monter();
    expect(boutonPar(/^Rattacher$/)?.disabled).toBe(true);
    expect(container.textContent).toContain('Aucun bien coché');
  });

  it('la PORTÉE est le même choix qu’ailleurs, « ce mail » par défaut', async () => {
    await monter();
    const radios = [...container.querySelectorAll('input[name="mrb-portee"]')] as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);
  });

  it('🔴 « toute la conversation » DEMANDE au serveur les mails sans classement manuel', async () => {
    await monter();
    await cliquer(cases()[0]);
    const radios = [...container.querySelectorAll('input[name="mrb-portee"]')] as HTMLInputElement[];
    await cliquer(radios[1]);
    await cliquer(boutonPar(/^Rattacher$/));
    expect(appels.some((a) => a.url.includes('/classement?fil=101&portee=1'))).toBe(true);
    // Deux mails × un bien = deux rattachements.
    expect(ecritures().filter((a) => a.methode === 'POST')).toHaveLength(2);
  });

  it('« Hors gestion » reste accessible depuis le menu', async () => {
    const ouvert: string[] = [];
    await monter({ onHorsGestion: () => ouvert.push('ok') });
    await cliquer(boutonPar(/Hors gestion/));
    expect(ouvert).toEqual(['ok']);
  });
});
