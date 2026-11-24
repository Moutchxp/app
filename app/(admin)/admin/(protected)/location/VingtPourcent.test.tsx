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
    // 🔴 (Arno, 24/11/2026, 23h40) un bloc de trois lignes : l'immeuble, les locataires concernés, ce qui manque (orange)
    expect(m.querySelector('[data-vgp-ce-qui-manque]')?.textContent).toBe('Manque : dernière AGO et arrêté des comptes');
    expect(m.querySelector('[data-vgp-locataires]')?.textContent).toBe('MARTIN Paul, MARTIN Léa');
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
    // 🔴 (Arno, 24/11/2026, 23h16) deux lignes + détail : l'arrêté a sa rubrique dans le détail ; l'AGO est sur la ligne, en court
    expect(a.querySelector('[data-vgp-exercice]')?.textContent).toBe('Exercice clos le 31/12/2026');
    expect(a.querySelector('[data-vgp-arrete]')?.textContent).toBe('31/12');
    expect(a.querySelector('[data-vgp-ago]')?.textContent).toBe('AGO vers mars 2027 (projetée)');
    // 🔴 (Arno, 24/11/2026, 23h40) la date limite et son compte à rebours sur la 3e ligne ; le détail ne les répète plus
    expect(a.querySelector('[data-vgp-limite]')?.textContent).toBe('Restitution au plus tard le 25/04/2027 AG dans 122 jours');
    expect(a.querySelector('[data-vgp-alerte-texte]')).toBeNull();
    const c = container.querySelector('[data-vgp-sortie="7"]')!;
    expect(c.getAttribute('data-vgp-alerte')).toBe('depassee');
    expect(c.querySelector('[data-vgp-ago]')?.textContent).toBe('AGO 22/09/2026 (officielle)');
    expect(c.querySelector('[data-vgp-incertaine]')?.textContent).toBe('date provisoire — arrêté manquant');
    expect(c.querySelector('[data-vgp-limite]')?.textContent).toBe('Restitution au plus tard le 22/10/2026 Dépassé de 32 jours');
    // sans date : la sortie 6 n'a de ligne que dans le détail du bloc de sa copropriété (« Dates manquantes »)
    expect(container.querySelector('[data-vgp-sortie="6"]')).toBeNull();
    expect(container.querySelector('[data-vgp-concerne="6"]')?.textContent).toContain('Sans date');
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
    // 🔴 (Arno, 24/11/2026, 23h20) DURAND Léo (7) : arrêté manquant, date PROVISOIRE dépassée → « Urgence », avec la mention orange
    expect(dans('urgence')).toEqual([11, 7]); // par date limite : 01/10 puis 22/10
    expect(dans('ag_passee')).toEqual([12]);
    expect(dans('a_preparer')).toEqual([13, 14]);
    expect(dans('en_attente')).toEqual([5]);
    expect([...container.querySelectorAll('[data-vgp-categorie="manquantes"] [data-vgp-concerne]')].map((x) => [x.getAttribute('data-vgp-concerne'), x.getAttribute('data-vgp-concerne-categorie')]))
      .toEqual([['6', 'manquantes']]); // Copro B (6, sans date) ; Copro C n'est pas dans les copropriétés lues ici (épreuve dédiée plus bas)
    // un locataire n'apparaît qu'une fois sur tout l'écran
    expect(container.querySelectorAll('[data-vgp-sortie="7"]')).toHaveLength(1);
    // « Dates manquantes » compte les COPROPRIÉTÉS à compléter (la pastille) : Copro B, et Copro C (celle de DURAND Léo) via sa carte
    expect([...container.querySelectorAll('[data-vgp-categorie] > details > summary [data-vgp-compteur]')].map((x) => x.textContent)).toEqual(['1', '2', '1', '2', '1']);
    expect(container.querySelectorAll('[data-vgp-categorie] > details[open]')).toHaveLength(5);
    const u = container.querySelector('[data-vgp-sortie="11"] [data-vgp-rebours]')!;
    expect([u.textContent, u.className]).toEqual(['Dépassé de 53 jours', 'vgp-rebours vgp-rebours--rouge']);
    expect(container.querySelector('[data-vgp-sortie="12"] [data-vgp-rebours]')?.textContent).toBe('J-16');
    const d = container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-sortie="7"]')!;
    expect(d.querySelector('[data-vgp-rebours]')?.textContent).toBe('Dépassé de 32 jours');
    expect(d.querySelector('[data-vgp-incertaine]')?.textContent).toBe('date provisoire — arrêté manquant');
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
    expect(container.querySelectorAll('[data-vgp-restituer]')).toHaveLength(2); // les lignes datées
    expect(container.querySelectorAll('[data-vgp-restituer-concerne]')).toHaveLength(1); // et, dans « Dates manquantes », chaque locataire concerné
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

/** 🔴🔴 Arno (24/11/2026) — la seconde pastille : les locataires en « Urgence », rouge vif ; la première (copropriétés à compléter) est gardée. */
describe('🔴🔴 Arno (24/11/2026) — la pastille « Urgence » (accueil Location et colonne de gauche de la Gestion)', () => {
  const urgence = { sortieId: 21, lotId: 21, locataires: ['URG Ent'], logement: null, dateSortie: '2026-03-01', valideLe: '2026-03-03',
    copropriete: { id: 60, libelle: 'Copro U', aRattacher: false }, arrete: { jour: 30, mois: 6 }, cleCopro: 'copro-60',
    suivi: { etat: 'ok' as const, exercice: '2026-06-30', ago: { date: '2026-09-15', statut: 'officielle' as const }, incertaine: false, limite: '2026-10-15', alerte: 'depassee' as const, joursRestants: -39 } };
  it('accueil Location : la pastille des copropriétés reste (1), la pastille « Urgence » s’ajoute (rouge vif) ; aucune à 0', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, urgence, { ...urgence, sortieId: 22 }] };
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-pourcent]')?.textContent).toBe('1');
    const u = container.querySelector('[data-pastille-vingt-urgence]')!;
    // les deux ajoutées + DURAND Léo (date provisoire dépassée, décision du 24/11 23h20)
    expect([u.textContent, u.className]).toEqual(['3', 'bvp-pastille bvp-pastille--urgence']);
    expect(container.querySelector('a[data-bouton-vingt-pourcent]')?.getAttribute('aria-label')).toBe('20 % à restituer — 3 locataires en urgence — 1 copropriété en attente de données');
    act(() => root.unmount()); root = createRoot(container);
    donnees = { ...LU, lignes: LU.lignes.filter((l) => l.sortieId !== 7) }; // personne en urgence
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-urgence]')).toBeNull();
    expect(container.querySelector('[data-pastille-vingt-pourcent]')?.textContent).toBe('1');
  });
  it('colonne de gauche de la Gestion : les deux pastilles sur « 20 % à restituer », lues sur la route de la Gestion ; le reste inchangé', () => {
    const g = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(g).toContain('const pastillesVingt = usePastillesVingt(API_PREAVIS_GESTION);');
    expect(g).toContain('vingtCopros={pastillesVingt.copros}');
    expect(g).toContain('vingtUrgences={pastillesVingt.urgences}');
    const s = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    const entree = s.slice(s.indexOf('data-raccourci="vingt-pourcent"'), s.indexOf('{onSyndics && ('));
    expect(entree).toContain('data-pastille-vingt-copros');
    expect(entree).toContain('className="cm-pastille-jour cm-pastille-vif" data-pastille-vingt-urgence');
    expect(readFileSync('app/globals.css', 'utf8').match(/--color-svv-rouge-vif:/g)).toHaveLength(3); // clair, sombre, système
  });
});

/**
 * 🔴🔴 Arno (24/11/2026, 23h16) — « chaque bloc de locataire est trop important : le limiter à deux lignes qui se déploient à la demande. Jamais
 * d'information en doublon. » Ligne repliée : adresse, nom(s) ; à droite l'AGO (ou ce qui manque), « Fiche copropriété », « Restitution faite ».
 */
describe('🔴🔴 Arno (24/11/2026, 23h16) — deux lignes qui se déploient', () => {
  const ligne = (id: number) => container.querySelector(`[data-vgp-sortie="${id}"]`)!;
  it('repliée par défaut : adresse puis noms à gauche ; à droite l’AGO, « Fiche copropriété », « Restitution faite » ; le détail caché', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const a = ligne(5);
    expect([a.querySelector('[data-vgp-adresse]')?.textContent, a.querySelector('[data-vgp-noms]')?.textContent]).toEqual(['1 rue A, 92800 Puteaux', 'DUPONT Alice']);
    expect([...a.querySelectorAll('.vgp-ligne-droite button')].map((x) => x.textContent)).toEqual(['Fiche copropriété', 'Faire restitution']);
    expect((a.querySelector('[data-vgp-detail]') as HTMLElement).hidden).toBe(true);
    // une ligne par sortie, colocataires ensemble
    expect(container.querySelector('[data-vgp-manque="copro-20"] [data-vgp-noms]')?.textContent).toBe('MARTIN Paul, MARTIN Léa'); // colocataires : une ligne
  });
  it('un clic sur la ligne (hors boutons) déplie / replie ; un clic sur un bouton ne déplie pas ; le détail ne répète RIEN de la ligne', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const a = ligne(5);
    await act(async () => { (a.querySelector('[data-vgp-adresse]') as HTMLElement).click(); });
    expect((a.querySelector('[data-vgp-detail]') as HTMLElement).hidden).toBe(false);
    expect(a.querySelector('[data-vgp-deplier]')?.getAttribute('aria-expanded')).toBe('true');
    const detail = a.querySelector('[data-vgp-detail]')!.textContent ?? '';
    for (const deja of ['1 rue A, 92800 Puteaux', 'DUPONT Alice', 'AGO vers mars 2027']) expect(detail).not.toContain(deja);
    // 🔴 (Arno, 24/11/2026, 23h40) ni la date limite ni les jours restants : ils sont sur la ligne
    expect([...a.querySelectorAll('[data-vgp-detail] dt')].map((x) => x.textContent)).toEqual(['Copropriété', 'Date de sortie', 'Exercice concerné', 'Arrêté des comptes', 'Dernière AGO']);
    expect(detail).not.toContain('25/04/2027');
    await act(async () => { (a.querySelector('[data-vgp-adresse]') as HTMLElement).click(); });
    expect((a.querySelector('[data-vgp-detail]') as HTMLElement).hidden).toBe(true);
    await act(async () => { (a.querySelector('[data-vgp-restituer]') as HTMLElement).click(); });
    expect((a.querySelector('[data-vgp-detail]') as HTMLElement).hidden).toBe(true);
    expect(container.querySelector('[data-fenetre-restitution="5"]')).not.toBeNull(); // la modale, inchangée
  });
  it('« Fiche copropriété » ouvre LA fiche par l’immeuble (ou par le bien sans copropriété : « Créer la copropriété ») ; à sa fermeture tout se relit', async () => {
    donnees = { ...LU, lignes: [{ ...LU.lignes[0], immeuble: 'copro a' }, { ...LU.lignes[1], copropriete: null, immeuble: null, cleCopro: 'lot-3' }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(ligne(7).querySelector('[data-vgp-fiche]')?.textContent).toBe('Créer la copropriété');
    expect(ligne(7).querySelector('[data-vgp-manque-ligne]')).toBeNull(); // une date provisoire existe : elle est montrée
    await act(async () => { (ligne(5).querySelector('[data-vgp-fiche]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenLastCalledWith(expect.objectContaining({ immeuble: 'copro a', lotId: null }));
    await act(async () => { (container.querySelector('[data-stub-fiche]') as HTMLButtonElement).click(); }); await calmer();
    expect(lectures).toHaveLength(2);
    await act(async () => { (ligne(7).querySelector('[data-vgp-fiche]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenLastCalledWith(expect.objectContaining({ immeuble: null, lotId: 3 }));
  });
});

/**
 * 🔴🔴 Arno (24/11/2026, 23h40) — « Dates manquantes » : « réduire sur 3 lignes le bloc principal, déployable comme les autres ; tous les blocs
 * principaux doivent avoir la même taille ». UN bloc par copropriété à compléter ; déplié, chaque locataire concerné avec « Restitution faite ».
 */
describe('🔴🔴 Arno (24/11/2026, 23h40) — « Dates manquantes » : un bloc de trois lignes par copropriété', () => {
  const bloc = (cle: string) => container.querySelector(`[data-vgp-manque="${cle}"]`)!;
  it('TOUTES les copropriétés de la pastille, même celles dont les locataires ont une date provisoire ; trois lignes, un seul bouton, même hauteur', async () => {
    donnees = { ...LU, manquantes: [...LU.manquantes, { cle: 'copro-30', coproprieteId: 30, libelle: '3 rue C', immeuble: 'c', lotId: 3, manque: ['arrete'], locataires: ['DURAND Léo'] }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect([...container.querySelectorAll('[data-vgp-manque]')].map((x) => x.getAttribute('data-vgp-manque'))).toEqual(['copro-30', 'copro-20']); // sortie la plus ancienne d'abord
    const c = bloc('copro-30');
    expect([...c.querySelectorAll('.vgp-ligne-gauche > p')].map((x) => x.textContent)).toEqual(['3 rue C', 'DURAND Léo', 'Manque : arrêté des comptes']);
    expect([...c.querySelectorAll('.vgp-ligne-tete button')].map((x) => x.textContent)).toEqual(['▸', 'Fiche copropriété']); // un seul bouton (plus de doublon)
    expect(c.querySelector('.vgp-ligne-tete')?.className).toBe('vgp-ligne-tete'); // la même tête (même hauteur) que les autres lignes
    expect(container.querySelector('[data-vgp-categorie="manquantes"] [data-vgp-compteur]')?.textContent).toBe('2');
  });
  it('déplié : une ligne par locataire concerné (nom, logement, date de sortie, catégorie s’il a une date provisoire), chacune avec « Restitution faite »', async () => {
    donnees = { ...LU, manquantes: [...LU.manquantes, { cle: 'copro-30', coproprieteId: 30, libelle: '3 rue C', immeuble: 'c', lotId: 3, manque: ['arrete'], locataires: ['DURAND Léo'] }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const c = bloc('copro-30');
    expect((c.querySelector('[data-vgp-detail]') as HTMLElement).hidden).toBe(true);
    await act(async () => { (c.querySelector('[data-vgp-adresse]') as HTMLElement).click(); });
    expect((c.querySelector('[data-vgp-detail]') as HTMLElement).hidden).toBe(false);
    // 🔴 (23h53) ni le nom (seul locataire du bloc : déjà sur la 2e ligne) ; le logement « Bien 3 » n'est pas l'adresse « 3 rue C » du bloc : il reste
    expect(c.querySelector('[data-vgp-concerne="7"]')?.textContent).toBe('Bien 3 — Sortie le 10/01/2026 — Date provisoire → UrgenceFaire restitution');
    await act(async () => { (c.querySelector('[data-vgp-restituer-concerne="7"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-fenetre-restitution="7"]')).not.toBeNull();
    // « Fiche copropriété » ouvre la fiche, comme « Compléter la fiche Copropriété » avant
    await act(async () => { (c.querySelector('[data-vgp-completer="copro-30"]') as HTMLButtonElement).click(); });
    expect(fiche).toHaveBeenLastCalledWith(expect.objectContaining({ immeuble: 'c' }));
  });
  it('un bien sans copropriété : « Bien sans copropriété » + « Aucune copropriété » en orange, et « Créer la copropriété »', async () => {
    donnees = { ...LU, manquantes: [{ cle: 'immeuble-c', coproprieteId: null, libelle: '9 rue C', immeuble: 'c', lotId: 9, manque: ['arrete'], locataires: ['SANS Copro'] }], lignes: [] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const c = bloc('immeuble-c');
    expect(c.querySelector('[data-vgp-ce-qui-manque]')?.textContent).toBe('Bien sans copropriété Aucune copropriété');
    expect(c.querySelector('[data-vgp-completer]')?.textContent).toBe('Créer la copropriété');
  });
});

/** 🔴🔴 Arno (24/11/2026, 23h40) — la ligne repliée sur TROIS lignes : étiquette d'AG colorée, compte à rebours avant / pendant / après. */
describe('🔴🔴 Arno (24/11/2026, 23h40) — trois lignes, étiquette colorée, compte à rebours', () => {
  it('trois lignes à gauche (adresse, noms, date limite + compte à rebours), chacune sur UNE ligne ; à droite l’étiquette puis les boutons', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const a = container.querySelector('[data-vgp-sortie="5"]')!;
    expect([...a.querySelectorAll('.vgp-ligne-gauche > p')].map((x) => x.textContent)).toEqual(['1 rue A, 92800 Puteaux', 'DUPONT Alice', 'Restitution au plus tard le 25/04/2027 AG dans 122 jours']);
    // 3e ligne : la date cède de la place (une ligne, points de suspension), le compte à rebours JAMAIS
    expect(a.querySelector('[data-vgp-limite] .vgp-limite-texte')?.className).toBe('vgp-limite-texte vgp-une-ligne');
    expect(a.querySelector('[data-vgp-limite] [data-vgp-rebours]')?.className).toBe('vgp-rebours vgp-rebours--gris');
    const e = a.querySelector('[data-vgp-ago]')!;
    expect(e.className).toBe('vgp-etiquette vgp-etiquette--rouge');
    expect(container.querySelector('[data-vgp-sortie="7"] [data-vgp-ago]')?.className).toBe('vgp-etiquette vgp-etiquette--vert');
    // même hauteur : la place de la mention est gardée même vide
    expect(a.querySelector('.vgp-ligne-ago .vgp-incertaine')?.getAttribute('aria-hidden')).toBe('true');
    expect(readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8')).toContain('.vgp-ligne-tete{display:flex;align-items:center;gap:10px;cursor:pointer;min-width:0;height:92px;');
  });
});

/** 🔴 Arno (24/11/2026, 23h40) — 390 px : « les 3 lignes de gauche en haut, l'étiquette AG puis les boutons pleine largeur dessous ; même hauteur entre blocs d'une même catégorie ». */
describe('🔴 Arno (24/11/2026, 23h40) — 390 px', () => {
  it('la règle du téléphone : tête en colonne (gauche, puis étiquette, puis boutons pleine largeur), hauteurs réservées, compte à rebours jamais tronqué', () => {
    const css = readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8');
    const mobile = css.slice(css.indexOf('@media (max-width:640px){ .vgp-ligne-tete'));
    expect(mobile).toContain('.vgp-ligne-tete{flex-wrap:wrap;height:auto;align-items:flex-start}');
    expect(mobile).toContain('.vgp-ligne-droite{flex:1 1 100%;max-width:none;justify-content:stretch;flex-direction:column;align-items:stretch;gap:6px}');
    expect(mobile).toContain('.vgp-ligne-boutons{flex-direction:column} .vgp-ligne-boutons .gst-btn{width:100%}');
    expect(mobile).toContain('-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3;min-height:2.6em}');
    expect(css).toContain('.vgp-rebours{font-weight:800;flex:0 0 auto}');
    expect(mobile).toContain('.vgp-ligne-gauche > .vgp-ligne-limite{flex-wrap:wrap;white-space:normal;line-height:1.3;height:2.6em;overflow:hidden;row-gap:0}');
  });
});

/** 🔴 Arno (24/11/2026, 23h53) — « Restitution faite » devient « Faire restitution » partout ; la modale et la section « Restitutions faites » gardent leurs mots. */
describe('🔴 Arno (24/11/2026, 23h53) — « Faire restitution »', () => {
  it('lignes et « Dates manquantes » : « Faire restitution » ; plus aucun bouton « Restitution faite » ; la modale garde son titre, la section le sien', async () => {
    donnees = { ...LU, faites: [] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const boutons = [...container.querySelectorAll('button')].map((b) => b.textContent);
    expect(boutons.filter((t) => t === 'Faire restitution').length).toBe(container.querySelectorAll('[data-vgp-restituer],[data-vgp-restituer-concerne]').length);
    expect(boutons).not.toContain('Restitution faite');
    await act(async () => { (container.querySelector('[data-vgp-restituer="5"]') as HTMLButtonElement).click(); });
    expect(container.querySelector('[data-fenetre-restitution="5"] h2')?.textContent).toBe('Restitution faite — DUPONT Alice');
    expect(container.querySelector('[data-vgp-faites] summary')?.textContent).toBe('Restitutions faites (0)');
  });
});

/** 🔴🔴 Arno (24/11/2026, 23h53) — « Il y a toujours des doublons d'information » : rien de ce qui est sur les lignes ne se répète dans le détail. */
describe('🔴🔴 Arno (24/11/2026, 23h53) — aucun doublon', () => {
  const MANQ = { cle: 'copro-40', coproprieteId: 40, libelle: '4 rue D', immeuble: '4 rue d', lotId: 40, manque: ['arrete' as const], locataires: ['UN Seul', 'DEUX Autre'] };
  const L = (id: number, noms: string[], logement: string) => ({ ...LU.lignes[2], sortieId: id, lotId: id, locataires: noms, logement, cleCopro: 'copro-40',
    copropriete: { id: 40, libelle: '4 rue D', aRattacher: false } });
  it('« Dates manquantes » : un seul locataire concerné → ni nom ni adresse dans le détail ; statut court « Sans date »', async () => {
    donnees = { ...LU, manquantes: [{ ...MANQ, locataires: ['UN Seul'] }], lignes: [L(41, ['UN Seul'], '4 rue D, 75011 Paris')] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const r = container.querySelector('[data-vgp-concerne="41"]')!;
    expect(r.querySelector('[data-vgp-concerne-nom]')).toBeNull();
    expect(r.textContent).toBe('Sortie le 01/10/2026 — Sans dateFaire restitution');
  });
  it('plusieurs locataires dans le bloc : le nom de chacun (pour les distinguer), jamais l’adresse déjà dite', async () => {
    donnees = { ...LU, manquantes: [MANQ], lignes: [L(41, ['UN Seul'], '4 rue D, 75011 Paris'), L(42, ['DEUX Autre'], '4 Rue D, 75011 PARIS')] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect([...container.querySelectorAll('[data-vgp-concerne]')].map((r) => r.textContent)).toEqual([
      'UN Seul — Sortie le 01/10/2026 — Sans dateFaire restitution', 'DEUX Autre — Sortie le 01/10/2026 — Sans dateFaire restitution']);
  });
  it('« N copropriétés à compléter » retiré (la pastille de la rubrique le dit) ; l’aide reste', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-coproprietes-a-completer]')).toBeNull();
    expect(container.querySelector('[data-vgp-categorie="manquantes"]')?.textContent).toContain('complétez leur fiche pour un suivi complet et fiable');
  });
  it('lignes datées : le détail ne répète ni l’adresse, ni les noms, ni l’AG, ni la date limite ; la copropriété seulement si ce n’est pas l’adresse de la ligne', async () => {
    donnees = { ...LU, lignes: [{ ...LU.lignes[0], copropriete: { id: 10, libelle: '1 rue A', aRattacher: false } }, LU.lignes[1]] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    for (const id of [5, 7]) {
      const li = container.querySelector(`[data-vgp-sortie="${id}"]`)!;
      const tete = li.querySelector('.vgp-ligne-tete')!; const detail = li.querySelector('[data-vgp-detail]')!.textContent ?? '';
      for (const p of [...tete.querySelectorAll('[data-vgp-adresse],[data-vgp-noms],[data-vgp-ago]')].map((x) => x.textContent ?? '')) expect(detail).not.toContain(p);
      expect(detail).not.toContain(li.querySelector('[data-vgp-limite]')?.getAttribute('data-vgp-limite')?.split('-').reverse().join('/'));
    }
    expect(container.querySelector('[data-vgp-sortie="5"] [data-vgp-copropriete]')).toBeNull(); // « 1 rue A » = l'adresse de la ligne
    expect(container.querySelector('[data-vgp-sortie="7"] [data-vgp-copropriete]')?.textContent).toBe('Copro C'); // un vrai nom : gardé
  });
});

/** 🔴🔴 Arno (24/11/2026, 23h53) — dans le détail déplié, « Locataire(s) » et « Propriétaire(s) » : « Prénom NOM · e-mail · téléphone », compact, cliquable. */
describe('🔴🔴 Arno (24/11/2026, 23h53) — les coordonnées dans le détail', () => {
  const CONTACTS = { locataires: [{ nom: 'Alice DUPONT', email: 'alice@exemple.test', telephone: { affiche: '06 12 34 56 78', lien: 'tel:+33612345678' } }],
    proprietaires: [{ nom: 'Jean DURAND', email: null, telephone: null }, { nom: 'SCI Les Tilleuls', email: 'sci@exemple.test', telephone: null }] };
  it('ligne datée : deux rubriques, une ligne par personne, « — » si absent, e-mail « mailto: », téléphone « tel: »', async () => {
    donnees = { ...LU, lignes: [{ ...LU.lignes[0], contacts: CONTACTS }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const d = container.querySelector('[data-vgp-sortie="5"] [data-vgp-detail]')!;
    expect(d.querySelector('[data-vgp-coordonnees="locataires"] .vgp-coord-titre')?.textContent).toBe('Locataire');
    expect(d.querySelector('[data-vgp-coordonnees="proprietaires"] .vgp-coord-titre')?.textContent).toBe('Propriétaires');
    expect([...d.querySelectorAll('[data-vgp-personne]')].map((p) => p.textContent)).toEqual([
      'Alice DUPONT · alice@exemple.test · 06 12 34 56 78', 'Jean DURAND · — · —', 'SCI Les Tilleuls · sci@exemple.test · —']);
    expect(d.querySelector('[data-vgp-email]')?.getAttribute('href')).toBe('mailto:alice@exemple.test');
    expect(d.querySelector('[data-vgp-telephone]')?.getAttribute('href')).toBe('tel:+33612345678');
    // pas de doublon avec la ligne repliée : ni l'adresse, ni l'AG, ni la date limite
    expect(d.textContent).not.toContain('1 rue A, 92800 Puteaux');
  });
  it('« Dates manquantes » : les coordonnées sous chaque locataire concerné', async () => {
    donnees = { ...LU, lignes: [LU.lignes[0], { ...LU.lignes[2], contacts: { locataires: [{ nom: 'Paul MARTIN', email: null, telephone: { affiche: '06 00 00 00 00', lien: 'tel:+33600000000' } }], proprietaires: [] } }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const r = container.querySelector('[data-vgp-concerne="6"]')!;
    expect(r.querySelector('[data-vgp-personne]')?.textContent).toBe('Paul MARTIN · — · 06 00 00 00 00');
    expect(r.querySelector('[data-vgp-coordonnees="proprietaires"]')?.textContent).toBe('Propriétaire—');
  });
});

/** 🔴🔴 Arno (24/11/2026, 23h53) — la recherche : sous le titre, au-dessus du listing ; instantanée ; compteurs filtrés ; catégories vides masquées ; « Aucun résultat » ; la croix. */
describe('🔴🔴 Arno (24/11/2026, 23h53) — la recherche sur l’écran', () => {
  const taper = async (v: string) => {
    const el = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const visibles = () => [...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
  it('le champ (texte d’exemple) est sous le titre, avant la première catégorie ; filtrage instantané avec accents ; compteurs mis à jour ; catégories vides masquées', async () => {
    donnees = { ...LU, faites: [] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const champ = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    expect(champ.placeholder).toBe('Rechercher un locataire, une adresse ou un propriétaire');
    expect(champ.compareDocumentPosition(container.querySelector('[data-vgp-categorie]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('h1')!.compareDocumentPosition(champ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await taper('LÉO dur');
    expect(visibles()).toEqual(['Urgence', 'Alerte du lundi']);
    expect(container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-compteur]')?.textContent).toBe('1');
    await taper('martin');
    expect(visibles()).toEqual(['Dates manquantes', 'Alerte du lundi']);
    expect(container.querySelector('[data-vgp-categorie="manquantes"] [data-vgp-compteur]')?.textContent).toBe('1');
  });
  it('« Aucun résultat » ; la croix efface la recherche et tout revient ; les pastilles de l’accueil ne lisent pas la recherche', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await taper('zzz introuvable');
    expect(container.querySelector('[data-vgp-aucun-resultat]')?.textContent).toBe('Aucun résultat');
    await act(async () => { (container.querySelector('[data-vgp-recherche-effacer]') as HTMLButtonElement).click(); });
    expect((container.querySelector('[data-vgp-recherche]') as HTMLInputElement).value).toBe('');
    expect(container.querySelector('[data-vgp-aucun-resultat]')).toBeNull();
    expect(visibles().slice(0, 5)).toEqual(['Dates manquantes', 'Urgence', 'AG passée — restitution à faire', 'À préparer', 'En attente']);
    expect(readFileSync('app/(admin)/admin/(protected)/location/BoutonVingtPourcent.tsx', 'utf8')).not.toContain('recherche');
  });
});
