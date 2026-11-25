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
// 🔴 (25/11/2026) « Envoyer un mail » : le module d'envoi (Redaction) et la lecture des adresses du bien, doublés — rien ne part, rien n'est lu
const redaction = vi.fn();
vi.mock('../gestion/Redaction', () => ({
  Redaction: (p: { brouillon: { a: string[] }; fermetureDemandee?: number; onFerme: () => void; onChange: (b: unknown) => void }) => {
    redaction(p);
    return createElement('div', { 'data-stub-redaction': (p.brouillon.a ?? []).join(','), 'data-fermeture': p.fermetureDemandee ?? 0 },
      createElement('button', { 'data-stub-fermer': '', onClick: p.onFerme }, 'fermer'),
      createElement('button', { 'data-stub-deux-locataires': '', onClick: () => p.onChange({ ...p.brouillon, a: ['alice@exemple.test', 'leo@exemple.test'] }) }, 'deux'));
  },
}));
const nouveauDepuisLeBien = vi.fn();
vi.mock('../../../../lib/gestion/nouveauMessageBien', () => ({
  brouillonNouveauDepuisLeBien: async (base: Record<string, unknown>, bien: unknown) => {
    nouveauDepuisLeBien(bien);
    return { ...base, cibles: [{ sorte: 'lot', cle: 'L1', id: 1, libelle: '1 rue A' }], appel: { formule: 'Bonjour Madame, Monsieur,', civilites: {} },
      // 🔴 (25/11/2026) les propositions du bien : un contact du syndic, un propriétaire (adresse propre)
      suggestionsBien: [{ cle: 'clients', titre: 'Clients', lignes: [{ adresse: 'jean@exemple.test', nom: 'Jean DURAND', role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: null, nomFamille: null }] },
        { cle: 'immeuble', titre: 'Immeuble', lignes: [{ adresse: 'syndic@exemple.test', nom: 'Cabinet X', role: 'Syndic', ton: 'syndic', propre: true, civilite: null, nomFamille: null }] }] };
  },
}));
const { EcranVingtPourcent } = await import('./VingtPourcent');
const { texteConfirmationRestitution } = await import('../../../../lib/location/vingtPourcent');
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
      // 🔴 (25/11/2026, nouvelle règle d'Arno) en « Urgence » : AGO (provisoire) le 01/11, 23e jour le 23/11, date limite 01/12 non dépassée
      suivi: { etat: 'ok', exercice: null, ago: { date: '2026-11-01', statut: 'officielle' }, incertaine: true, limite: '2026-12-01', alerte: 'proche', joursRestants: 8 } },
    { sortieId: 6, lotId: 2, locataires: ['MARTIN Paul', 'MARTIN Léa'], logement: '2 rue B', dateSortie: '2026-10-01', valideLe: '2026-10-02',
      copropriete: { id: 20, libelle: 'Copro B', aRattacher: false }, arrete: null, suivi: { etat: 'sans_ago', exercice: null, mention: 'Dernière AGO inconnue' } },
  ],
};
/** 🔴 (25/11/2026) une ligne « Alerte restitution en retard » : AGO OFFICIELLE (arrêté connu), date limite dépassée. */
const RETARD = { ...LU.lignes[1], sortieId: 8, lotId: 8, locataires: ['RETARD Rémi'], logement: '8 rue R', arrete: { jour: 31, mois: 12 }, cleCopro: 'copro-30',
  suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: '2026-09-15', statut: 'officielle' as const }, incertaine: false, limite: '2026-10-15', alerte: 'depassee' as const, joursRestants: -39 } };
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
  it('lit la route qu’on lui donne ; « Dates / copropriétés manquantes » EN TÊTE : copropriété, ce qui manque, locataires, « Compléter la fiche Copropriété »', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis' }));
    expect(lectures[0]).toMatch(/^\/api\/admin\/gestion\/preavis\?vingtPourcent=1/);
    const blocs = [...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
    // 🔴 Arno (24/11/2026) — cinq catégories exclusives, dans cet ordre (« Dates / copropriétés manquantes » toujours en tête)
    // 🔴 Arno (25/11/2026) — l'ancienne « Alerte du lundi » est remplacée par « Alerte restitution en retard », absente ici (personne en retard)
    expect(blocs).toEqual(['Dates / copropriétés manquantes', 'Urgence', 'AGO passée — restitution à faire', 'AGO < 1 mois – À préparer', 'AGO > 1 mois – En attente', 'Restitutions faites']);
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
    // 🔴 (Arno, 25/11/2026, 10h14) plus rien à compléter : le bloc n'apparaît plus (avant : « Toutes les copropriétés concernées ont… »)
    expect(container.querySelector('[data-vgp-manquantes]')).toBeNull();
  });
  it('chaque locataire : logement, copropriété, sortie, exercice, AGO qui compte (projetée / officielle, incertaine), limite, alerte EN MOTS', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const a = container.querySelector('[data-vgp-sortie="5"]')!;
    expect(a.textContent).toContain('1 rue A, 92800 Puteaux');
    // 🔴 (Arno, 24/11/2026, 23h16) deux lignes + détail : l'arrêté a sa rubrique dans le détail ; l'AGO est sur la ligne, en court
    expect(a.querySelector('[data-vgp-exercice]')?.textContent).toBe('Exercice clos le 31/12/2026');
    expect(a.querySelector('[data-vgp-arrete]')).toBeNull(); // 🔴 (25/11/2026) rubrique retirée : doublon de « Exercice clos le … »
    expect(a.querySelector('[data-vgp-ago]')?.textContent).toBe('AGO vers mars 2027 (projetée)');
    // 🔴 (Arno, 24/11/2026, 23h40) la date limite et son compte à rebours sur la 3e ligne ; le détail ne les répète plus
    expect(a.querySelector('[data-vgp-limite]')?.textContent).toBe('Restitution au plus tard le 25/04/2027 AG dans 122 jours');
    expect(a.querySelector('[data-vgp-alerte-texte]')).toBeNull();
    const c = container.querySelector('[data-vgp-sortie="7"]')!;
    expect(c.getAttribute('data-vgp-alerte')).toBe('proche');
    expect(c.querySelector('[data-vgp-ago]')?.textContent).toBe('AGO 01/11/2026 (officielle)');
    expect(c.querySelector('[data-vgp-incertaine]')?.textContent).toBe('date provisoire — arrêté manquant');
    expect(c.querySelector('[data-vgp-limite]')?.textContent).toBe('Restitution au plus tard le 01/12/2026 J-8');
    // sans date : la sortie 6 n'a de ligne que dans le détail du bloc de sa copropriété (« Dates / copropriétés manquantes »)
    expect(container.querySelector('[data-vgp-sortie="6"]')).toBeNull();
    expect(container.querySelector('[data-vgp-concerne="6"]')?.textContent).toContain('Sans date');
  });
});

describe('point 4 — les accès : colonne de gauche de la Gestion et accueil Location avec pastille', () => {
  it('la pastille ROUGE dit le total des alertes (🔴 25/11 : 1 copropriété à compléter + DURAND Léo en urgence) ; le bouton ouvre la pleine page', async () => {
    await rendre(createElement(BoutonVingtPourcent));
    const b = container.querySelector('a[data-bouton-vingt-pourcent]')!;
    expect(b.getAttribute('href')).toBe('/admin/location/vingt-pourcent');
    expect(b.querySelector('[data-pastille-vingt-total]')?.textContent).toBe('2');
    expect(lectures[0]).toMatch(/^\/api\/admin\/location\?vingtPourcent=1/);
  });
  it('AUCUNE pastille à 0', async () => {
    donnees = { ...LU, manquantes: [], lignes: LU.lignes.filter((l) => l.sortieId !== 7) };
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('a[data-bouton-vingt-pourcent]')).not.toBeNull();
    expect(container.querySelector('[data-pastille-vingt-total]')).toBeNull();
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

describe('🔴 Arno (23/11/2026) — « Bien sans copropriété » dans « Dates / copropriétés manquantes » (compté dans la pastille)', () => {
  it('l’étiquette « Bien sans copropriété », le lien pour créer la fiche ; la pastille le compte', async () => {
    donnees = { ...LU, manquantes: [...LU.manquantes, { cle: 'immeuble-c', coproprieteId: null, libelle: '9 rue C', immeuble: 'c', lotId: 9, manque: ['arrete'], locataires: ['SANS Copro'] }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const m = container.querySelector('[data-vgp-manque="immeuble-c"]')!;
    expect(m.querySelector('[data-vgp-bien-sans-copro]')?.textContent).toBe('Bien sans copropriété');
    expect(m.querySelector('[data-vgp-completer]')).not.toBeNull();
    act(() => root.unmount()); root = createRoot(container);
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-total]')?.textContent).toBe('3'); // 2 copropriétés + DURAND Léo en urgence
  });
});

/** 🔴🔴 Arno (24/11/2026) — les catégories exclusives : un locataire = une catégorie ; titre + compteur, repliable ; jours restants. */
describe('🔴🔴 Arno (24/11/2026) — les cinq catégories de l’écran', () => {
  const ligne = (sortieId: number, ago: string, limite: string, joursRestants: number, statut: 'officielle' | 'projetee' = 'projetee') => ({
    sortieId, lotId: sortieId, locataires: [`LOC ${sortieId}`], logement: `${sortieId} rue Test`, dateSortie: '2026-01-15', valideLe: '2026-01-20',
    copropriete: { id: 50, libelle: 'Copro OK', aRattacher: false }, arrete: { jour: 31, mois: 12 }, cleCopro: 'copro-50',
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: ago, statut }, incertaine: false, limite, alerte: 'a_venir' as const, joursRestants } });
  it('chaque ligne dans UNE catégorie, compteurs, « Date limite dépassée de N jours » en rouge ; « Dates / copropriétés manquantes » garde la ligne complète sous sa copropriété', async () => {
    donnees = { ...LU, lignes: [...LU.lignes,
      ligne(11, '2026-09-01', '2026-10-01', -53), // 🔴 (25/11, nouvelle règle) limite dépassée, AGO projetée : « Alerte »
      ligne(12, '2026-11-10', '2026-12-10', 16), // AGO passée
      ligne(13, '2026-12-10', '2027-01-10', 47, 'projetee'), // à préparer (AG dans 16 jours)
      ligne(14, '2026-12-12', '2027-01-12', 50, 'officielle'), // à préparer (officielle à 19 jours ; 🔴 25/11 : plus de « lointaine »)
    ] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const dans = (cat: string) => [...container.querySelectorAll(`[data-vgp-categorie="${cat}"] [data-vgp-sortie]`)].map((x) => Number(x.getAttribute('data-vgp-sortie')));
    // 🔴 (Arno, 25/11/2026) DURAND Léo (7) : arrêté manquant, date PROVISOIRE, 23e jour après l'AGO, limite non dépassée → « Urgence » ;
    //    11 : date limite dépassée → « Alerte », même sur une AGO projetée (choix d'Arno)
    expect(dans('retard')).toEqual([11]);
    expect(dans('urgence')).toEqual([7]);
    expect(dans('ag_passee')).toEqual([12]);
    expect(dans('a_preparer')).toEqual([13, 14]);
    expect(dans('en_attente')).toEqual([5]);
    expect([...container.querySelectorAll('[data-vgp-categorie="manquantes"] [data-vgp-concerne]')].map((x) => [x.getAttribute('data-vgp-concerne'), x.getAttribute('data-vgp-concerne-categorie')]))
      .toEqual([['6', 'manquantes']]); // Copro B (6, sans date) ; Copro C n'est pas dans les copropriétés lues ici (épreuve dédiée plus bas)
    // un locataire n'apparaît qu'une fois sur tout l'écran
    expect(container.querySelectorAll('[data-vgp-sortie="7"]')).toHaveLength(1);
    // « Dates / copropriétés manquantes » compte les COPROPRIÉTÉS à compléter (la pastille) : Copro B, et Copro C (celle de DURAND Léo) via sa carte
    // 🔴 (25/11, nouvelle règle) « Alerte » apparaît (11) : manquantes, retard, urgence, AGO passée, à préparer, en attente
    expect([...container.querySelectorAll('[data-vgp-categorie] > details > summary [data-vgp-compteur]')].map((x) => x.textContent)).toEqual(['1', '1', '1', '1', '2', '1']);
    // 🔴 (Arno, 25/11/2026) « par défaut toutes les lignes de chaque catégorie sont fermées » : les catégories aussi (épreuve dédiée plus bas)
    expect(container.querySelectorAll('[data-vgp-categorie] > details[open]')).toHaveLength(0);
    const u = container.querySelector('[data-vgp-sortie="11"] [data-vgp-rebours]')!;
    expect([u.textContent, u.className]).toEqual(['Dépassé de 53 jours', 'vgp-rebours vgp-rebours--rouge']);
    expect(container.querySelector('[data-vgp-sortie="12"] [data-vgp-rebours]')?.textContent).toBe('J-16');
    const d = container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-sortie="7"]')!;
    expect(d.querySelector('[data-vgp-rebours]')?.textContent).toBe('J-8');
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
    expect(container.querySelectorAll('[data-vgp-restituer-concerne]')).toHaveLength(1); // et, dans « Dates / copropriétés manquantes », chaque locataire concerné
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
    // 🔴 (25/11/2026) la confirmation d'abord : rien n'est écrit avant « Confirmer la restitution »
    expect(posts).toEqual([]);
    await act(async () => { (container.querySelector('[data-confirmation-confirmer]') as HTMLButtonElement).click(); }); await calmer();
    expect(posts).toEqual([{ action: 'restitution-20-faite', sortieId: 5, date: '2026-11-23', montantRestitue: '312,50', montantRetenuCharges: '', commentaire: 'Virement _TEST' }]);
    expect((global.fetch as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls.find(([, i]) => i?.method === 'POST')?.[0]).toBe('/api/admin/location');
    expect(container.querySelector('[data-fenetre-restitution]')).toBeNull();
    expect(lectures).toHaveLength(2);
  });
  it('« Restitutions faites (1) » repliée en bas de page : la restitution, puis « Annuler » → confirmation → POST d’annulation', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const blocs = [...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'));
    expect(blocs.at(-1)).toBe('Restitutions faites'); // 🔴 (25/11/2026) la dernière, l'alerte du lundi étant passée en deuxième
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
describe('🔴 Arno (24/11/2026) — le mode essai de l’alerte par mail (🔴 25/11 : dans « Alerte restitution en retard »)', () => {
  it('« Voir le mail tel qu’il partirait » lit la route de l’écran (GET ?alerteVingtEssai=1) et montre l’objet et le texte ; aucun envoi', async () => {
    const methodes: string[] = [];
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      methodes.push(init?.method ?? 'GET'); lectures.push(String(u));
      if (String(u).includes('alerteVingtEssai=1')) return { status: 200, json: async () => ({ etat: 'ok', data: { etat: 'essai', mail: { a: ['gestion@exemple.test'], objet: '[Urgent] 20 % à restituer — 1 locataire', texte: 'Bonjour,\n\n- LOC 1', nombre: 1 } } }) } as Response;
      return { status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as Response;
    }) as unknown as typeof fetch;
    donnees = { ...LU, lignes: [...LU.lignes, RETARD] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis' }));
    expect(container.querySelector('[data-vgp-categorie="retard"] [data-vgp-alerte-essai]')).not.toBeNull();
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
  it('accueil Location : les locataires en urgence comptent dans la pastille unique (🔴 25/11 : plus de seconde pastille)', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, urgence, { ...urgence, sortieId: 22 }] };
    await rendre(createElement(BoutonVingtPourcent));
    // 🔴 (25/11) les deux ajoutées (AGO officielle, limite dépassée) sont « en retard » ; DURAND Léo (provisoire) en urgence ; + 1 copropriété
    const t = container.querySelector('[data-pastille-vingt-total]')!;
    expect([t.textContent, t.className]).toEqual(['4', 'bvp-pastille']);
    expect(container.querySelector('a[data-bouton-vingt-pourcent]')?.getAttribute('aria-label')).toBe('20 % à restituer — 2 locataires en retard de restitution · 1 locataire en urgence · 1 copropriété à compléter');
    act(() => root.unmount()); root = createRoot(container);
    donnees = { ...LU, lignes: LU.lignes.filter((l) => l.sortieId !== 7) }; // personne en urgence
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-total]')?.textContent).toBe('1');
  });
  it('colonne de gauche de la Gestion : la pastille unique sur « 20 % à restituer », lue sur la route de la Gestion ; le reste inchangé', () => {
    const g = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(g).toContain('const pastillesVingt = usePastillesVingt(API_PREAVIS_GESTION);');
    expect(g).toContain('vingtCopros={pastillesVingt.copros}');
    expect(g).toContain('vingtUrgences={pastillesVingt.urgences}');
    const s = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    const entree = s.slice(s.indexOf('data-raccourci="vingt-pourcent"'), s.indexOf('{onSyndics && ('));
    expect(entree).toContain('className="cm-pastille-jour cm-pastille-vif" data-pastille-vingt-total={p.total}');
    expect(entree).not.toContain('data-pastille-vingt-copros');
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
    expect([...a.querySelectorAll('[data-vgp-detail] dt')].map((x) => x.textContent)).toEqual(['Copropriété', 'Date de sortie', 'Exercice concerné', 'Dernière AGO']);
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
 * 🔴🔴 Arno (24/11/2026, 23h40) — « Dates / copropriétés manquantes » : « réduire sur 3 lignes le bloc principal, déployable comme les autres ; tous les blocs
 * principaux doivent avoir la même taille ». UN bloc par copropriété à compléter ; déplié, chaque locataire concerné avec « Restitution faite ».
 */
describe('🔴🔴 Arno (24/11/2026, 23h40) — « Dates / copropriétés manquantes » : un bloc de trois lignes par copropriété', () => {
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
  it('lignes et « Dates / copropriétés manquantes » : « Faire restitution » ; plus aucun bouton « Restitution faite » ; la modale garde son titre, la section le sien', async () => {
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
  it('« Dates / copropriétés manquantes » : un seul locataire concerné → ni nom ni adresse dans le détail ; statut court « Sans date »', async () => {
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
    // 🔴 (Arno, 25/11/2026) un seul locataire : son nom est déjà sur la ligne repliée → « e-mail · téléphone » ; les propriétaires gardent leur nom
    expect([...d.querySelectorAll('[data-vgp-personne]')].map((p) => p.textContent)).toEqual([
      'alice@exemple.test · 06 12 34 56 78', 'Jean DURAND · — · —', 'SCI Les Tilleuls · sci@exemple.test · —']);
    expect(d.querySelector('[data-vgp-email]')?.getAttribute('href')).toBe('mailto:alice@exemple.test');
    expect(d.querySelector('[data-vgp-telephone]')?.getAttribute('href')).toBe('tel:+33612345678');
    // pas de doublon avec la ligne repliée : ni l'adresse, ni l'AG, ni la date limite
    expect(d.textContent).not.toContain('1 rue A, 92800 Puteaux');
  });
  it('« Dates / copropriétés manquantes » : les coordonnées sous chaque locataire concerné', async () => {
    donnees = { ...LU, lignes: [LU.lignes[0], { ...LU.lignes[2], contacts: { locataires: [{ nom: 'Paul MARTIN', email: null, telephone: { affiche: '06 00 00 00 00', lien: 'tel:+33600000000' } }], proprietaires: [] } }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const r = container.querySelector('[data-vgp-concerne="6"]')!;
    // la sortie 6 a deux colocataires (MARTIN Paul, MARTIN Léa) : le nom reste
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
    expect(visibles()).toEqual(['Urgence']);
    expect(container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-compteur]')?.textContent).toBe('1');
    await taper('martin');
    expect(visibles()).toEqual(['Dates / copropriétés manquantes']); // 🔴 (25/11) personne en urgence dans les résultats : pas d'alerte du lundi
    expect(container.querySelector('[data-vgp-categorie="manquantes"] [data-vgp-compteur]')?.textContent).toBe('1');
  });
  it('« Aucun résultat » ; la croix efface la recherche et tout revient ; les pastilles de l’accueil ne lisent pas la recherche', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await taper('zzz introuvable');
    expect(container.querySelector('[data-vgp-aucun-resultat]')?.textContent).toBe('Aucun résultat');
    await act(async () => { (container.querySelector('[data-vgp-recherche-effacer]') as HTMLButtonElement).click(); });
    expect((container.querySelector('[data-vgp-recherche]') as HTMLInputElement).value).toBe('');
    expect(container.querySelector('[data-vgp-aucun-resultat]')).toBeNull();
    expect(visibles().slice(0, 5)).toEqual(['Dates / copropriétés manquantes', 'Urgence', 'AGO passée — restitution à faire', 'AGO < 1 mois – À préparer', 'AGO > 1 mois – En attente']);
    expect(readFileSync('app/(admin)/admin/(protected)/location/BoutonVingtPourcent.tsx', 'utf8')).not.toContain('recherche');
  });
});

/** 🔴 Arno (25/11/2026) — « pas de doublon » : UN locataire → « e-mail · téléphone » ; plusieurs → « Prénom NOM · e-mail · téléphone » ; propriétaires inchangés. */
describe('🔴 Arno (25/11/2026) — le nom du locataire seulement s’ils sont plusieurs', () => {
  const P = (nom: string) => ({ nom, email: `${nom.split(' ')[0].toLowerCase()}@exemple.test`, telephone: null });
  it('ligne datée : un locataire sans nom ; deux colocataires avec leurs noms ; le propriétaire toujours nommé', async () => {
    donnees = { ...LU, lignes: [
      { ...LU.lignes[0], contacts: { locataires: [P('Alice DUPONT')], proprietaires: [P('Jean DURAND')] } },
      { ...LU.lignes[0], sortieId: 15, locataires: ['MARTIN Paul', 'MARTIN Léa'], contacts: { locataires: [P('Paul MARTIN'), P('Léa MARTIN')], proprietaires: [] } }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const lignes = (id: number) => [...container.querySelectorAll(`[data-vgp-sortie="${id}"] [data-vgp-personne]`)].map((p) => p.textContent);
    expect(lignes(5)).toEqual(['alice@exemple.test · —', 'Jean DURAND · jean@exemple.test · —']);
    expect(lignes(15)).toEqual(['Paul MARTIN · paul@exemple.test · —', 'Léa MARTIN · léa@exemple.test · —']);
  });
  it('« Dates / copropriétés manquantes » : bloc d’un seul locataire → sans nom ; plusieurs locataires dans le bloc → avec leur nom', async () => {
    const MANQ = { cle: 'copro-40', coproprieteId: 40, libelle: '4 rue D', immeuble: '4 rue d', lotId: 40, manque: ['arrete' as const], locataires: ['UN Seul'] };
    const L = (id: number, noms: string[]) => ({ ...LU.lignes[2], sortieId: id, lotId: id, locataires: noms, logement: '4 rue D', cleCopro: 'copro-40',
      copropriete: { id: 40, libelle: '4 rue D', aRattacher: false }, contacts: { locataires: noms.map((n) => P(n)), proprietaires: [] } });
    donnees = { ...LU, manquantes: [MANQ], lignes: [L(41, ['UN Seul'])] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-concerne="41"] [data-vgp-personne]')?.textContent).toBe('un@exemple.test · —');
    act(() => root.unmount()); root = createRoot(container);
    donnees = { ...LU, manquantes: [{ ...MANQ, locataires: ['UN Seul', 'DEUX Autre'] }], lignes: [L(41, ['UN Seul']), L(42, ['DEUX Autre'])] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-concerne="42"] [data-vgp-personne]')?.textContent).toBe('DEUX Autre · deux@exemple.test · —');
  });
});

/** 🔴🔴 Arno (25/11/2026) — « par défaut toutes les lignes de chaque catégorie sont fermées » ; une recherche ouvre les catégories qui ont des résultats ; effacée, tout se replie. */
describe('🔴🔴 Arno (25/11/2026) — tout replié à l’ouverture', () => {
  const taper = async (v: string) => {
    const el = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const ouverts = () => [...container.querySelectorAll('section > details')].filter((d) => (d as HTMLDetailsElement).open).map((d) => d.parentElement!.getAttribute('aria-label'));
  const lignesOuvertes = () => container.querySelectorAll('[data-vgp-ouvert="1"]').length;
  const FAITE = { id: 9, sortieId: 3, locataires: ['FAIT Jean'], logement: '3 rue F', dateSortie: '2026-01-01', date: '2026-11-02',
    montantRestitue: 312.5, montantRetenuCharges: null, commentaire: null, par: 'Arno Test', le: '2026-11-02 10:15' };
  it('à l’ouverture : toutes les catégories repliées (titre et compteur visibles), toutes les lignes repliées', async () => {
    donnees = { ...LU, faites: [FAITE] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(ouverts()).toEqual([]);
    expect(lignesOuvertes()).toBe(0);
    for (const s of container.querySelectorAll('[data-vgp-categorie]')) expect(s.querySelector('summary [data-vgp-compteur]')).not.toBeNull();
  });
  it('une recherche ouvre les catégories qui ont des résultats (lignes toujours repliées) ; effacée, tout se replie, lignes dépliées comprises', async () => {
    donnees = { ...LU, faites: [FAITE] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await taper('léo');
    expect(ouverts()).toEqual(['Urgence']);
    expect(lignesOuvertes()).toBe(0);
    await taper('rue');
    expect(ouverts()).toEqual(['Dates / copropriétés manquantes', 'AGO > 1 mois – En attente', 'Restitutions faites']);
    // une ligne dépliée à la main pendant la recherche…
    await act(async () => { (container.querySelector('[data-vgp-sortie="5"] [data-vgp-adresse]') as HTMLElement).click(); });
    expect(lignesOuvertes()).toBe(1);
    // …la croix efface : tout se replie
    await act(async () => { (container.querySelector('[data-vgp-recherche-effacer]') as HTMLButtonElement).click(); });
    expect(ouverts()).toEqual([]);
    expect(lignesOuvertes()).toBe(0);
    // effacer au clavier : pareil
    await taper('martin');
    expect(ouverts()).toEqual(['Dates / copropriétés manquantes']);
    await taper('');
    expect(ouverts()).toEqual([]);
  });
  it('une catégorie s’ouvre et se ferme à la main ; une relecture (après la fiche Copropriété) garde ce qui est ouvert', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const d = container.querySelector('[data-vgp-categorie="en_attente"] > details') as HTMLDetailsElement;
    await act(async () => { d.open = true; d.dispatchEvent(new Event('toggle')); });
    expect(ouverts()).toEqual(['AGO > 1 mois – En attente']);
    await act(async () => { (container.querySelector('[data-vgp-completer="copro-20"]') as HTMLButtonElement).click(); });
    await act(async () => { (container.querySelector('[data-stub-fiche]') as HTMLButtonElement).click(); }); await calmer();
    expect(lectures).toHaveLength(2);
    expect(ouverts()).toEqual(['AGO > 1 mois – En attente']);
  });
});

/** 🔴 Arno (25/11/2026) — « passer le bloc "Alerte du lundi" en deuxième position » ; 🔴 (25/11) « Alerte restitution en retard » l'a remplacé, même place. */
describe('🔴 Arno (25/11/2026) — la 2e position : « Alerte restitution en retard » (à la place de « Alerte du lundi »)', () => {
  it('ordre : Dates / copropriétés manquantes, Alerte restitution en retard, Urgence, AGO passée, À préparer, En attente, Restitutions faites ; l’essai du mail est dans son bloc', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, RETARD], faites: [] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect([...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'))).toEqual(
      ['Dates / copropriétés manquantes', 'Alerte restitution en retard', 'Urgence', 'AGO passée — restitution à faire', 'AGO < 1 mois – À préparer', 'AGO > 1 mois – En attente', 'Restitutions faites']);
    const a = container.querySelector('[data-vgp-categorie="retard"]')!;
    expect(a.querySelector('[data-vgp-alerte-essai]')?.textContent).toBe('Voir le mail tel qu’il partirait (essai : rien n’est envoyé)');
    expect((a.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect(container.querySelector('[data-vgp-alerte-lundi]')).toBeNull(); // l'ancien bloc n'existe plus
  });
  it('sans « Dates / copropriétés manquantes » (recherche qui ne les trouve pas), elle passe en tête', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, RETARD] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const el = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'rémi'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect([...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label'))).toEqual(['Alerte restitution en retard']);
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « une couleur de trame de fond par catégorie, du moins urgent en vert au plus urgent, l'Alerte du lundi en rouge, en passant
 * par l'orange » ; teintes claires en clair, foncées en sombre ; texte toujours lisible ; mêmes couleurs pour le liseré et le fond du titre.
 */
describe('🔴🔴 Arno (25/11/2026) — une trame de fond par catégorie', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const valeurs = (nom: string): string[] => [...css.matchAll(new RegExp(`${nom}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1].toLowerCase());
  const lum = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contraste = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const TEINTES = ['alerte', 'urgence', 'agpassee', 'preparer', 'attente', 'faites'] as const;
  it('chaque bloc porte sa teinte : Alerte restitution en retard rouge (🔴 25/11, à la place de l’Alerte du lundi), Urgence rouge orangé, AGO passée orange, À préparer orange clair, En attente vert, Restitutions faites gris ; Dates / copropriétés manquantes inchangée', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, RETARD], faites: [] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    // 🔴 (25/11) le rouge de l'ancienne « Alerte du lundi » est à « Alerte restitution en retard », même place
    expect([...container.querySelectorAll('section')].map((s) => [s.getAttribute('aria-label'), s.getAttribute('data-vgp-teinte')])).toEqual([
      ['Dates / copropriétés manquantes', null], ['Alerte restitution en retard', 'alerte'], ['Urgence', 'urgence'], ['AGO passée — restitution à faire', 'agpassee'],
      ['AGO < 1 mois – À préparer', 'preparer'], ['AGO > 1 mois – En attente', 'attente'], ['Restitutions faites', 'faites']]);
    expect(container.querySelector('[data-vgp-categorie="urgence"]')?.className).toContain('vgp-teinte vgp-teinte--urgence');
    expect(container.querySelector('[data-vgp-categorie="manquantes"]')?.className).not.toContain('vgp-teinte');
    const src = readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8');
    for (const t of TEINTES) expect(src).toContain(`.vgp-teinte--${t}{--vgp-fond:var(--color-svv-vgp-${t}-fond);--vgp-accent:var(--color-svv-vgp-${t}-accent)}`);
    // le liseré ET le fond du titre : la même couleur (-accent)
    expect(src).toContain('.vgp-bloc.vgp-teinte{background:var(--vgp-fond);border:2px solid var(--vgp-accent);');
    expect(src).toContain('.vgp-teinte > .vgp-repli > summary{margin-inline:-14px;padding:8px 14px;background:var(--vgp-accent);color:var(--color-svv-ink)}');
  });
  it('les jetons existent en clair, en sombre et en système (sombre = système) ; teintes claires en clair, foncées en sombre ; six teintes distinctes', () => {
    for (const t of TEINTES) for (const r of ['fond', 'accent']) {
      const v = valeurs(`--color-svv-vgp-${t}-${r}`);
      expect(v, `${t}-${r}`).toHaveLength(3);
      expect(v[2]).toBe(v[1]);
      expect(lum(v[0])).toBeGreaterThan(0.4); // clair
      expect(lum(v[1])).toBeLessThan(0.1); // sombre
    }
    for (const i of [0, 1]) for (const r of ['fond', 'accent']) expect(new Set(TEINTES.map((t) => valeurs(`--color-svv-vgp-${t}-${r}`)[i])).size).toBe(6);
  });
  it('texte toujours lisible : encre ≥ 7:1 sur le fond et sur le titre, texte gris ≥ 4,5:1 sur le fond, en clair comme en sombre', () => {
    const [encreClair, encreSombre] = valeurs('--color-svv-ink');
    const [grisClair, grisSombre] = valeurs('--color-svv-muted');
    for (const t of TEINTES) {
      const [fc, fs] = valeurs(`--color-svv-vgp-${t}-fond`); const [ac, as] = valeurs(`--color-svv-vgp-${t}-accent`);
      for (const [encre, fond] of [[encreClair, fc], [encreClair, ac], [encreSombre, fs], [encreSombre, as]]) expect(contraste(encre, fond), `${t} ${fond}`).toBeGreaterThanOrEqual(7);
      expect(contraste(grisClair, fc), `${t} gris clair`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(grisSombre, fs), `${t} gris sombre`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « pour chaque bloc de catégorie, afficher sur deux lignes l'une au-dessus de l'autre une capsule verte "AGO officielle" […] et
 * la même chose en rouge pour "AGO projetée" ; le cumul des deux doit être égal au chiffre indiqué à droite de l'intitulé ».
 */
describe('🔴🔴 Arno (25/11/2026) — les capsules « AGO officielle » / « AGO projetée »', () => {
  const L = (sortieId: number, ago: string, limite: string, statut: 'officielle' | 'projetee', locataires: string[], incertaine = false) => ({
    sortieId, lotId: sortieId, locataires, logement: `${sortieId} rue Capsule`, dateSortie: '2026-01-15', valideLe: '2026-01-20',
    copropriete: { id: 50, libelle: 'Copro OK', aRattacher: false }, arrete: incertaine ? null : { jour: 31, mois: 12 }, cleCopro: 'copro-50',
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: ago, statut }, incertaine, limite, alerte: 'a_venir' as const, joursRestants: 0 } });
  const DONNEES = { ...LU, faites: [], lignes: [...LU.lignes,
    L(11, '2026-09-01', '2026-10-01', 'officielle', ['OFF Un', 'OFF Deux']), // 🔴 (25/11) retard : 2 locataires, officielle, limite dépassée
    L(12, '2026-09-02', '2026-10-02', 'projetee', ['PROJ Trois']), // 🔴 (25/11, nouvelle règle) retard : projetée, limite dépassée (AGO à confirmer)
    L(13, '2026-11-10', '2026-12-10', 'officielle', ['PROV Quatre'], true), // AGO passée : officielle MAIS provisoire → projetée
    L(14, '2026-12-12', '2027-01-12', 'officielle', ['LOIN Cinq']), // à préparer : officielle (dans les 30 jours)
  ] };
  const capsules = (cat: string) => {
    const s = container.querySelector(`[data-vgp-categorie="${cat}"]`)!;
    const n = (k: string) => Number(s.querySelector(`summary [data-vgp-capsule="${k}"]`)?.getAttribute('data-vgp-capsule-nombre'));
    return { compteur: Number(s.querySelector('summary [data-vgp-compteur]')?.textContent), officielle: n('officielle'), projetee: n('projetee'), nombre: Number(s.getAttribute('data-vgp-nombre')) };
  };
  it('dans chaque catégorie, officielle + projetée = le compteur, qui compte des LOCATAIRES (colocataires comptés un par un) ; la date provisoire compte projetée', async () => {
    donnees = DONNEES;
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    // 🔴 (25/11, nouvelle règle) retard : 11 (2 officielle) + 12 (projetée, limite dépassée) ; urgence : DURAND Léo 7 (officielle mais provisoire → projetée)
    expect(capsules('retard')).toEqual({ compteur: 3, officielle: 2, projetee: 1, nombre: 3 });
    expect(capsules('urgence')).toEqual({ compteur: 1, officielle: 0, projetee: 1, nombre: 1 });
    expect(capsules('ag_passee')).toEqual({ compteur: 1, officielle: 0, projetee: 1, nombre: 1 });
    expect(capsules('a_preparer')).toEqual({ compteur: 1, officielle: 1, projetee: 0, nombre: 1 });
    expect(capsules('en_attente')).toEqual({ compteur: 1, officielle: 0, projetee: 1, nombre: 1 });
    for (const cat of ['retard', 'urgence', 'ag_passee', 'a_preparer', 'en_attente']) { const c = capsules(cat); expect(c.officielle + c.projetee).toBe(c.compteur); }
    // le compteur compte des locataires, pas des sorties : 2 lignes en retard (11 et 12), 3 locataires
    expect(container.querySelectorAll('[data-vgp-categorie="retard"] [data-vgp-sortie]')).toHaveLength(2);
  });
  it('deux capsules empilées dans l’en-tête (visibles repliée) : verte « AGO officielle · N », rouge « AGO projetée · N », grisée à 0', async () => {
    donnees = DONNEES;
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const s = container.querySelector('[data-vgp-categorie="a_preparer"]')!;
    expect((s.querySelector('details') as HTMLDetailsElement).open).toBe(false);
    expect([...s.querySelectorAll('summary [data-vgp-capsules] > *')].map((x) => [x.textContent, x.className])).toEqual([
      ['AGO officielle · 1', 'vgp-capsule vgp-capsule--vert'], ['AGO projetée · 0', 'vgp-capsule vgp-capsule--zero']]);
    expect(container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-capsule="projetee"]')?.className).toBe('vgp-capsule vgp-capsule--rouge');
    const src = readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8');
    expect(src).toContain('.vgp-capsules{margin-left:auto;display:flex;flex-direction:column;'); // l'une au-dessus de l'autre
  });
  it('pas de capsules sur « Dates / copropriétés manquantes », la rubrique du mail ni « Restitutions faites » ; 🔴 (25/11) « Alerte restitution en retard » a les siennes', async () => {
    donnees = DONNEES;
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    for (const sel of ['[data-vgp-categorie="manquantes"]', '[data-vgp-alerte-mail]', '[data-vgp-faites]']) expect(container.querySelector(`${sel} [data-vgp-capsules]`)).toBeNull();
    expect(container.querySelectorAll('[data-vgp-capsules]')).toHaveLength(5);
  });
  it('avec une recherche, capsules et compteurs reflètent les résultats filtrés', async () => {
    donnees = DONNEES;
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const el = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'off'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(capsules('retard')).toEqual({ compteur: 2, officielle: 2, projetee: 0, nombre: 2 });
    expect(container.querySelector('[data-vgp-categorie="urgence"]')).toBeNull();
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, 'léo'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(capsules('urgence')).toEqual({ compteur: 1, officielle: 0, projetee: 1, nombre: 1 });
  });
});

/** 🔴 Arno (25/11/2026) — « compter en locataires partout » : la pastille « Urgence » (accueil Location, et colonne de gauche de la Gestion par le même `usePastillesVingt`) compte des LOCATAIRES. */
describe('🔴 Arno (25/11/2026) — la pastille « Urgence » compte des locataires', () => {
  it('une colocation en urgence (une ligne, deux locataires) + DURAND Léo : pastille 3, = le compteur de la catégorie', async () => {
    const coloc = { ...LU.lignes[1], sortieId: 31, lotId: 31, locataires: ['COLOC Un', 'COLOC Deux'] };
    donnees = { ...LU, lignes: [...LU.lignes, coloc] };
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-total]')?.textContent).toBe('4'); // 3 locataires en urgence + 1 copropriété (🔴 25/11 pastille unique)
    expect(container.querySelector('a[data-bouton-vingt-pourcent]')?.getAttribute('aria-label')).toBe('20 % à restituer — 0 locataire en retard de restitution · 3 locataires en urgence · 1 copropriété à compléter');
    act(() => root.unmount()); root = createRoot(container);
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-compteur]')?.textContent).toBe('3');
    expect(container.querySelectorAll('[data-vgp-categorie="urgence"] [data-vgp-sortie]')).toHaveLength(2);
    // la Gestion lit la même pastille (même hook, même calcul)
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8')).toContain('const pastillesVingt = usePastillesVingt(API_PREAVIS_GESTION);');
  });
});

/** 🔴 Arno (25/11/2026, 10h14) — « pour les 2 blocs gris d'extrémité, agrandir légèrement l'espace avec les autres blocs en contact » : le double de l'écart des blocs colorés. */
describe('🔴 Arno (25/11/2026, 10h14) — l’écart des deux blocs gris d’extrémité', () => {
  it('écart des blocs colorés inchangé (14 px) ; « Dates / copropriétés manquantes » et « Restitutions faites » : 14 px de plus, sans règle propre au téléphone', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8');
    const css = src.slice(src.indexOf('export const CSS_VINGT_POURCENT'));
    expect(css).toContain('.vgp{display:flex;flex-direction:column;gap:14px;min-width:0}');
    expect(css).toContain('.vgp-bloc.vgp-manquantes{margin-bottom:14px}');
    expect(css).toContain('.vgp-bloc.vgp-faites{margin-top:14px}');
    const mobile = css.slice(css.indexOf('@media (max-width:640px)'));
    expect(mobile).not.toMatch(/vgp-manquantes|vgp-faites|\.vgp\{/);
  });
});

/** 🔴 Arno (25/11/2026, 10h14) — « Le bloc Dates / copropriétés manquantes ne doit apparaître que s'il contient des locataires ». */
describe('🔴 Arno (25/11/2026, 10h14) — le bloc des dates manquantes seulement s’il contient des locataires', () => {
  const taper = async (v: string) => {
    const el = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  const blocs = () => [...container.querySelectorAll('section')].map((s) => s.getAttribute('data-vgp-categorie') ?? s.getAttribute('data-vgp-teinte'));
  it('aucune copropriété à compléter : bloc absent, le bloc suivant passe en tête (son écart disparaît avec lui)', async () => {
    donnees = { ...LU, manquantes: [], lignes: [LU.lignes[0], LU.lignes[1], RETARD], faites: [] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-categorie="manquantes"]')).toBeNull();
    expect(blocs()[0]).toBe('retard');
  });
  it('des copropriétés à compléter mais aucun locataire en attente dedans : bloc absent', async () => {
    donnees = { ...LU, manquantes: [{ ...LU.manquantes[0], cle: 'copro-99', coproprieteId: 99, locataires: [] }], lignes: [LU.lignes[0]], faites: [] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-categorie="manquantes"]')).toBeNull();
  });
  it('avec des locataires : présent ; la recherche qui n’y trouve rien le retire, l’effacer le rend', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(blocs()[0]).toBe('manquantes');
    await taper('dupont');
    expect(container.querySelector('[data-vgp-categorie="manquantes"]')).toBeNull();
    await taper('');
    expect(blocs()[0]).toBe('manquantes');
  });
  it('la pastille de l’accueil reste masquée à 0', async () => {
    donnees = { ...LU, manquantes: [], lignes: LU.lignes.filter((l) => l.sortieId !== 7) };
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-total]')).toBeNull();
  });
});

/** 🔴 Arno (25/11/2026, 10h14) — « Dates manquantes » s'appelle désormais « Dates / copropriétés manquantes », partout. */
describe('🔴 Arno (25/11/2026, 10h14) — « Dates / copropriétés manquantes »', () => {
  it('titre et nom du bloc à l’écran ; l’ancien intitulé n’apparaît plus nulle part (écran, colonne de gauche de la Gestion)', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const b = container.querySelector('[data-vgp-categorie="manquantes"]')!;
    expect(b.getAttribute('aria-label')).toBe('Dates / copropriétés manquantes');
    expect(b.querySelector('summary')?.firstChild?.textContent).toBe('Dates / copropriétés manquantes');
    expect(container.textContent).not.toContain('Dates manquantes');
    for (const f of ['app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'app/lib/location/vingtPourcent.ts', 'app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx',
      'app/(admin)/admin/(protected)/location/BoutonVingtPourcent.tsx', 'app/lib/location/alerteVingt.ts']) expect(readFileSync(f, 'utf8'), f).not.toMatch(/[Dd]ates manquantes/);
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8')).toContain('date limite de restitution, dates / copropriétés manquantes');
  });
});

/** 🔴🔴 Arno (25/11/2026) — « faire une seule capsule rouge qui cumule le nombre d'alertes » (bouton de l'accueil Location ET entrée de la colonne de gauche de la Gestion). */
describe('🔴🔴 Arno (25/11/2026) — une seule pastille rouge qui cumule les alertes', () => {
  const urgents = (n: number) => Array.from({ length: n }, (_, i) => ({ ...LU.lignes[1], sortieId: 100 + i, lotId: 100 + i, locataires: [`URG ${i}`] }));
  const copros = (n: number) => Array.from({ length: n }, (_, i) => ({ ...LU.manquantes[0], cle: `copro-${200 + i}`, coproprieteId: 200 + i }));
  it('accueil Location : UNE pastille rouge vif en haut à droite, total = urgences + copropriétés (2 + 4 = 6) ; le détail au survol et pour les lecteurs d’écran', async () => {
    donnees = { ...LU, manquantes: copros(4), lignes: urgents(2) };
    await rendre(createElement(BoutonVingtPourcent));
    const b = container.querySelector('a[data-bouton-vingt-pourcent]')!;
    const p = b.querySelectorAll('.bvp-pastille');
    expect(p).toHaveLength(1);
    expect(p[0].textContent).toBe('6');
    expect(p[0].getAttribute('title')).toBe('0 locataire en retard de restitution · 2 locataires en urgence · 4 copropriétés à compléter');
    expect(b.getAttribute('aria-label')).toBe('20 % à restituer — 0 locataire en retard de restitution · 2 locataires en urgence · 4 copropriétés à compléter');
    const css = readFileSync('app/(admin)/admin/(protected)/location/BoutonVingtPourcent.tsx', 'utf8');
    expect(css).toContain('.bvp-pastille{position:absolute;top:-8px;right:-8px;');
    expect(css).toContain('background:var(--color-svv-rouge-vif)');
    expect(css).not.toContain('bvp-pastille--urgence');
  });
  it('un seul côté : « 1 locataire en urgence · 0 copropriété à compléter » ; masquée à 0 (nom accessible : le titre seul)', async () => {
    donnees = { ...LU, manquantes: [], lignes: urgents(1) };
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('[data-pastille-vingt-total]')?.getAttribute('title')).toBe('0 locataire en retard de restitution · 1 locataire en urgence · 0 copropriété à compléter');
    act(() => root.unmount()); root = createRoot(container);
    donnees = { ...LU, manquantes: [], lignes: [] };
    await rendre(createElement(BoutonVingtPourcent));
    expect(container.querySelector('.bvp-pastille')).toBeNull();
    expect(container.querySelector('a[data-bouton-vingt-pourcent]')?.getAttribute('aria-label')).toBe('20 % à restituer');
  });
  it('colonne de gauche de la Gestion : une seule pastille, même total, même détail au survol et pour les lecteurs d’écran', () => {
    const s = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    const entree = s.slice(s.indexOf('{onVingtPourcent && ('), s.indexOf('{onSyndics && ('));
    // une seule pastille ROUGE ; 🔴 (25/11) plus la pastille VERTE des restitutions à préparer ou à faire
    expect(entree.match(/cm-pastille-jour cm-pastille-vif/g)).toHaveLength(1);
    expect(entree.match(/cm-pastille-jour cm-pastille-vert/g)).toHaveLength(1);
    expect(entree).toContain("pastilleVingt({ retards: vingtRetards, urgences: vingtUrgences, copros: vingtCopros })");
    expect(entree).toContain('title={p.detail} aria-label={p.detail}>{p.total}</span>)}');
    expect(entree).not.toMatch(/data-pastille-vingt-(copros|urgence)/);
  });
  it('les compteurs de l’écran « 20 % à restituer » ne changent pas', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-categorie="manquantes"] [data-vgp-compteur]')?.textContent).toBe('1');
    expect(container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-compteur]')?.textContent).toBe('1');
  });
});

/** 🔴 Arno (25/11/2026) — « renommer « En attente » en « AGO > 1 mois – En attente » et « À préparer » en « AGO < 1 mois – À préparer » » ; classement inchangé. */
describe('🔴 Arno (25/11/2026) — les titres « AGO > 1 mois – En attente » et « AGO < 1 mois – À préparer »', () => {
  const L = (sortieId: number, ago: string, limite: string, statut: 'officielle' | 'projetee') => ({ ...LU.lignes[0], sortieId, lotId: sortieId, locataires: [`LOC ${sortieId}`], cleCopro: 'copro-10',
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: ago, statut }, incertaine: false, limite, alerte: 'a_venir' as const, joursRestants: 0 } });
  it('titres et noms accessibles ; 🔴 (25/11) une AGO officielle lointaine va dans « AGO > 1 mois – En attente » ; l’ancien intitulé seul n’apparaît plus', async () => {
    donnees = { ...LU, faites: [], lignes: [...LU.lignes, L(13, '2026-12-10', '2027-01-10', 'projetee'), L(14, '2027-09-01', '2027-10-01', 'officielle')] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const titre = (cat: string) => container.querySelector(`[data-vgp-categorie="${cat}"] summary`)?.firstChild?.textContent;
    expect(titre('a_preparer')).toBe('AGO < 1 mois – À préparer');
    expect(titre('en_attente')).toBe('AGO > 1 mois – En attente');
    expect(container.querySelector('[data-vgp-categorie="a_preparer"]')?.getAttribute('aria-label')).toBe('AGO < 1 mois – À préparer');
    expect(container.querySelector('[data-vgp-categorie="en_attente"]')?.getAttribute('aria-label')).toBe('AGO > 1 mois – En attente');
    expect([...container.querySelectorAll('[data-vgp-categorie="a_preparer"] [data-vgp-sortie]')].map((x) => x.getAttribute('data-vgp-sortie'))).toEqual(['13']);
    expect([...container.querySelectorAll('[data-vgp-categorie="en_attente"] [data-vgp-sortie]')].map((x) => x.getAttribute('data-vgp-sortie'))).toEqual(['5', '14']); // par date limite : 25/04/2027 puis 01/10/2027
    const texte = (container.textContent ?? '').replace(/AGO [<>] 1 mois – (À préparer|En attente)/g, '');
    expect(texte).not.toMatch(/À préparer|En attente/);
  });
  it('le mail du lundi ne cite pas ces titres (rien à renommer)', () => {
    expect(readFileSync('app/lib/location/alerteVingt.ts', 'utf8')).not.toMatch(/À préparer|En attente/);
  });
});

/**
 * 🔴 Arno (25/11/2026) — « n'afficher la ligne "Alerte du lundi" que si elle contient un locataire » ; 🔴🔴 (25/11) remplacée par la catégorie
 * « Alerte restitution en retard », elle aussi ABSENTE SI VIDE (recherche comprise).
 */
describe('🔴🔴 Arno (25/11/2026) — « Alerte restitution en retard » : une catégorie, absente si vide', () => {
  const taper = async (v: string) => {
    const el = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  it('personne en retard : catégorie absente (et son espace) ; « Urgence » suit « Dates / copropriétés manquantes »', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-categorie="retard"]')).toBeNull();
    expect([...container.querySelectorAll('section')].map((s) => s.getAttribute('aria-label')).slice(0, 2)).toEqual(['Dates / copropriétés manquantes', 'Urgence']);
  });
  it('une ligne en retard : catégorie présente, comme les autres (compteur, capsules, ligne, « Faire restitution », « Dépassé de N jours » en rouge)', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, RETARD] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const c = container.querySelector('[data-vgp-categorie="retard"]')!;
    expect(c.querySelector('summary [data-vgp-compteur]')?.textContent).toBe('1');
    expect(c.querySelector('summary [data-vgp-compteur]')?.className).toBe('vgp-pastille');
    expect(c.querySelector('[data-vgp-capsule="officielle"]')?.textContent).toBe('AGO officielle · 1');
    const r = c.querySelector('[data-vgp-sortie="8"]')!;
    expect([r.querySelector('[data-vgp-rebours]')?.textContent, r.querySelector('[data-vgp-rebours]')?.className]).toEqual(['Dépassé de 39 jours', 'vgp-rebours vgp-rebours--rouge']);
    expect(r.querySelector('[data-vgp-restituer]')?.textContent).toBe('Faire restitution');
    // un locataire n'est que dans une catégorie
    expect(container.querySelectorAll('[data-vgp-sortie="8"]')).toHaveLength(1);
  });
  it('recherche : présente si les résultats contiennent un locataire en retard, absente sinon ; l’effacer la rend', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, RETARD] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await taper('rémi');
    expect(container.querySelector('[data-vgp-categorie="retard"]')).not.toBeNull();
    expect((container.querySelector('[data-vgp-categorie="retard"] > details') as HTMLDetailsElement).open).toBe(true);
    await taper('dupont');
    expect(container.querySelector('[data-vgp-categorie="retard"]')).toBeNull();
    await taper('');
    expect(container.querySelector('[data-vgp-categorie="retard"]')).not.toBeNull();
  });
  it('🔴 (25/11, choix d’Arno) une AGO PROJETÉE dont la date limite est passée va en « Alerte », en gardant la mention orange « AGO à confirmer — saisir la date officielle »', async () => {
    const proj = { ...RETARD, sortieId: 9, lotId: 9, locataires: ['PROJ Paul'], suivi: { ...RETARD.suivi, ago: { date: '2026-09-15', statut: 'projetee' as const } } };
    donnees = { ...LU, lignes: [...LU.lignes, proj] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-categorie="urgence"] [data-vgp-sortie="9"]')).toBeNull();
    const l = container.querySelector('[data-vgp-categorie="retard"] [data-vgp-sortie="9"]')!;
    expect(container.querySelector('[data-vgp-categorie="retard"] [data-vgp-capsule="projetee"]')?.getAttribute('data-vgp-capsule-nombre')).toBe('1');
    expect(l.querySelector('[data-vgp-ago-a-confirmer]')?.textContent).toBe('AGO à confirmer — saisir la date officielle');
    expect(l.querySelector('[data-vgp-ago-a-confirmer]')?.className).toBe('vgp-incertaine vgp-une-ligne'); // orange
    // une date provisoire (arrêté manquant) garde sa mention
    expect(container.querySelector('[data-vgp-sortie="7"] [data-vgp-incertaine]')?.textContent).toBe('date provisoire — arrêté manquant');
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « Couleur des boutons de raccourci « 20 % à restituer » : rouge si au moins 1 locataire en « Alerte restitution en retard » ;
 * sinon orange si au moins 1 en « Urgence » ; sinon couleur d'origine. Pastille unique conservée […], détail au survol mis à jour avec les trois nombres. »
 */
describe('🔴🔴 Arno (25/11/2026) — la couleur des boutons « 20 % à restituer »', () => {
  const sansUrgence = LU.lignes.filter((l) => l.sortieId !== 7);
  const bouton = () => container.querySelector('a[data-bouton-vingt-pourcent]')!;
  it('accueil Location : rouge (un en retard), orange (une urgence, aucun retard), d’origine (ni l’un ni l’autre)', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, RETARD] };
    await rendre(createElement(BoutonVingtPourcent));
    expect([bouton().getAttribute('data-vgp-niveau'), bouton().className]).toEqual(['rouge', 'svv-btn svv-btn-outline gst-btn bvp bvp--rouge']);
    // total = 1 retard + 1 urgence (DURAND Léo) + 1 copropriété ; le détail dit les trois
    const p = bouton().querySelector('[data-pastille-vingt-total]')!;
    expect([p.textContent, p.getAttribute('title')]).toEqual(['3', '1 locataire en retard de restitution · 1 locataire en urgence · 1 copropriété à compléter']);
    act(() => root.unmount()); root = createRoot(container);
    donnees = LU;
    await rendre(createElement(BoutonVingtPourcent));
    expect([bouton().getAttribute('data-vgp-niveau'), bouton().className]).toEqual(['orange', 'svv-btn svv-btn-outline gst-btn bvp bvp--orange']);
    act(() => root.unmount()); root = createRoot(container);
    donnees = { ...LU, lignes: sansUrgence };
    await rendre(createElement(BoutonVingtPourcent));
    expect([bouton().getAttribute('data-vgp-niveau'), bouton().className]).toEqual(['origine', 'svv-btn svv-btn-outline gst-btn bvp']);
    expect(bouton().querySelector('[data-pastille-vingt-total]')?.textContent).toBe('1'); // la copropriété à compléter
  });
  it('couleurs lisibles en clair et en sombre : paires de jetons fond / texte (rouge-soft / red-dark, orange-soft / orange), liseré coloré', () => {
    const b = readFileSync('app/(admin)/admin/(protected)/location/BoutonVingtPourcent.tsx', 'utf8');
    expect(b).toContain('.bvp.bvp--rouge{background:var(--color-svv-red-soft);border-color:var(--color-svv-red);color:var(--color-svv-red-dark)}');
    expect(b).toContain('.bvp.bvp--orange{background:var(--color-svv-orange-soft);border-color:var(--color-svv-urgence-orange);color:var(--color-svv-orange)}');
    const c = readFileSync('app/(admin)/admin/(protected)/gestion/ColonneMode.tsx', 'utf8');
    expect(c).toContain('.cm-entree.cm-entree--vgp-rouge{background:var(--color-svv-red-soft);border-color:var(--color-svv-red);color:var(--color-svv-red-dark)}');
    expect(c).toContain('.cm-entree.cm-entree--vgp-orange{background:var(--color-svv-orange-soft);border-color:var(--color-svv-urgence-orange);color:var(--color-svv-orange)}');
    // contraste mesuré sur les vraies valeurs des jetons (clair, puis sombre)
    const css = readFileSync('app/globals.css', 'utf8');
    const v = (n: string): string[] => [...css.matchAll(new RegExp(`${n}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
    const lum = (h: string): number => { const [r, g, bb] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * bb; };
    const ct = (a: string, bb: string): number => { const [x, y] = [lum(a), lum(bb)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const i of [0, 1]) {
      expect(ct(v('--color-svv-red-dark')[i], v('--color-svv-red-soft')[i])).toBeGreaterThanOrEqual(4.5);
      expect(ct(v('--color-svv-orange')[i], v('--color-svv-orange-soft')[i])).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('colonne de gauche de la Gestion : même règle (rouge / orange / d’origine), lue sur la même pastille', () => {
    const s = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    const entree = s.slice(s.indexOf('{onVingtPourcent && ('), s.indexOf('{onSyndics && ('));
    expect(entree).toContain("className={`cm-entree${p.niveau !== null ? ` cm-entree--vgp-${p.niveau}` : ''}`}");
    expect(entree).toContain("data-vgp-niveau={p.niveau ?? 'origine'}");
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8')).toContain('vingtRetards={pastillesVingt.retards}');
  });
});

/** 🔴 Arno (25/11/2026) — renommer « AG passée — restitution à faire » en « AGO passée — restitution à faire » partout ; règles inchangées. */
describe('🔴 Arno (25/11/2026) — « AGO passée — restitution à faire »', () => {
  it('titre et nom accessible ; la ligne d’AGO du 10/11 y reste (règle inchangée) ; l’ancien intitulé n’apparaît plus, ni à l’écran ni dans le mail', async () => {
    const L12 = { ...LU.lignes[0], sortieId: 12, lotId: 12, locataires: ['PASSEE Paul'], cleCopro: 'copro-10',
      suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: '2026-11-10', statut: 'officielle' as const }, incertaine: false, limite: '2026-12-10', alerte: 'a_venir' as const, joursRestants: 17 } };
    donnees = { ...LU, lignes: [...LU.lignes, L12] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const c = container.querySelector('[data-vgp-categorie="ag_passee"]')!;
    expect(c.getAttribute('aria-label')).toBe('AGO passée — restitution à faire');
    expect(c.querySelector('summary')?.firstChild?.textContent).toBe('AGO passée — restitution à faire');
    expect([...c.querySelectorAll('[data-vgp-sortie]')].map((x) => x.getAttribute('data-vgp-sortie'))).toEqual(['12']);
    expect(container.textContent).not.toMatch(/(^|[^O])AG passée/);
    for (const f of ['app/lib/location/vingtPourcent.ts', 'app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'app/lib/location/alerteVingt.ts'])
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/\bAG passée/);
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « lorsque l'on clique sur l'un des deux cartouches AGO à droite de la ligne de catégorie, il ne doit s'afficher que les
 * locataires concernés par ce statut, et pas l'autre ; lorsque l'on clique ailleurs sur la ligne, ne pas changer le comportement actuel ».
 */
describe('🔴🔴 Arno (25/11/2026) — les capsules AGO filtrent la catégorie', () => {
  const L = (sortieId: number, statut: 'officielle' | 'projetee', nom: string, incertaine = false) => ({ ...LU.lignes[0], sortieId, lotId: sortieId, locataires: [nom], logement: `${sortieId} rue F`,
    cleCopro: 'copro-10', arrete: incertaine ? null : { jour: 31, mois: 12 },
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: '2026-12-12', statut }, incertaine, limite: '2027-01-12', alerte: 'a_venir' as const, joursRestants: 300 } });
  // « AGO < 1 mois – À préparer » : deux officielles (dont une provisoire → projetée) ; une projetée proche
  const PREP = [L(31, 'officielle', 'OFF Anne'), L(32, 'officielle', 'PROV Bruno', true), { ...L(33, 'projetee', 'PROJ Carla'),
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: '2026-12-10', statut: 'projetee' as const }, incertaine: false, limite: '2027-01-10', alerte: 'a_venir' as const, joursRestants: 48 } }];
  const sec = () => container.querySelector('[data-vgp-categorie="a_preparer"]')!;
  const det = () => sec().querySelector('details') as HTMLDetailsElement;
  const caps = (k: string) => sec().querySelector(`summary [data-vgp-capsule="${k}"]`) as HTMLElement;
  const vues = () => [...sec().querySelectorAll('[data-vgp-sortie]')].map((x) => Number(x.getAttribute('data-vgp-sortie')));
  const cliquer = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
  const taper = async (v: string) => {
    const el = container.querySelector('[data-vgp-recherche]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
  };
  beforeEach(() => { donnees = { ...LU, lignes: [...LU.lignes, ...PREP], faites: [] }; });
  it('« AGO officielle · N » : la catégorie s’ouvre et n’affiche que ses officielles ; capsule pressée ; compteur et capsules inchangés', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(det().open).toBe(false);
    await cliquer(caps('officielle'));
    expect(det().open).toBe(true);
    expect(vues()).toEqual([31]);
    expect(caps('officielle').getAttribute('aria-pressed')).toBe('true');
    expect(caps('officielle').getAttribute('aria-label')).toBe('AGO officielle · 1 — filtre actif, cliquer pour tout afficher');
    expect(sec().querySelector('[data-vgp-filtre-actif]')?.textContent).toContain('Filtre actif : AGO officielle (1 locataire)');
    expect(sec().querySelector('summary [data-vgp-compteur]')?.textContent).toBe('3');
    expect([caps('officielle').textContent, caps('projetee').textContent]).toEqual(['AGO officielle · 1', 'AGO projetée · 2']);
  });
  it('« AGO projetée · N » : les projetées, date provisoire comprise ; l’autre capsule bascule le filtre ; la même le retire', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await cliquer(caps('projetee'));
    expect(vues().sort((a, b) => a - b)).toEqual([32, 33]);
    await cliquer(caps('officielle'));
    expect(vues()).toEqual([31]);
    expect(caps('projetee').getAttribute('aria-pressed')).toBe('false');
    await cliquer(caps('officielle')); // même capsule : filtre retiré, tout le contenu ; la catégorie reste ouverte
    expect(vues().sort((a, b) => a - b)).toEqual([31, 32, 33]);
    expect(det().open).toBe(true);
    expect(sec().querySelector('[data-vgp-filtre-actif]')).toBeNull();
  });
  it('un clic ailleurs sur l’en-tête : comportement d’avant (ouvrir / fermer) et filtre retiré', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await cliquer(caps('officielle'));
    expect(vues()).toEqual([31]);
    await cliquer(sec().querySelector('summary [data-vgp-compteur]')!); // ailleurs sur l'en-tête : la catégorie se ferme
    expect(det().open).toBe(false);
    await cliquer(sec().querySelector('summary')!); // et se rouvre avec TOUT le contenu
    expect(det().open).toBe(true);
    expect(vues().sort((a, b) => a - b)).toEqual([31, 32, 33]);
    expect(sec().getAttribute('data-vgp-filtre')).toBe('');
  });
  it('capsule à 0 : grisée, pas un bouton, le clic ne fait rien (ni filtre, ni ouverture)', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const zero = container.querySelector('[data-vgp-categorie="en_attente"] [data-vgp-capsule="officielle"]')!;
    expect([zero.tagName, zero.className, zero.textContent]).toEqual(['SPAN', 'vgp-capsule vgp-capsule--zero', 'AGO officielle · 0']);
    await cliquer(zero);
    expect((container.querySelector('[data-vgp-categorie="en_attente"] > details') as HTMLDetailsElement).open).toBe(false);
    // les capsules non nulles sont des boutons, utilisables au clavier
    expect(caps('officielle').tagName).toBe('BUTTON');
    expect(caps('officielle').getAttribute('type')).toBe('button');
  });
  it('se combine avec la recherche ; propre à chaque catégorie ; retiré quand la recherche est effacée', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await cliquer(caps('projetee'));
    await taper('carla'); // la recherche ne garde que PROJ Carla : le filtre « projetée » tient
    expect(vues()).toEqual([33]);
    expect(caps('projetee').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-vgp-categorie="en_attente"]')?.getAttribute('data-vgp-filtre') ?? '').toBe(''); // les autres catégories : sans filtre
    await taper('');
    expect(sec().getAttribute('data-vgp-filtre')).toBe('');
    expect(det().open).toBe(false); // tout se replie (décision du 25/11), filtre compris
    await act(async () => { det().open = true; det().dispatchEvent(new Event('toggle')); });
    expect(vues().sort((a, b) => a - b)).toEqual([31, 32, 33]);
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « lorsque l'on enregistre la validation de restitution, il faut afficher une modale qui indique qu'en confirmant son choix
 * l'utilisateur confirme que la restitution de la somme d'argent est effective, que ce locataire sortira du suivi de restitution et qu'il passera
 * dans l'historique "Restitutions faites" ».
 */
describe('🔴🔴 Arno (25/11/2026) — la confirmation avant d’enregistrer une restitution', () => {
  let posts: Record<string, unknown>[];
  let resoudre: (() => void) | null;
  beforeEach(() => {
    posts = []; resoudre = null;
    donnees = { ...LU, restitutionDisponible: true, faites: [], lignes: [{ ...LU.lignes[0], contacts: { locataires: [{ nom: 'Alice DUPONT', email: null, telephone: null }], proprietaires: [] } }, LU.lignes[1], LU.lignes[2]] };
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        await new Promise<void>((r) => { resoudre = r; }); // l'enregistrement « prend du temps » : un double clic tombe pendant l'envoi
        return { status: 200, json: async () => ({ etat: 'ok', data: { id: 1 } }) } as Response;
      }
      lectures.push(String(u));
      return { status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as Response;
    }) as unknown as typeof fetch;
  });
  const saisir = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const ouvrir = async (montant: string, retenu = '') => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await act(async () => { (container.querySelector('[data-vgp-restituer="5"]') as HTMLButtonElement).click(); });
    const f = container.querySelector('[data-fenetre-restitution="5"]')!;
    await act(async () => { saisir(f.querySelector('[data-restitution-montant]') as HTMLInputElement, montant); });
    if (retenu !== '') await act(async () => { saisir(f.querySelector('[data-restitution-retenu]') as HTMLInputElement, retenu); });
    await act(async () => { saisir(f.querySelector('[data-restitution-commentaire]') as HTMLTextAreaElement, 'Virement _TEST'); });
    await act(async () => { (f.querySelector('[data-restitution-enregistrer]') as HTMLButtonElement).click(); });
    return f;
  };
  const conf = () => container.querySelector('[data-confirmation-restitution="5"]');
  it('après les contrôles du formulaire : la confirmation, son titre et son texte (sans montant retenu) ; rien n’est écrit', async () => {
    await ouvrir('312,50');
    expect(conf()?.querySelector('[role="alertdialog"] h2')?.textContent).toBe('Confirmer la restitution');
    expect([...conf()!.querySelectorAll('[data-confirmation-texte]')].map((p) => p.textContent)).toEqual([
      'En confirmant, vous attestez que la restitution de 312,50 € à Alice DUPONT a bien été effectuée le 23/11/2026. Ce locataire sortira du suivi des 20 % et passera dans l’historique « Restitutions faites ».']);
    expect([...conf()!.querySelectorAll('button')].map((b) => [b.textContent, b.className])).toEqual([
      ['Revenir', 'svv-btn svv-btn-outline gst-btn'], ['Confirmer la restitution', 'svv-btn svv-btn-primary gst-btn']]);
    expect(posts).toEqual([]);
  });
  it('un formulaire incomplet ne va pas jusqu’à la confirmation (contrôles habituels)', async () => {
    await ouvrir('');
    expect(conf()).toBeNull();
    expect(container.querySelector('[data-restitution-refus]')?.textContent).toContain('Indiquez le montant restitué');
  });
  it('avec un montant retenu : la phrase « Montant retenu au titre des charges : … € »', async () => {
    await ouvrir('300', '40');
    expect([...conf()!.querySelectorAll('[data-confirmation-texte]')].map((p) => p.textContent)).toEqual([
      'En confirmant, vous attestez que la restitution de 300,00 € à Alice DUPONT a bien été effectuée le 23/11/2026. Ce locataire sortira du suivi des 20 % et passera dans l’historique « Restitutions faites ».',
      'Montant retenu au titre des charges : 40,00 €.']);
  });
  it('« Revenir » : la confirmation se ferme, rien n’est écrit, la saisie est conservée', async () => {
    const f = await ouvrir('312,50', '40');
    await act(async () => { (container.querySelector('[data-confirmation-revenir]') as HTMLButtonElement).click(); });
    expect(conf()).toBeNull();
    expect(posts).toEqual([]);
    expect([(f.querySelector('[data-restitution-montant]') as HTMLInputElement).value, (f.querySelector('[data-restitution-retenu]') as HTMLInputElement).value,
      (f.querySelector('[data-restitution-commentaire]') as HTMLTextAreaElement).value]).toEqual(['312,50', '40', 'Virement _TEST']);
    expect(container.querySelector('[data-fenetre-restitution="5"]')).not.toBeNull();
  });
  it('« Confirmer la restitution » : UN enregistrement, même sur un double clic ; puis la fenêtre se ferme et la liste se relit', async () => {
    await ouvrir('312,50');
    const b = container.querySelector('[data-confirmation-confirmer]') as HTMLButtonElement;
    await act(async () => { b.click(); b.click(); });
    await act(async () => { b.click(); });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual({ action: 'restitution-20-faite', sortieId: 5, date: '2026-11-23', montantRestitue: '312,50', montantRetenuCharges: '', commentaire: 'Virement _TEST' });
    await act(async () => { resoudre?.(); }); await calmer();
    expect(container.querySelector('[data-fenetre-restitution]')).toBeNull();
    expect(lectures).toHaveLength(2);
  });
  it('colocataires : « A et B », au pluriel ; l’annulation depuis « Restitutions faites » est inchangée (sans confirmation nouvelle)', () => {
    expect(texteConfirmationRestitution({ noms: ['Paul MARTIN', 'Léa MARTIN'], date: '2026-11-20', montantRestitue: 100, montantRetenuCharges: null })).toEqual([
      'En confirmant, vous attestez que la restitution de 100,00 € à Paul MARTIN et Léa MARTIN a bien été effectuée le 20/11/2026. Ces locataires sortiront du suivi des 20 % et passeront dans l’historique « Restitutions faites ».']);
    const src = readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8');
    expect(src).toContain("const motif = await geste({ action: 'restitution-20-annuler', restitutionId: id });");
  });
});

/** 🔴 Arno (25/11/2026) — le compteur de « AGO passée » et de « AGO < 1 mois – À préparer » : une pastille à fond VERT, comme les rouges des autres. */
describe('🔴 Arno (25/11/2026) — pastilles vertes de « AGO passée » et « AGO < 1 mois – À préparer »', () => {
  const L = (sortieId: number, ago: string, limite: string) => ({ ...LU.lignes[0], sortieId, lotId: sortieId, locataires: [`V ${sortieId}`], cleCopro: 'copro-10',
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: ago, statut: 'officielle' as const }, incertaine: false, limite, alerte: 'a_venir' as const, joursRestants: 0 } });
  it('vertes quand la catégorie a des locataires ; grises à 0 ; les autres catégories gardent leur pastille (rouge / grise)', async () => {
    donnees = { ...LU, lignes: [...LU.lignes, L(12, '2026-11-10', '2026-12-10'), L(13, '2026-12-12', '2027-01-12')] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const cls = (cat: string) => container.querySelector(`[data-vgp-categorie="${cat}"] summary [data-vgp-compteur]`)?.className;
    expect(cls('ag_passee')).toBe('vgp-pastille vgp-pastille--vert');
    expect(cls('a_preparer')).toBe('vgp-pastille vgp-pastille--vert');
    expect(cls('urgence')).toBe('vgp-pastille');
    expect(cls('en_attente')).toBe('loc-pastille');
    act(() => root.unmount()); root = createRoot(container);
    donnees = LU;
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    expect(container.querySelector('[data-vgp-categorie="ag_passee"] summary [data-vgp-compteur]')?.className).toBe('loc-pastille');
  });
  it('texte lisible en clair et en sombre : chiffre --color-svv-surface sur --color-svv-green-ink (≥ 4,5:1)', () => {
    expect(readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8')).toContain('.vgp-pastille.vgp-pastille--vert{background:var(--color-svv-green-ink)}');
    const css = readFileSync('app/globals.css', 'utf8');
    const v = (n: string): string[] => [...css.matchAll(new RegExp(`${n}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]);
    const lum = (h: string): number => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ct = (a: string, b: string): number => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    for (const i of [0, 1]) expect(ct(v('--color-svv-surface')[i], v('--color-svv-green-ink')[i]), `thème ${i}`).toBeGreaterThanOrEqual(4.5);
  });
});

/** 🔴 Arno (25/11/2026) — en plus de la pastille rouge, une pastille VERTE en haut à gauche des boutons : « AGO passée » + « AGO < 1 mois – À préparer ». */
describe('🔴 Arno (25/11/2026) — la pastille verte des boutons « 20 % à restituer »', () => {
  const L = (sortieId: number, ago: string, limite: string, locataires = [`V ${sortieId}`]) => ({ ...LU.lignes[0], sortieId, lotId: sortieId, locataires, cleCopro: 'copro-10',
    suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: ago, statut: 'officielle' as const }, incertaine: false, limite, alerte: 'a_venir' as const, joursRestants: 0 } });
  // 1 en « AGO passée » + 2 en « AGO < 1 mois – À préparer » (une colocation de deux) = 3
  const AVEC = [...LU.lignes, L(12, '2026-11-10', '2026-12-10'), L(13, '2026-12-12', '2027-01-12', ['CO Un', 'CO Deux'])];
  const bouton = () => container.querySelector('a[data-bouton-vingt-pourcent]')!;
  it('accueil Location : pastille verte en haut à gauche (1 + 2 = 3), la rouge inchangée en haut à droite ; détail « 3 restitutions à préparer ou à faire »', async () => {
    donnees = { ...LU, lignes: AVEC };
    await rendre(createElement(BoutonVingtPourcent));
    const v = bouton().querySelector('[data-pastille-vingt-preparer]')!;
    expect([v.textContent, v.className, v.getAttribute('title')]).toEqual(['3', 'bvp-pastille bvp-pastille--vert', '3 restitutions à préparer ou à faire']);
    const r = bouton().querySelector('[data-pastille-vingt-total]')!;
    expect([r.textContent, r.className]).toEqual(['2', 'bvp-pastille']); // DURAND Léo (urgence) + 1 copropriété : inchangée
    expect(bouton().getAttribute('aria-label')).toBe('20 % à restituer — 0 locataire en retard de restitution · 1 locataire en urgence · 1 copropriété à compléter · 3 restitutions à préparer ou à faire');
    expect(bouton().getAttribute('data-vgp-niveau')).toBe('orange'); // couleur du bouton inchangée (urgence → orange)
    const css = readFileSync('app/(admin)/admin/(protected)/location/BoutonVingtPourcent.tsx', 'utf8');
    expect(css).toContain('.bvp-pastille.bvp-pastille--vert{right:auto;left:-8px;background:var(--color-svv-green-ink)}');
  });
  it('masquée à 0 ; singulier « 1 restitution à préparer ou à faire »', async () => {
    await rendre(createElement(BoutonVingtPourcent));
    expect(bouton().querySelector('[data-pastille-vingt-preparer]')).toBeNull();
    act(() => root.unmount()); root = createRoot(container);
    donnees = { ...LU, lignes: [...LU.lignes, L(12, '2026-11-10', '2026-12-10')] };
    await rendre(createElement(BoutonVingtPourcent));
    expect(bouton().querySelector('[data-pastille-vingt-preparer]')?.getAttribute('title')).toBe('1 restitution à préparer ou à faire');
  });
  it('colonne de gauche de la Gestion : la verte à gauche de la rouge, même nombre et même détail ; la rouge inchangée', () => {
    const s = readFileSync('app/(admin)/admin/(protected)/gestion/PleinEcranBoite.tsx', 'utf8');
    const entree = s.slice(s.indexOf('{onVingtPourcent && ('), s.indexOf('{onSyndics && ('));
    expect(entree.indexOf('cm-pastille-vert')).toBeLessThan(entree.indexOf('cm-pastille-vif'));
    expect(entree).toContain('data-pastille-vingt-preparer={vingtAPreparer} title={detailAPreparer(vingtAPreparer)} aria-label={detailAPreparer(vingtAPreparer)}');
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8')).toContain('vingtAPreparer={pastillesVingt.aPreparer}');
    expect(readFileSync('app/(admin)/admin/(protected)/gestion/ColonneMode.tsx', 'utf8')).toContain('.cm-pastille-jour.cm-pastille-vert{background:var(--color-svv-green-ink)}');
  });
});

/** 🔴 Arno (25/11/2026, retrait accordé) — plus de rubrique « Arrêté des comptes » dans le détail déplié : doublon de « Exercice clos le … ». */
describe('🔴 Arno (25/11/2026) — « Arrêté des comptes » retiré du détail', () => {
  it('le détail : Copropriété, Date de sortie, Exercice concerné, Dernière AGO ; l’exercice dit la clôture, ou que l’arrêté manque', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const a = container.querySelector('[data-vgp-sortie="5"] [data-vgp-detail]')!;
    expect([...a.querySelectorAll('dt')].map((x) => x.textContent)).not.toContain('Arrêté des comptes');
    expect(a.querySelector('[data-vgp-exercice]')?.textContent).toBe('Exercice clos le 31/12/2026');
    expect(container.querySelector('[data-vgp-sortie="7"] [data-vgp-exercice]')?.textContent).toBe('Exercice inconnu (date d’arrêté des comptes manquante)');
    expect(container.querySelectorAll('[data-vgp-arrete]')).toHaveLength(0);
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « Bouton « Envoyer un mail », aligné à droite sur la ligne « LOCATAIRE / PROPRIÉTAIRE » du détail. Clic : notre module d'envoi de
 * mail EXISTANT […] s'ouvre juste en dessous, à l'intérieur de la ligne dépliée ; nouveau clic ou « Fermer » le replie. » Décisions 1A et 2A.
 */
describe('🔴🔴 Arno (25/11/2026) — « Envoyer un mail » dans la ligne dépliée', () => {
  const CONTACTS = { locataires: [{ nom: 'Alice DUPONT', email: 'alice@exemple.test', emails: ['alice@exemple.test'], telephone: null }],
    proprietaires: [{ nom: 'Jean DURAND', email: 'jean@exemple.test', emails: ['jean@exemple.test'], telephone: null }] };
  const CONTEXTE = { schemaPret: true, peutEnvoyer: true, jetonPresent: true, signature: '— Gestion', signatureHtml: '<p>— Gestion</p>', nomExpediteur: 'CRITERIMMO',
    adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 10 } as never;
  beforeEach(() => {
    redaction.mockClear(); nouveauDepuisLeBien.mockClear();
    donnees = { ...LU, lignes: [{ ...LU.lignes[0], lotCle: 'L1', contacts: CONTACTS }, { ...LU.lignes[1], contacts: { locataires: [{ nom: 'Léo DURAND', email: 'leo@exemple.test', emails: ['leo@exemple.test'], telephone: null }], proprietaires: [] } }, LU.lignes[2]] };
  });
  const ligne = () => container.querySelector('[data-vgp-sortie="5"]')!;
  it('le bouton est à droite de la ligne « Locataire / Propriétaire » du détail', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE } }));
    const rangee = ligne().querySelector('[data-vgp-detail] .vgp-coords-ligne')!;
    expect([...rangee.children].map((c) => c.className)).toEqual(['vgp-coords', 'svv-btn svv-btn-outline gst-btn vgp-envoyer-mail']);
    expect(rangee.querySelector('[data-vgp-envoyer-mail]')?.textContent).toBe('Envoyer un mail');
  });
  it('Gestion : un clic ouvre LE module existant (Redaction) dans la ligne, le bien pré-coché, la sortie marquée ; un nouveau clic le referme par sa porte', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE } }));
    await act(async () => { (ligne().querySelector('[data-vgp-envoyer-mail]') as HTMLButtonElement).click(); }); await calmer();
    const m = ligne().querySelector('[data-vgp-mail="5"]')!;
    expect(m.querySelector('[data-stub-redaction]')).not.toBeNull();
    expect(nouveauDepuisLeBien).toHaveBeenCalledWith({ lotId: 1, cle: 'L1', libelle: '1 rue A, 92800 Puteaux' });
    const p = redaction.mock.calls.at(-1)![0] as { brouillon: { vingtPourcent: unknown; cibles: unknown[] }; lotFiche: number; contexte: unknown };
    expect(p.brouillon.vingtPourcent).toEqual({ sortieId: 5 });
    expect(p.lotFiche).toBe(1);
    expect(p.contexte).toBe(CONTEXTE);
    expect(ligne().querySelector('[data-vgp-envoyer-mail]')?.getAttribute('aria-expanded')).toBe('true');
    // nouveau clic : la demande de fermeture passe à l'éditeur (c'est lui qui décide du brouillon) ; il rend la main → replié
    await act(async () => { (ligne().querySelector('[data-vgp-envoyer-mail]') as HTMLButtonElement).click(); });
    expect(m.querySelector('[data-stub-redaction]')?.getAttribute('data-fermeture')).toBe('1');
    await act(async () => { (m.querySelector('[data-stub-fermer]') as HTMLButtonElement).click(); });
    expect(ligne().querySelector('[data-vgp-mail]')).toBeNull();
  });
  it('« Fermer » sous le module : même porte ; rien n’est envoyé (aucun POST)', async () => {
    const methodes: string[] = [];
    const f = global.fetch; global.fetch = vi.fn(async (u: string | URL | Request, i?: RequestInit) => { methodes.push(i?.method ?? 'GET'); return f(u, i); }) as unknown as typeof fetch;
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE } }));
    await act(async () => { (ligne().querySelector('[data-vgp-envoyer-mail]') as HTMLButtonElement).click(); }); await calmer();
    await act(async () => { (ligne().querySelector('[data-vgp-mail-fermer]') as HTMLButtonElement).click(); });
    expect(ligne().querySelector('[data-stub-redaction]')?.getAttribute('data-fermeture')).toBe('1');
    expect(methodes.every((m) => m === 'GET')).toBe(true);
  });
  it('un mail par locataire, contrôlé à l’écran : deux locataires dans le même mail → le motif s’affiche au-dessus du module', async () => {
    donnees = { ...donnees, lignes: [{ ...donnees.lignes[0], contacts: { ...CONTACTS, locataires: [...CONTACTS.locataires, { nom: 'Léo DURAND', email: 'leo@exemple.test', emails: ['leo@exemple.test'], telephone: null }] } }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE } }));
    await act(async () => { (ligne().querySelector('[data-vgp-envoyer-mail]') as HTMLButtonElement).click(); }); await calmer();
    expect(ligne().querySelector('[data-vgp-mail-refus]')).toBeNull();
    await act(async () => { (ligne().querySelector('[data-stub-deux-locataires]') as HTMLButtonElement).click(); });
    expect(ligne().querySelector('[data-vgp-mail-refus]')?.textContent).toBe('Un mail par locataire : ce message s’adresse à plusieurs locataires. Écrivez à chacun séparément.');
  });
  it('Location : le bouton reste à la même place et mène à la même ligne sur l’écran Gestion, module déplié ; aucun module ici', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const b = ligne().querySelector('[data-vgp-envoyer-mail]')!;
    expect([b.tagName, b.getAttribute('href')]).toEqual(['A', '/admin/gestion?ecran=vingt_pourcent&vingtMail=5']);
    expect(redaction).not.toHaveBeenCalled();
  });
  it('Gestion sans droit d’envoi : bouton inactif, qui dit pourquoi', async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: null }));
    const b = ligne().querySelector('[data-vgp-envoyer-mail]') as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toContain('Envoi indisponible');
  });
  it('arrivée depuis la Location (?vingtMail=5) : la catégorie et la ligne s’ouvrent, module déplié', async () => {
    window.history.replaceState(null, '', '/admin/gestion?ecran=vingt_pourcent&vingtMail=5');
    try {
      await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE } }));
      await calmer();
      expect((container.querySelector('[data-vgp-categorie="en_attente"] > details') as HTMLDetailsElement).open).toBe(true);
      expect(ligne().getAttribute('data-vgp-ouvert')).toBe('1');
      expect(ligne().querySelector('[data-stub-redaction]')).not.toBeNull();
    } finally { window.history.replaceState(null, '', '/'); }
  });
  it('la Gestion passe son module d’envoi à l’écran ; le module part avec la marque de la sortie', () => {
    const g = readFileSync('app/(admin)/admin/(protected)/gestion/GestionVue.tsx', 'utf8');
    expect(g).toContain('mail={redaction !== null && redaction.schemaPret && redaction.peutEnvoyer ? { contexte: redaction,');
    const r = readFileSync('app/(admin)/admin/(protected)/gestion/Redaction.tsx', 'utf8');
    expect(r).toContain('vingtPourcent: b.vingtPourcent != null ? { sortieId: b.vingtPourcent.sortieId, modele: b.vingtPourcent.modele ?? null } : undefined,');
    expect(readFileSync('app/(admin)/admin/(protected)/location/VingtPourcentPage.tsx', 'utf8')).not.toContain('mail=');
  });
});

/** 🔴🔴 Arno (25/11/2026) — les quatre modèles au choix dans le module : destinataires d'office (modifiables), un module par locataire pour le modèle d. */
describe('🔴🔴 Arno (25/11/2026) — les modèles du module « Envoyer un mail »', () => {
  const CONTEXTE = { schemaPret: true, peutEnvoyer: true, jetonPresent: true, signature: '— Gestion', signatureHtml: '<p>— Gestion</p>', nomExpediteur: 'CRITERIMMO',
    adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 10 } as never;
  const LOCS = [{ nom: 'Alice DUPONT', email: 'alice@exemple.test', emails: ['alice@exemple.test'], telephone: null }, { nom: 'Léo DUPONT', email: 'leo@exemple.test', emails: ['leo@exemple.test'], telephone: null }];
  beforeEach(() => {
    redaction.mockClear();
    donnees = { ...LU, lignes: [{ ...LU.lignes[0], lotCle: 'L1', locataires: ['DUPONT Alice', 'DUPONT Léo'],
      contacts: { locataires: LOCS, proprietaires: [{ nom: 'Jean DURAND', nomCivil: 'M. Jean DURAND', email: 'jean@exemple.test', emails: ['jean@exemple.test'], telephone: null }] } }] };
  });
  const ouvrir = async () => {
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE } }));
    await act(async () => { (container.querySelector('[data-vgp-sortie="5"] [data-vgp-envoyer-mail]') as HTMLButtonElement).click(); }); await calmer();
  };
  // la liste verte de la Location (ListeChoix) : ouvrir, puis cliquer l'option
  const choisir = async (v: string) => {
    await act(async () => { (container.querySelector('[data-vgp-mail-modele]') as HTMLButtonElement).click(); });
    await act(async () => { (document.querySelector(`[role="option"][data-option="${v}"]`) as HTMLElement).click(); });
  };
  const modules = () => [...container.querySelectorAll('[data-stub-redaction]')].map((x) => x.getAttribute('data-stub-redaction'));
  const derniers = (n: number) => redaction.mock.calls.slice(-n).map((c) => c[0] as { brouillon: { a: string[]; cc: string[]; objet: string; corps: string; vingtPourcent: unknown } });
  it('le sélecteur : « Message libre » puis les quatre modèles, dans cet ordre', async () => {
    await ouvrir();
    await act(async () => { (container.querySelector('[data-vgp-mail-modele]') as HTMLButtonElement).click(); });
    expect([...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.replace('✓', ''))).toEqual(['Message libre',
      'Syndic — date de la prochaine AGO', 'Propriétaire — date de la prochaine AGO', 'Syndic, propriétaire(s) en copie — date de la prochaine AGO', 'Locataire — restitution du solde effectuée']);
  });
  it('a. le syndic en « À » ; b. le propriétaire ; c. le syndic, le propriétaire EN COPIE ; texte et objet du modèle, signature dessous', async () => {
    await ouvrir();
    await choisir('syndic');
    expect(modules()).toEqual(['syndic@exemple.test']);
    let b = derniers(1)[0].brouillon;
    expect(b.objet).toBe('Date de la prochaine AGO — 1 rue A, 92800 Puteaux');
    expect(b.corps).toContain('Nous sommes le cabinet CRITERIMMO, gestionnaire du lot situé 1 rue A, 92800 Puteaux, pour le compte de notre client M. Jean DURAND, copropriétaire dans cet immeuble, dont vous êtes le syndic.');
    expect(b.corps.trim().endsWith('— Gestion')).toBe(true);
    expect(b.vingtPourcent).toEqual({ sortieId: 5, modele: 'syndic' }); // 🔴 (25/11) le modèle part avec la marque
    await choisir('proprietaire');
    expect(modules()).toEqual(['jean@exemple.test']);
    expect(derniers(1)[0].brouillon.corps).toContain('Suite au départ de vos locataires Alice DUPONT et Léo DUPONT le 15/11/2026');
    await choisir('syndic_copie');
    b = derniers(1)[0].brouillon;
    expect([b.a, b.cc]).toEqual([['syndic@exemple.test'], ['jean@exemple.test']]);
    expect(b.corps).toContain('M. Jean DURAND, propriétaire, est en copie de ce mail.');
  });
  it('d. un module PAR LOCATAIRE (colocation) : chacun adressé à son seul locataire ; aucun refus « un mail par locataire »', async () => {
    await ouvrir();
    await choisir('locataire');
    expect(modules()).toEqual(['alice@exemple.test', 'leo@exemple.test']);
    expect(container.querySelector('[data-vgp-mail-refus]')).toBeNull();
    expect(derniers(2).map((p) => p.brouillon.objet)).toEqual(['Restitution du solde de votre dépôt de garantie — 1 rue A, 92800 Puteaux', 'Restitution du solde de votre dépôt de garantie — 1 rue A, 92800 Puteaux']);
    expect(container.querySelector('[data-vgp-mail]')?.textContent).toContain('Un mail par locataire : un module chacun.');
    // retour au message libre : un seul module, vide
    await choisir('');
    expect(modules()).toEqual(['']);
  });
});

/**
 * 🔴🔴 Arno (25/11/2026) — « Lorsqu'un mail a été envoyé depuis le module 20 %, il faut que cela soit indiqué dans le bloc en format fermé (x mail(s)
 * envoyé(s) depuis cette page) » ; dans le détail, la liste (date, destinataire, modèle) avec le lien vers le mail ; aucune information en doublon.
 */
// 🔴🔴 (25/11/2026) la carte de la boîte Gestion (MessageConversation) et la lecture d'un corps, doublées : le test éprouve l'écran (ordre, origine,
//    « Répondre » dans le même fil), la carte elle-même est éprouvée côté Gestion
const carte = vi.fn();
vi.mock('../gestion/Conversation', () => ({
  CSS_CONVERSATION: '',
  MessageConversation: (p: { message: { messageId: number; sens: string; de: string }; filId: number; ouvert: boolean; onBasculer: () => void; onRepondre?: (v: string) => void }) => {
    carte(p);
    return createElement('div', { 'data-stub-carte': p.message.messageId, 'data-stub-fil': p.filId, 'data-stub-ouvert': p.ouvert ? '1' : '0' },
      `${p.message.sens} ${p.message.de}`,
      p.onRepondre ? createElement('button', { 'data-stub-repondre': p.message.messageId, onClick: () => p.onRepondre!('repondre') }, 'Répondre') : null);
  },
}));
vi.mock('../gestion/chargerCorps', () => ({ chargerCorpsDuMessage: async () => ({ texte: 'Bonjour', html: null, cssMail: '' }) }));

/**
 * 🔴🔴 Arno (25/11/2026) — « la conversation doit aussi être préservée et construite ici dans la ligne dépliée du locataire » ; « par défaut une ligne
 * que l'on déploie se présente […] sans que l'espace de création de mail soit déployé, et l'historique des mails doit être directement visible » ;
 * « sous le cartouche de statut de l'AGO, on doit voir si ce bloc a fait usage de la boîte mail et combien de mails ont été échangés ».
 */
describe('🔴🔴 Arno (25/11/2026) — les échanges de la ligne', () => {
  const MAILS = [{ le: '2026-11-24T09:05', a: ['syndic@exemple.test'], copies: 1, modele: 'syndic_copie', lien: '/admin/gestion?fil=55&message=901', messageId: 901, filId: 55 },
    { le: '2026-11-25T10:12', a: ['jean@exemple.test'], copies: 0, modele: null, lien: null, messageId: null, filId: null }];
  const M = (messageId: number, sens: string, de: string, recuLe: string) => ({ messageId, sens, de, deNom: null, recuLe, objet: 'Date de la prochaine AGO',
    corps: null, extrait: '…', pieces: [], destA: [{ adresse: 'gestion@exemple.test' }], destCc: [], destinatairesFondus: null, html: null });
  const FILS: Record<string, unknown[]> = {
    55: [M(903, 'recu', 'syndic@exemple.test', '2026-11-25T08:00:00+01:00'), M(901, 'envoye', 'gestion@exemple.test', '2026-11-24T09:05:00+01:00')],
    56: [M(904, 'recu', 'jean@exemple.test', '2026-11-24T18:30:00+01:00')],
  };
  const avecFils = (): void => {
    global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET'); // LECTURE SEULE
      lectures.push(String(u));
      const f = /\/gestion\/fils\/(\d+)\/messages/.exec(String(u));
      if (f) return { ok: true, status: 200, json: async () => ({ messages: FILS[f[1]] ?? [] }) } as Response;
      return { ok: true, status: 200, json: async () => ({ etat: 'ok', data: donnees }) } as Response;
    }) as unknown as typeof fetch;
  };
  const LIGNE = () => ({ ...LU.lignes[0], mails: MAILS, echanges: { fils: [55, 56], nombre: 4, dernierLe: '2026-11-25T10:12' } });
  beforeEach(() => { carte.mockClear(); redaction.mockClear(); avecFils(); });

  it('ligne repliée : « 4 mails échangés — dernier le 25/11/2026 » SOUS la capsule AGO (singulier « 1 mail échangé ») ; rien sans échange ; plus de « envoyés depuis cette page »', async () => {
    donnees = { ...LU, lignes: [LIGNE(), { ...LU.lignes[1], echanges: { fils: [56], nombre: 1, dernierLe: '2026-11-24T18:30' } }, LU.lignes[2]] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const ago = (id: number) => container.querySelector(`[data-vgp-sortie="${id}"] .vgp-ligne-tete .vgp-ligne-ago`)!;
    expect(ago(5).querySelector('[data-vgp-mails-echanges]')?.textContent).toBe('4 mails échangés — dernier le 25/11/2026');
    expect(ago(7).querySelector('[data-vgp-mails-echanges]')?.textContent).toBe('1 mail échangé — dernier le 24/11/2026');
    // sous le cartouche de l'AGO : après l'étiquette
    const enfants = [...ago(5).children];
    expect(enfants.indexOf(ago(5).querySelector('[data-vgp-mails-echanges]')!)).toBeGreaterThan(enfants.indexOf(ago(5).querySelector('[data-vgp-ago]')!));
    expect(container.querySelector(`[data-vgp-sortie="${LU.lignes[2].sortieId}"] [data-vgp-mails-echanges]`)).toBeNull();
    expect(container.querySelector('[data-vgp-mails-envoyes]')).toBeNull();
    expect(container.textContent).not.toContain('envoyés depuis cette page');
    expect(lectures.some((u) => u.includes('/gestion/fils/'))).toBe(false); // repliée : rien n'est lu
  });

  it('ligne dépliée : « Échanges (4) » visible, tous fils mêlés du plus ancien au plus récent, le mail parti d’ici porte son modèle et son lien ; le mail pas encore capturé ; le module FERMÉ', async () => {
    donnees = { ...LU, lignes: [LIGNE()] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE_E } }));
    await act(async () => { (container.querySelector('[data-vgp-sortie="5"] [data-vgp-deplier]') as HTMLElement).click(); });
    await calmer();
    const e = container.querySelector('[data-vgp-sortie="5"] [data-vgp-detail] [data-vgp-echanges]')!;
    expect(e.querySelector('.vgp-echanges-titre')?.textContent).toBe('Échanges (4)');
    expect([...e.querySelectorAll('[data-stub-carte]')].map((c) => [c.getAttribute('data-stub-carte'), c.getAttribute('data-stub-fil')]))
      .toEqual([['901', '55'], ['904', '56'], ['903', '55']]);
    expect(e.querySelector('[data-vgp-echange="901"] [data-vgp-echange-modele]')?.textContent).toBe('Envoyé depuis cette page — Syndic, propriétaire(s) en copie — date de la prochaine AGO — Voir dans l’historique');
    expect(e.querySelector('[data-vgp-echange="903"] [data-vgp-echange-modele]')).toBeNull();
    expect(e.querySelector('[data-vgp-echange-attente]')?.textContent).toBe('25/11/2026 à 10:12 — jean@exemple.test — Message libre — dans la conversation dès la prochaine relève');
    // comme dans la boîte : le dernier mail est ouvert
    expect(e.querySelector('[data-stub-carte="903"]')?.getAttribute('data-stub-ouvert')).toBe('1');
    expect(e.querySelector('[data-stub-carte="901"]')?.getAttribute('data-stub-ouvert')).toBe('0');
    // le module d'écriture reste fermé
    expect(container.querySelector('[data-vgp-mail]')).toBeNull();
    expect(redaction).not.toHaveBeenCalled();
  });

  it('« Répondre » sur un mail : le module s’ouvre EN RÉPONSE dans le même fil (destinataire, « Re: », mail visé, fil), bien verrouillé, sortie marquée ; la règle « un mail par locataire » tient', async () => {
    donnees = { ...LU, lignes: [{ ...LIGNE(), contacts: { locataires: [{ nom: 'Alice', email: 'alice@exemple.test', telephone: null }, { nom: 'Léo', email: 'leo@exemple.test', telephone: null }], proprietaires: [] } }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE_E } }));
    await act(async () => { (container.querySelector('[data-vgp-sortie="5"] [data-vgp-deplier]') as HTMLElement).click(); });
    await calmer();
    await act(async () => { (container.querySelector('[data-stub-repondre="903"]') as HTMLElement).click(); });
    await calmer();
    const b = (redaction.mock.calls.at(-1)![0] as { brouillon: Record<string, unknown> }).brouillon;
    expect(b).toMatchObject({ voie: 'repondre', a: ['syndic@exemple.test'], repondALeMessageId: 903, filId: 55, interne: false,
      vingtPourcent: { sortieId: 5 }, cibles: [{ sorte: 'lot', id: 1, libelle: '1 rue A, 92800 Puteaux' }] });
    expect(String(b.objet)).toMatch(/^Re: /);
    expect(container.querySelector('[data-vgp-mail-modele]')).toBeNull();          // pas de modèle sur une réponse
    expect(container.querySelector('[data-vgp-mail-refus]')).toBeNull();
    // deux locataires ajoutés à la réponse : le refus d'écran (le même motif que celui du serveur)
    await act(async () => { (container.querySelector('[data-stub-deux-locataires]') as HTMLElement).click(); });
    expect(container.querySelector('[data-vgp-mail-refus]')?.textContent).toBeTruthy();
  });

  it('sans droit d’écrire (Location) : la conversation se lit, sans « Répondre »', async () => {
    donnees = { ...LU, lignes: [LIGNE()] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    await act(async () => { (container.querySelector('[data-vgp-sortie="5"] [data-vgp-deplier]') as HTMLElement).click(); });
    await calmer();
    expect(container.querySelectorAll('[data-stub-carte]')).toHaveLength(3);
    expect(container.querySelector('[data-stub-repondre]')).toBeNull();
  });

  it('🔴 (niveau 2) sans aucun échange : « Échanges (0) » et « Aucun échange pour l’instant », rien n’est lu ; le module reste fermé', async () => {
    donnees = { ...LU, lignes: [LU.lignes[0]] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE_E } }));
    await act(async () => { (container.querySelector('[data-vgp-sortie="5"] [data-vgp-deplier]') as HTMLElement).click(); });
    await calmer();
    const e = container.querySelector('[data-vgp-sortie="5"] [data-vgp-detail] [data-vgp-echanges]')!;
    expect(e.querySelector('.vgp-echanges-titre')?.textContent).toBe('Échanges (0)');
    expect(e.querySelector('[data-vgp-echanges-aucun]')?.textContent).toBe('Aucun échange pour l’instant');
    expect(lectures.some((u) => u.includes('/gestion/fils/'))).toBe(false);
    expect(container.querySelector('[data-vgp-mail]')).toBeNull();
    // l'ordre du niveau 2 : le détail (date de sortie, exercice, dernière AGO, coordonnées), PUIS les échanges
    const d = container.querySelector('[data-vgp-sortie="5"] [data-vgp-detail]')!;
    const enfants = [...d.children];
    expect(enfants.indexOf(d.querySelector('.vgp-dl')!)).toBeLessThan(enfants.indexOf(e));
  });
  it('🔴 (rappel d’Arno, 25/11) « Dates / copropriétés manquantes » : le bloc dit « N mails échangés » ; le locataire déplié montre sa conversation, « Répondre » dans le même fil', async () => {
    donnees = { ...LU, lignes: [LU.lignes[2] && { ...LU.lignes[2], mails: MAILS, echanges: { fils: [55, 56], nombre: 4, dernierLe: '2026-11-25T10:12' } }] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE_E } }));
    const bloc = container.querySelector('[data-vgp-manque="copro-20"]')!;
    expect(bloc.querySelector('.vgp-ligne-tete [data-vgp-mails-echanges]')?.textContent).toBe('4 mails échangés — dernier le 25/11/2026');
    expect(lectures.some((u) => u.includes('/gestion/fils/'))).toBe(false);          // bloc replié : rien n'est lu
    await act(async () => { (bloc.querySelector('[data-vgp-deplier]') as HTMLElement).click(); });
    await calmer();
    const r = bloc.querySelector('[data-vgp-concerne="6"] [data-vgp-concerne-echanges]')!;
    expect([...r.querySelectorAll('[data-stub-carte]')].map((c) => c.getAttribute('data-stub-carte'))).toEqual(['901', '904', '903']);
    await act(async () => { (r.querySelector('[data-stub-repondre="903"]') as HTMLElement).click(); });
    await calmer();
    expect((redaction.mock.calls.at(-1)![0] as { brouillon: Record<string, unknown> }).brouillon).toMatchObject({ voie: 'repondre', a: ['syndic@exemple.test'], repondALeMessageId: 903, filId: 55, vingtPourcent: { sortieId: 6 } });
  });
  it('sans mail : le bloc « Dates / copropriétés manquantes » ne change pas (ni mention, ni conversation)', async () => {
    donnees = { ...LU, lignes: [LU.lignes[2]] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/gestion/preavis', mail: { contexte: CONTEXTE_E } }));
    const bloc = container.querySelector('[data-vgp-manque="copro-20"]')!;
    expect(bloc.querySelector('[data-vgp-mails-echanges]')).toBeNull();
    await act(async () => { (bloc.querySelector('[data-vgp-deplier]') as HTMLElement).click(); });
    expect(bloc.querySelector('[data-vgp-concerne-echanges]')).toBeNull();
  });
  it('le modèle choisi part avec la marque (et y reste quand on modifie le message)', () => {
    const src = readFileSync('app/(admin)/admin/(protected)/location/MailVingtPourcent.tsx', 'utf8');
    expect(src).toContain('vingtPourcent: { sortieId: l.sortieId, modele: cle } };');
    expect(src).toContain('vingtPourcent: x.vingtPourcent ?? { sortieId: l.sortieId }');
  });
});
const CONTEXTE_E = { schemaPret: true, peutEnvoyer: true, jetonPresent: true, signature: '— Gestion', signatureHtml: '<p>— Gestion</p>', nomExpediteur: 'CRITERIMMO',
  adresseGestion: 'gestion@exemple.test', delaiAnnulationS: 10 } as never;

/** 🔴 Arno (25/11/2026) — le compte à rebours « J-15 » passe en rouge ; « Dépassé de N jours » reste rouge ; « AG dans N jours » reste gris. */
describe('🔴 Arno (25/11/2026) — « J-N » en rouge', () => {
  it('J-N rouge, Dépassé rouge, AG dans N jours gris ; rouge du thème (lisible en clair et en sombre)', async () => {
    const L = (sortieId: number, ago: string, limite: string, joursRestants: number) => ({ ...LU.lignes[0], sortieId, lotId: sortieId, cleCopro: 'copro-10',
      suivi: { etat: 'ok' as const, exercice: '2025-12-31', ago: { date: ago, statut: 'officielle' as const }, incertaine: false, limite, alerte: 'a_venir' as const, joursRestants } });
    donnees = { ...LU, lignes: [L(12, '2026-11-10', '2026-12-10', 17), L(13, '2026-09-01', '2026-10-01', -53), L(14, '2027-03-25', '2027-04-25', 153)] };
    await rendre(createElement(EcranVingtPourcent, { api: '/api/admin/location' }));
    const r = (id: number) => container.querySelector(`[data-vgp-sortie="${id}"] [data-vgp-rebours]`)!;
    expect([r(12).textContent, r(12).className]).toEqual(['J-17', 'vgp-rebours vgp-rebours--normal']);
    expect([r(13).textContent, r(13).className]).toEqual(['Dépassé de 53 jours', 'vgp-rebours vgp-rebours--rouge']);
    expect(r(14).className).toBe('vgp-rebours vgp-rebours--gris');
    const css = readFileSync('app/(admin)/admin/(protected)/location/VingtPourcent.tsx', 'utf8');
    expect(css).toContain('.vgp-rebours--normal{color:var(--color-svv-red)}');
    expect(css).toContain('.vgp-rebours--gris{color:var(--color-svv-muted);font-weight:700}');
  });
});
