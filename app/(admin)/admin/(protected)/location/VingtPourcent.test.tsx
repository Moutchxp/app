// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import type { SuiviVingtLu } from '../../../../lib/location/vingtPourcent';

/** 🔴 Arno (23/11/2026) — « 20 % à restituer » : l'écran (point 3) et ses accès (point 4), routes simulées : rien n'est écrit, rien ne part. */
const fiche = vi.fn();
vi.mock('../gestion/FicheCopropriete', () => ({
  FicheCopropriete: (p: { immeuble?: string | null; onFerme: () => void }) => { fiche(p); return createElement('button', { 'data-stub-fiche': p.immeuble ?? '', onClick: p.onFerme }, 'fermer'); },
}));
const { EcranVingtPourcent } = await import('./VingtPourcent');
const { BoutonVingtPourcent } = await import('./BoutonVingtPourcent');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LU: SuiviVingtLu = {
  aujourdhui: '2026-11-23',
  manquantes: [{ cle: 'copro-20', coproprieteId: 20, libelle: 'Copro B', immeuble: 'b', lotId: 2, manque: ['derniere_ago', 'arrete'], locataires: ['MARTIN Paul', 'MARTIN Léa'] }],
  lignes: [
    { sortieId: 5, lotId: 1, locataires: ['DUPONT Alice'], logement: '1 rue A, 92800 Puteaux', dateSortie: '2026-11-15', valideLe: '2026-11-20',
      copropriete: { id: 10, libelle: 'Copro A', aRattacher: false }, arrete: { jour: 31, mois: 12 },
      suivi: { etat: 'ok', exercice: '2026-12-31', ago: { date: '2027-03-25', statut: 'projetee' }, incertaine: false, limite: '2027-04-25', alerte: 'a_venir', joursRestants: 153 } },
    { sortieId: 7, lotId: 3, locataires: ['DURAND Léo'], logement: null, dateSortie: '2026-01-10', valideLe: '2026-01-12',
      copropriete: { id: 30, libelle: 'Copro C', aRattacher: false }, arrete: null,
      suivi: { etat: 'ok', exercice: null, ago: { date: '2026-09-22', statut: 'officielle' }, incertaine: true, limite: '2026-10-22', alerte: 'depassee', joursRestants: -32 } },
    { sortieId: 6, lotId: 2, locataires: ['MARTIN Paul', 'MARTIN Léa'], logement: '2 rue B', dateSortie: '2026-10-01', valideLe: '2026-10-02',
      copropriete: { id: 20, libelle: 'Copro B', aRattacher: false }, arrete: null, suivi: { etat: 'sans_ago', exercice: null, mention: 'Dernière AGO inconnue' } },
  ],
};
let container: HTMLDivElement; let root: Root; let lectures: string[]; let donnees: SuiviVingtLu;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); lectures = []; donnees = LU; fiche.mockClear();
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    expect(init?.method ?? 'GET').toBe('GET'); // LECTURE SEULE
    lectures.push(String(u));
    return { status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); };
const rendre = async (el: ReturnType<typeof createElement>) => { await act(async () => { root.render(el); }); await calmer(); };

describe('point 3 — l’écran « 20 % à restituer »', () => {
  it('lit la route qu’on lui donne ; « Dates manquantes » EN TÊTE : copropriété, ce qui manque, locataires, « Compléter la fiche Copropriété »', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis' }));
    expect(lectures[0]).toMatch(/^\/api\/admin\/gestion\/preavis\?vingtPourcent=1/);
    const blocs = [...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
    // 🔴 Arno (24/11/2026) — cinq catégories exclusives, dans cet ordre (« Dates manquantes » toujours en tête)
    expect(blocs).toEqual(['Dates manquantes', 'Urgence', 'AG passée — restitution à faire', 'À préparer', 'En attente', 'Restitutions faites', 'Alerte du lundi']);
    const m = container.querySelector('[data-vgp-manque="copro-20"]')!;
    expect(m.textContent).toContain('Copro B');
    expect(m.querySelector('[data-vgp-ce-qui-manque]')?.textContent).toBe('Manque : dernière AGO et date d’arrêté des comptes');
    expect(m.querySelector('[data-vgp-locataires]')?.textContent).toBe('2 locataires concernés : MARTIN Paul, MARTIN Léa');
  });
  it('« Compléter la fiche Copropriété » ouvre LA fenêtre de la fiche (même composant que l’annuaire) ; à sa fermeture, la liste se relit', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await act(async () => { (container.querySelector('[data-vgp-completer="copro-20"]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenCalledWith(expect.objectContaining({ immeuble: 'b' }));
    donnees = { ...LU, manquantes: [], lignes: [LU.lignes[0]] }; // la fiche complétée : plus rien ne manque
    await act(async () => { (container.querySelector('[data-stub-fiche]') as HTMLButtonElement).click(); });
    await calmer();
    expect(lectures).toHaveLength(2);
    expect(container.querySelector('[data-vgp-manquantes]')?.getAttribute('data-vgp-manquantes')).toBe('0');
    expect(container.querySelector('[data-vgp-manquantes-aucune]')).not.toBeNull();
  });
  it('chaque locataire : logement, copropriété, sortie, exercice, AGO qui compte (projetée / officielle, incertaine), limite, alerte EN MOTS', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const a = container.querySelector('[data-vgp-sortie="5"]')!;
    expect(a.textContent).toContain('1 rue A, 92800 Puteaux');
    expect(a.querySelector('[data-vgp-exercice]')?.textContent).toBe('Exercice clos le 31/12/2026 (arrêté au 31/12)');
    expect(a.querySelector('[data-vgp-ago]')?.textContent).toBe('25/03/2027 — date projetée');
    expect(a.querySelector('[data-vgp-limite]')?.textContent).toBe('25/04/2027');
    expect(a.querySelector('[data-vgp-alerte-texte]')?.textContent).toBe('À restituer au plus tard le 25/04/2027');
    const c = container.querySelector('[data-vgp-sortie="7"]')!;
    expect(c.getAttribute('data-vgp-alerte')).toBe('depassee');
    expect(c.querySelector('[data-vgp-ago]')?.textContent).toBe('22/09/2026 — date officielle · Projection incertaine — date d’arrêté des comptes manquante');
    expect(c.querySelector('[data-vgp-alerte-texte]')?.textContent).toBe('Restitution en retard — la limite du 22/10/2026 est dépassée de 32 jours');
    const b = container.querySelector('[data-vgp-sortie="6"]')!;
    expect(b.querySelector('[data-vgp-ago]')?.textContent).toBe('Dernière AGO inconnue');
    expect(b.querySelector('[data-vgp-limite]')?.textContent).toBe('—');
    expect(b.querySelector('[data-vgp-alerte-texte]')?.textContent).toBe('Pas de date limite — Dernière AGO inconnue : à compléter dans la fiche Copropriété.');
  });
});

describe('point 4 — les accès : colonne de gauche de la Gestion et accueil Location avec pastille', () => {
  it('la pastille ROUGE dit le nombre de copropriétés à compléter ; le bouton ouvre la pleine page', async () => {
    await rendre(createElement(BoutonVingtPourcent));
    const b = container.querySelector('a[data-bouton-vingt-pourcent]')!;
    expect(b.getAttribute('href')).toBe('/admin/location/vingt-pourcent');
    expect(b.querySelector('[data-pastille-vingt-pourcent]')?.textContent).toBe('1');
    expect(lectures[0]).toMatch(/^\/api\/admin\/location\?vingtPourcent=1/);
  });
  it('AUCUNE pastille à 0', async () => {
    donnees = { ...LU, manquantes: [] };
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('a[data-bouton-vingt-pourcent]')).not.toBeNull();
    expect(container.querySelector('[data-pastille-vingt-pourcent]')).toBeNull();
  });
  it('accueil Location : le bouton est dans la zone « actions » de la ligne de titre, rien d’autre ne change', () => {
    const page = readFileSync('app/(admin)/admin/(protected)/location/page.tsx', 'utf8');
    expect(page).toContain('<EnTetePage titre="Location" intro={INTRO_LOCATION} {...(autorise ? { actions: <BoutonVingtPourcent /> } : {})} />');
    expect(page).toContain('<AccueilLocation gestion={gestion} />');
    expect(readFileSync('app/(admin)/admin/(protected)/location/vingt-pourcent/page.tsx', 'utf8')).toContain('<PageVingtPourcent />');
  });
  it('colonne de gauche de la Gestion : « 20 % à restituer » JUSTE SOUS « Préavis », avant « Syndics » ; l’ordre des autres est gardé', () => {
    const s = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    const i = (x: string) => s.indexOf(x);
    expect(i('data-raccourci="taches"')).toBeLessThan(i('data-raccourci="preavis"'));
    expect(i('data-raccourci="preavis"')).toBeLessThan(i('data-raccourci="vingt-pourcent"'));
    expect(i('data-raccourci="vingt-pourcent"')).toBeLessThan(i('{onSyndics && ('));
    const g = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(g).toContain("onVingtPourcent={() => { setPanneau(null); aller({ ...ETAT_DEFAUT, ecran: 'vingt_pourcent' }); }}");
    expect(g).toContain('<EcranVingtPourcent api={API_PREAVIS_GESTION}');
  });
});

describe('🔴 Arno (23/11/2026) — « Bien sans copropriété » dans « Dates manquantes » (compté dans la pastille)', () => {
  it('l’étiquette « Bien sans copropriété », le lien pour créer la fiche ; la pastille le compte', async () => {
    donnees = { ...LU, manquantes: [...LU.manquantes, { cle: 'immeuble-c', coproprieteId: null, libelle: '9 rue C', immeuble: 'c', lotId: 9, manque: ['arrete'], locataires: ['SANS Copro'] }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const m = container.querySelector('[data-vgp-manque="immeuble-c"]')!;
    expect(m.querySelector('[data-vgp-bien-sans-copro]')?.textContent).toBe('Bien sans copropriété');
    expect(m.querySelector('[data-vgp-completer]')).not.toBeNull();
    act(() => root.unmount()); root = createRoot(container);
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-pourcent]')?.textContent).toBe('2');
  });
});

/** 🔴🔴 Arno (24/11/2026) — les catégories exclusives : un locataire = une catégorie ; titre + compteur, repliable ; jours restants. */
describe('🔴🔴 Arno (24/11/2026) — les cinq catégories de l’écran', () => {
  const ligne = (sortieId: number, ago: string, limite: string, joursRestants: number, statut: 'officielle' | 'projetee' = 'projetee') => ({
    sortieId, lotId: sortieId, locataires: [`LOC ${sortieId}`], logement: `${sortieId} rue Test`, dateSortie: '2026-01-15', valideLe: '2026-01-20',
    copropriete: { id: 50, libelle: 'Copro OK', aRattacher: false }, arrete: { jour: 31, mois: 12 }, cleCopro: 'copro-50',
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: ago, statut }, incertaine: false, limite, alerte: 'a_venir' as const, joursRestants } });
  it('chaque ligne dans UNE catégorie, compteurs, « Date limite dépassée de N jours » en rouge ; « Dates manquantes » garde la ligne complète sous sa copropriété', async () => {
    donnees = { ...LU, lignes: [...LU.lignes,
      ligne(11, '2026-09-01', '2026-10-01', -53), // urgence
      ligne(12, '2026-11-10', '2026-12-10', 16), // AG passée
      ligne(13, '2026-12-10', '2027-01-10', 47, 'projetee'), // à préparer (AG dans 16 jours)
      ligne(14, '2027-09-01', '2027-10-01', 311, 'officielle'), // à préparer (officielle lointaine)
    ] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const dans = (cat: string) => [...container.querySelectorAll(`[data-vgp-categorie="${cat}"] [data-vgp-sortie]`)].map((x) => Number(x.getAttribute('data-vgp-sortie')));
    expect(dans('urgence')).toEqual([11]);
    expect(dans('ag_passee')).toEqual([12]);
    expect(dans('a_preparer')).toEqual([13, 14]);
    expect(dans('en_attente')).toEqual([5]);
    expect(dans('manquantes').sort()).toEqual([6, 7]);
    // un locataire n'apparaît qu'une fois sur tout l'écran
    expect(container.querySelectorAll('[data-vgp-sortie="7"]')).toHaveLength(1);
    expect([...container.querySelectorAll('[data-vgp-categorie] > details > summary [data-vgp-compteur]')].map((x) => x.textContent)).toEqual(['2', '1', '1', '2', '1']);
    expect(container.querySelectorAll('[data-vgp-categorie] > details[open]')).toHaveLength(5);
    const u = container.querySelector('[data-vgp-sortie="11"] [data-vgp-jours]')!;
    expect([u.textContent, u.className]).toEqual(['Date limite dépassée de 53 jours', 'vgp-depasse']);
    expect(container.querySelector('[data-vgp-sortie="12"] [data-vgp-jours]')?.textContent).toBe('Dans 16 jours');
    // la ligne de DURAND Léo (arrêté manquant, date provisoire dépassée) reste lisible sous sa copropriété, rien n'est masqué
    const d = container.querySelector('[data-vgp-categorie="manquantes"] [data-vgp-sortie="7"]')!;
    expect(d.querySelector('[data-vgp-jours]')?.textContent).toBe('Date limite dépassée de 32 jours');
  });
});

/** 🔴🔴 Arno (24/11/2026) — « Restitution faite » (fenêtre, POST vers la route de la Location) et « Restitutions faites (N) » repliée, avec « Annuler ». */
describe('🔴🔴 Arno (24/11/2026) — « Restitution faite » et « Restitutions faites »', () => {
  let posts: Record<string, unknown>[];
  beforeEach(() => {
    posts = [];
    donnees = { ...LU, restitutionDisponible: true, faites: [{ id: 9, sortieId: 3, locataires: ['FAIT Jean'], logement: '3 rue F', dateSortie: '2026-01-01', date: '2026-11-02',
      montantRestitue: 312.5, montantRetenuCharges: 40, commentaire: 'Virement _TEST', par: 'Arno Test', le: '2026-11-02 10:15' }] };
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') { posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>); return { status: 200, json: async () => ({ etat: 'ok', data: { id: 1 } }) } as Response; }
      lectures.push(String(u));
      return { status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as Response;
    }) as unknown as typeof fetch;
  });
  const saisir = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  it('chaque ligne a « Restitution faite » ; la fenêtre vérifie la saisie, puis envoie à la route de la Location ; la liste se relit', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis' }));
    expect(container.querySelectorAll('[data-vgp-restituer]')).toHaveLength(3);
    await act(async () => { (container.querySelector('[data-vgp-restituer="5"]') as HTMLButtonElement).click(); });
    const f = container.querySelector('[data-fenetre-restitution="5"]')!;
    expect((f.querySelector('[data-restitution-date]') as HTMLInputElement).value).toBe('2026-11-23');
    // montant manquant : refus à l'écran, rien n'est envoyé
    await act(async () => { (f.querySelector('[data-restitution-enregistrer]') as HTMLButtonElement).click(); });
    expect(f.querySelector('[data-restitution-refus]')?.textContent).toContain('Indiquez le montant restitué');
    expect(posts).toEqual([]);
    await act(async () => { saisir(f.querySelector('[data-restitution-montant]') as HTMLInputElement, '312,50'); });
    await act(async () => { saisir(f.querySelector('[data-restitution-commentaire]') as HTMLTextAreaElement, 'Virement _TEST'); });
    await act(async () => { (f.querySelector('[data-restitution-enregistrer]') as HTMLButtonElement).click(); }); await calmer();
    expect(posts).toEqual([{ action: 'restitution-20-faite', sortieId: 5, date: '2026-11-23', montantRestitue: '312,50', montantRetenuCharges: '', commentaire: 'Virement _TEST' }]);
    expect((global.fetch as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls.find(([, i]) => i?.method === 'POST')?.[0]).toBe('/api/admin/location');
    expect(container.querySelector('[data-fenetre-restitution]')).toBeNull();
    expect(lectures).toHaveLength(2);
  });
  it('« Restitutions faites (1) » repliée en bas de page : la restitution, puis « Annuler » → confirmation → POST d’annulation', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const blocs = [...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
    expect(blocs.slice(-2)).toEqual(['Restitutions faites', 'Alerte du lundi']);
    const d = container.querySelector('[data-vgp-faites] > details') as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(d.querySelector('summary')?.textContent).toBe('Restitutions faites (1)');
    expect(d.querySelector('[data-vgp-faite-montant]')?.textContent).toBe('312,50 €');
    expect(d.querySelector('[data-vgp-faite-retenu]')?.textContent).toBe('40,00 €');
    await act(async () => { (d.querySelector('[data-vgp-annuler="9"]') as HTMLButtonElement).click(); });
    expect(posts).toEqual([]);
    await act(async () => { (d.querySelector('[data-vgp-annuler-oui="9"]') as HTMLButtonElement).click(); }); await calmer();
    expect(posts).toEqual([{ action: 'restitution-20-annuler', restitutionId: 9 }]);
    expect(lectures).toHaveLength(2);
  });
});

/** 🔴 Arno (24/11/2026) — le MODE ESSAI de l'alerte du lundi : une LECTURE (GET), le mail tel qu'il partirait, rien n'est envoyé. */
describe('🔴 Arno (24/11/2026) — « Alerte du lundi » : le mode essai', () => {
  it('« Voir le mail tel qu’il partirait » lit la route de l’écran (GET ?alerteVingtEssai=1) et montre l’objet et le texte ; aucun envoi', async () => {
    const methodes: string[] = [];
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      methodes.push(init?.method ?? 'GET'); lectures.push(String(u));
      if (String(u).includes('alerteVingtEssai=1')) return { status: 200, json: async () => ({ etat: 'ok', data: { etat: 'essai', mail: { a: ['gestion@exemple.test'], objet: '[Urgent] 20 % à restituer — 1 locataire', texte: 'Bonjour,\n\n- LOC 1', nombre: 1 } } }) } as Response;
      return { status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as Response;
    }) as unknown as typeof fetch;
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis' }));
    await act(async () => { (container.querySelector('[data-vgp-alerte-essai]') as HTMLButtonElement).click(); }); await calmer();
    expect(lectures.at(-1)).toBe('/api/admin/gestion/preavis?alerteVingtEssai=1');
    expect(methodes.every((m) => m === 'GET')).toBe(true);
    expect(container.querySelector('[data-vgp-alerte-objet]')?.textContent).toBe('[Urgent] 20 % à restituer — 1 locataire');
    expect(container.querySelector('[data-vgp-alerte-texte-mail]')?.textContent).toContain('- LOC 1');
  });
});
