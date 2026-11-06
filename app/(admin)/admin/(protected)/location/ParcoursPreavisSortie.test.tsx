// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BailLogement } from '../../../../lib/location/sortieLocataires';

/**
 * 🔴 Arno (06/11/2026) — LE PARCOURS « PRÉAVIS / SORTIE » EN UNE PASSE, sur les VRAIS écrans (routes simulées : rien n'est écrit, rien ne part) :
 * aucune présélection, la carte sélectionne ; Préavis ou Sortie ; « Enregistrer » (aucun mail) / « Enregistrer et envoyer les mails » ;
 * le récapitulatif (rien d'enregistré ; « Revenir » garde la saisie) ; « Confirmer » → le résultat, construit sur la réponse du serveur ; un échec
 * n'affiche jamais de succès ; après « Fermer », l'écran se relit (préavis en bleu). Les trois entrées : écran de sortie, fiche locataire, accueil.
 * Données fictives.
 */
vi.mock('../gestion/BlocHistoriqueEchanges', async (orig) => ({
  ...(await orig<typeof import('../gestion/BlocHistoriqueEchanges')>()),
  useFichePersonne: () => ({ fiche: { titre: 'X', sousTitre: null, adresses: [], occupations: [] }, erreur: null }),
  BlocHistoriqueEchanges: () => createElement('div', { 'data-stub': 'historique' }),
}));
const { EcranSortieLocataire, BlocSortieLogement } = await import('./SortieLocataires');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data, ...extra }) }) as unknown as Response;
const refus = (motif: string) => ({ ok: false, status: 400, json: async () => ({ etat: 'refus', motif }) }) as unknown as Response;
const BAIL: BailLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement', etage: '3', porte: 'G', proprietaire: 'DUPONT Jean', entree: '2022-09-01',
  locataires: [{ occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', entree: '2022-09-01' }, { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', entree: '2022-09-01' }],
  annexes: [], autresOccupants: [],
};
const HIER = (() => { const d = new Date(Date.now() - 86_400_000); return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }); })();
const HIER_FR = HIER.split('-').reverse().join('/');
const pv = (preavis: Record<number, string | null>) => ({ disponible: true, meuble: false, zoneTendue: true, dureeProposee: 1, raison: 'logement vide en zone tendue',
  locataires: BAIL.locataires.map((l) => ({ ...l, preavis: preavis[l.occupationId] == null ? null
    : { id: l.occupationId, occupationId: l.occupationId, recuLe: HIER, dateMax: preavis[l.occupationId], mode: 'mois', dureeMois: 1, motif: null, creePar: 'x', creeLe: HIER, dureeProposee: 1 } })) });
const ACCUSE = { sorte: 'preavis_locataires', objet: 'Accusé de réception de votre congé — 4 rue Fictive', a: ['alice@exemple.test', 'paul@exemple.test'], cc: ['gestion@criterimmo.fr', 'moi@exemple.test'], texte: 'Bonjour Alice et Paul,' };
const PART = { sorte: 'preavis_adhoc', objet: '[Information] Préavis reçu — 4 rue Fictive', a: ['gestion.criterimmo@gmail.com'], cc: ['gestion@criterimmo.fr', 'moi@exemple.test'], texte: 'Bonjour,' };

let container: HTMLDivElement;
let root: Root;
let posts: { corps: Record<string, unknown>; propre: boolean }[];
let preavisEnBase: Record<number, string | null>;
let reponses: Record<string, (corps: Record<string, unknown>) => Response>;
let lectures: string[];
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  posts = []; preavisEnBase = {}; lectures = [];
  reponses = {
    'apercu-preavis': () => ok({ mails: [ACCUSE, PART], sansEmail: [], enGestion: true, dateFin: '2099-01-01', envoiPossible: true }),
    'apercu-sortie': () => ok({ enGestion: true, mails: [{ sorte: 'sortie_interne', objet: 'Sortie de locataire — 4 rue Fictive', a: ['moi@exemple.test'], cc: [] },
      { sorte: 'sortie_adhoc', objet: '[Information] Sortie', a: ['gestion.criterimmo@gmail.com'], cc: ['gestion@criterimmo.fr', 'moi@exemple.test'] }] }),
    'enregistrer-preavis': (c) => {
      for (const o of c.occupationIds as number[]) preavisEnBase[o] = '2099-01-01';
      return ok({ dateMax: '2099-01-01', preavis: 1 }, c.envoyerMails === true ? { mails: { etat: 'ok', envois: [
        { ...ACCUSE, envoye: true, motif: null }, { ...PART, envoye: true, motif: null }] } } : {});
    },
    'sortie-locataires': (c) => (c.envoyerMails === false ? ok({ date: HIER, vacant: true, restants: [] }, { sansMail: true })
      : ok({ date: HIER, vacant: true, restants: [] }, { mail: { envoye: true, ignore: false, motif: null, destinataires: ['moi@exemple.test'], objet: 'Sortie de locataire' },
        adhoc: { etat: 'ok', envois: [{ sorte: 'sortie_adhoc', objet: '[Information] Sortie', a: ['gestion.criterimmo@gmail.com'], cc: ['gestion@criterimmo.fr'], envoye: true, motif: null }] } })),
  };
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    const url = String(u);
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ corps, propre: (init.headers as Record<string, string>)['x-svav-confirmation'] === 'propre' });
      return (reponses[String(corps.action)] ?? (() => ok({})))(corps);
    }
    lectures.push(url);
    if (url.includes('preavisBail=')) return ok(pv(preavisEnBase));
    // L'encart du logement n'est pas l'objet de ces épreuves : sa lecture échoue proprement (l'écran le dit).
    if (url.includes('encartBail=')) return { ok: true, status: 200, json: async () => ({ etat: 'erreur', message: 'encart non simulé' }) } as unknown as Response;
    if (url.includes('bauxLocataire=')) return ok({ enPlace: [{ occupationId: 11, adresse: '4 rue Fictive' }], sorties: [] });
    if (url.includes('destinatairesMails=')) return ok({ destinataires: [{ adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' }], copies: [] });
    return ok(BAIL);
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); vi.restoreAllMocks(); });
const calmer = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const clic = async (el: Element | null) => { expect(el).not.toBeNull(); await act(async () => { (el as HTMLElement).click(); }); await calmer(); };
const saisir = async (sel: string, v: string) => {
  const el = container.querySelector(sel) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const ecran = async (gestion = true) => { await act(async () => { root.render(createElement(EcranSortieLocataire, { occupationInitiale: 11, gestion })); }); await calmer(); };
const fenetre = () => document.querySelector('[data-fenetre-parcours]');
const choisis = () => [...container.querySelectorAll('[data-locataire].arc-bien-carte--choisi')].map((x) => x.getAttribute('data-locataire'));
const preparerPreavis = async (cartes: number[]) => {
  for (const o of cartes) await clic(container.querySelector(`[data-locataire="${o}"]`));
  await clic(container.querySelector('[data-enregistrer-un-preavis]'));
  await saisir('[data-recu-le]', HIER);
};

describe('① la sélection : aucune d’office, la carte sélectionne et désélectionne', () => {
  it('aucune carte présélectionnée ; un clic sur la carte → rouge ; un second → retirée ; plusieurs possibles', async () => {
    await ecran();
    expect(choisis()).toEqual([]);
    await clic(container.querySelector('[data-locataire="12"]'));
    expect(choisis()).toEqual(['12']);
    expect(container.querySelector('[data-choisir="12"]')!.getAttribute('aria-pressed')).toBe('true');
    await clic(container.querySelector('[data-locataire="11"]'));
    expect(choisis()).toEqual(['11', '12']);
    await clic(container.querySelector('[data-locataire="12"]'));
    expect(choisis()).toEqual(['11']);
    // Un lien de la carte garde son geste (il ne sélectionne pas).
    const lien = container.querySelector('[data-locataire="12"] a') as HTMLAnchorElement;
    lien.addEventListener('click', (e) => e.preventDefault());
    await clic(lien);
    expect(choisis()).toEqual(['11']);
  });
  it('sans sélection : le parcours le dit, aucun récapitulatif, rien n’est envoyé', async () => {
    await ecran();
    await clic(container.querySelector('[data-enregistrer-un-preavis]'));
    await saisir('[data-recu-le]', HIER);
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    expect(container.querySelector('[data-message-parcours]')?.textContent).toBe('Sélectionnez au moins un locataire (cliquez sur sa carte).');
    expect(fenetre()).toBeNull();
    expect(posts).toEqual([]);
  });
});

describe('② le préavis, « Enregistrer » : récapitulatif, puis résultat SANS mail', () => {
  it('tous les locataires : « deviendra vacant le … (à la sortie effective) » ; « Aucun mail ne sera envoyé » ; rien d’envoyé avant « Confirmer »', async () => {
    await ecran();
    await preparerPreavis([11, 12]);
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    expect(posts).toEqual([]);
    const f = fenetre()!;
    expect(f.getAttribute('data-fenetre-parcours')).toBe('recap');
    expect(f.querySelector('[data-rien-enregistre]')).not.toBeNull();
    expect(f.querySelector('[data-resume]')!.textContent).toContain('BERNARD Alice, BERNARD Paul');
    expect(f.querySelector('[data-resume]')!.textContent).toContain(`Réception du recommandé${HIER_FR}`);
    expect(f.querySelector('[data-resume]')!.textContent).toMatch(/Tous les locataires du logement sont en préavis : le logement deviendra vacant le \d{2}\/\d{2}\/\d{4} \(à la sortie effective\)\./);
    expect(f.querySelector('[data-aucun-mail-prevu]')?.textContent).toBe('Aucun mail ne sera envoyé.');
    await clic(f.querySelector('[data-confirmer-parcours]'));
    expect(posts).toEqual([{ corps: { action: 'enregistrer-preavis', occupationIds: [11, 12], recuLe: HIER, choix: { mode: 'mois', duree: 1 }, motif: null, envoyerMails: false, informerPartenaires: true }, propre: true }]);
    expect(fenetre()!.getAttribute('data-fenetre-parcours')).toBe('resultat');
    expect(fenetre()!.querySelector('[data-titre-parcours]')?.textContent).toBe('✓ Préavis enregistré');
    expect(fenetre()!.querySelector('[data-aucun-mail-envoye]')?.textContent).toBe('Aucun mail n’a été envoyé.');
    expect([...fenetre()!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Fermer']);
    // ⑥ « Fermer » : l'écran se relit — les deux locataires passent en BLEU (préavis), plus aucune sélection.
    const avant = lectures.filter((u) => u.includes('preavisBail=')).length;
    await clic(fenetre()!.querySelector('[data-fermer-parcours]'));
    expect(fenetre()).toBeNull();
    expect(lectures.filter((u) => u.includes('preavisBail=')).length).toBeGreaterThan(avant);
    expect(container.querySelectorAll('[data-locataire] [data-en-preavis]')).toHaveLength(2);
    expect(choisis()).toEqual([]);
    expect(container.querySelector('[data-preavis-fait] [data-aucun-mail]')?.textContent).toBe('Aucun mail n’a été envoyé.');
  });
  it('un seul des deux : « Le logement restera occupé par : BERNARD Paul. »', async () => {
    await ecran();
    await preparerPreavis([11]);
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    expect(fenetre()!.querySelector('[data-resume]')!.textContent).toContain('Le logement restera occupé par : BERNARD Paul.');
  });
  it('« Revenir » ferme le récapitulatif et GARDE toute la saisie (sélection, geste, dates, motif)', async () => {
    await ecran();
    await preparerPreavis([11]);
    await clic(container.querySelector('[data-duree="manuelle"]'));
    await saisir('[data-date-manuelle]', '2099-02-01');
    await saisir('[data-motif]', 'mutation');
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    await clic(fenetre()!.querySelector('[data-revenir-parcours]'));
    expect(fenetre()).toBeNull();
    expect(choisis()).toEqual(['11']);
    expect(container.querySelector('[data-saisie-geste="preavis"]')).not.toBeNull();
    expect((container.querySelector('[data-recu-le]') as HTMLInputElement).value).toBe(HIER);
    expect((container.querySelector('[data-date-manuelle]') as HTMLInputElement).value).toBe('2099-02-01');
    expect((container.querySelector('[data-motif]') as HTMLInputElement).value).toBe('mutation');
    expect(posts).toEqual([]);
  });
  it('un enregistrement REFUSÉ : message d’erreur clair dans la fenêtre, JAMAIS de succès ; rien ne passe en bleu', async () => {
    reponses['enregistrer-preavis'] = () => refus('La date de réception est postérieure à aujourd’hui.');
    await ecran();
    await preparerPreavis([11]);
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    await clic(fenetre()!.querySelector('[data-confirmer-parcours]'));
    expect(fenetre()!.getAttribute('data-fenetre-parcours')).toBe('recap');
    expect(fenetre()!.querySelector('[data-echec-enregistrement]')?.textContent).toBe('Le préavis n’a pas été enregistré : La date de réception est postérieure à aujourd’hui.');
    expect(document.body.textContent).not.toContain('Préavis enregistré');
    expect(document.querySelector('[data-modale-issue]')).toBeNull(); // ni la fenêtre commune « Modification enregistrée »
  });
});

describe('③ le préavis, « Enregistrer et envoyer les mails »', () => {
  it('le récapitulatif liste les mails (objet, destinataires, copies, texte) ; le résultat, ceux RENDUS par le serveur', async () => {
    await ecran();
    await preparerPreavis([11, 12]);
    expect(container.querySelector('[data-info-destinataires="preavis"]')).not.toBeNull(); // le picto « i » à côté du bouton
    await clic(container.querySelector('[data-enregistrer-avec-mails]'));
    expect(posts).toEqual([{ corps: { action: 'apercu-preavis', occupationIds: [11, 12], recuLe: HIER, choix: { mode: 'mois', duree: 1 } }, propre: true }]);
    const f = fenetre()!;
    expect([...f.querySelectorAll('[data-mail-prevu]')].map((m) => [m.getAttribute('data-mail-prevu'), m.querySelector('[data-a]')?.textContent, m.querySelector('[data-cc]')?.textContent]))
      .toEqual([['preavis_locataires', 'alice@exemple.test, paul@exemple.test', 'gestion@criterimmo.fr, moi@exemple.test'],
        ['preavis_adhoc', 'gestion.criterimmo@gmail.com', 'gestion@criterimmo.fr, moi@exemple.test']]);
    expect(f.querySelector('[data-texte-mail]')?.textContent).toBe('Bonjour Alice et Paul,');
    await clic(f.querySelector('[data-confirmer-parcours]'));
    expect(posts.at(-1)!.corps).toMatchObject({ action: 'enregistrer-preavis', envoyerMails: true, informerPartenaires: true });
    expect([...fenetre()!.querySelectorAll('[data-mail-parti]')].map((m) => [m.getAttribute('data-mail-parti'), m.getAttribute('data-envoye')]))
      .toEqual([['preavis_locataires', 'oui'], ['preavis_adhoc', 'oui']]);
  });
  it('un envoi PARTIELLEMENT en échec : en rouge, avec l’adresse ; le préavis reste enregistré', async () => {
    reponses['enregistrer-preavis'] = () => ok({ dateMax: '2099-01-01' }, { mails: { etat: 'ok', envois: [{ ...ACCUSE, envoye: true, motif: null },
      { ...PART, envoye: false, motif: 'Gmail injoignable' }] } });
    await ecran();
    await preparerPreavis([11]);
    await clic(container.querySelector('[data-enregistrer-avec-mails]'));
    await clic(fenetre()!.querySelector('[data-confirmer-parcours]'));
    expect(fenetre()!.querySelector('[data-titre-parcours]')?.textContent).toBe('✓ Préavis enregistré');
    expect(fenetre()!.querySelector('[data-mail-parti="preavis_adhoc"] [data-echec-envoi]')?.textContent).toBe('Échec de l’envoi à gestion.criterimmo@gmail.com : Gmail injoignable.');
  });
  it('bien HORS gestion : le récapitulatif le dit (aucun mail aux partenaires, seulement les locataires et les copies internes)', async () => {
    reponses['apercu-preavis'] = () => ok({ mails: [ACCUSE], sansEmail: [], enGestion: false, dateFin: '2099-01-01', envoiPossible: true });
    await ecran();
    await preparerPreavis([11]);
    await clic(container.querySelector('[data-enregistrer-avec-mails]'));
    expect(fenetre()!.querySelector('[data-hors-gestion]')?.textContent).toContain('aucun mail aux partenaires');
    expect([...fenetre()!.querySelectorAll('[data-mail-prevu]')].map((m) => m.getAttribute('data-mail-prevu'))).toEqual(['preavis_locataires']);
  });
});

describe('④ la sortie, avec chacun des deux boutons', () => {
  const preparerSortie = async (cartes: number[]) => {
    for (const o of cartes) await clic(container.querySelector(`[data-locataire="${o}"]`));
    await clic(container.querySelector('[data-faire-sortir]'));
    await saisir('[data-date-sortie]', HIER);
  };
  it('« Enregistrer » : « Le logement devient vacant » ; AUCUN mail (le serveur le reçoit : envoyerMails false)', async () => {
    await ecran();
    await preparerSortie([11, 12]);
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    expect(fenetre()!.querySelector('[data-resume]')!.textContent).toContain('Le logement devient vacant.');
    await clic(fenetre()!.querySelector('[data-confirmer-parcours]'));
    expect(posts).toEqual([{ corps: { action: 'sortie-locataires', occupationId: 11, sortants: [11, 12], date: HIER, envoyerMails: false, informerPartenaires: true }, propre: true }]);
    expect(fenetre()!.querySelector('[data-titre-parcours]')?.textContent).toBe('✓ Sortie enregistrée');
    expect(fenetre()!.querySelector('[data-aucun-mail-envoye]')).not.toBeNull();
    await clic(fenetre()!.querySelector('[data-fermer-parcours]'));
    expect(container.querySelector('[data-sortie-faite] [data-aucun-mail]')?.textContent).toBe('Aucun mail n’a été envoyé.');
  });
  it('un seul sortant : « Le logement reste occupé par : BERNARD Paul. »', async () => {
    await ecran();
    await preparerSortie([11]);
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    expect(fenetre()!.querySelector('[data-resume]')!.textContent).toContain('Le logement reste occupé par : BERNARD Paul.');
  });
  it('« Enregistrer et envoyer les mails » : l’aperçu (lecture) puis les mails réellement partis', async () => {
    await ecran();
    await preparerSortie([11]);
    expect(container.querySelector('[data-info-destinataires="sortie"]')).not.toBeNull();
    await clic(container.querySelector('[data-enregistrer-avec-mails]'));
    expect(posts).toEqual([{ corps: { action: 'apercu-sortie', occupationId: 11 }, propre: true }]);
    expect([...fenetre()!.querySelectorAll('[data-mail-prevu]')].map((m) => m.getAttribute('data-mail-prevu'))).toEqual(['sortie_interne', 'sortie_adhoc']);
    await clic(fenetre()!.querySelector('[data-confirmer-parcours]'));
    expect(posts.at(-1)!.corps).toMatchObject({ action: 'sortie-locataires', envoyerMails: true });
    expect([...fenetre()!.querySelectorAll('[data-mail-parti]')].map((m) => m.getAttribute('data-mail-parti'))).toEqual(['sortie_interne', 'sortie_adhoc']);
  });
  it('la date future reste refusée à l’écran (comme avant) : aucun récapitulatif', async () => {
    await ecran();
    for (const o of [11]) await clic(container.querySelector(`[data-locataire="${o}"]`));
    await clic(container.querySelector('[data-faire-sortir]'));
    await saisir('[data-date-sortie]', '2099-01-01');
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    expect(fenetre()).toBeNull();
    expect(container.querySelector('[data-message-parcours]')).not.toBeNull();
  });
  it('sans le droit Gestion : la sortie est remplacée par le message ; le préavis reste possible', async () => {
    await ecran(false);
    expect(container.querySelector('[data-faire-sortir]')).toBeNull();
    expect(container.querySelector('[data-sortie-gestion-seule]')).not.toBeNull();
    expect(container.querySelector('[data-enregistrer-un-preavis]')).not.toBeNull();
  });
});

describe('⑦ la fiche locataire : le MÊME parcours', () => {
  it('cartes sans présélection, Préavis / Sortie, les deux boutons ; un préavis enregistré passe en bleu', async () => {
    await act(async () => { root.render(createElement(BlocSortieLogement, { locataireId: 101, occupationDemandee: 11 })); }); await calmer();
    expect(container.querySelector('[data-parcours-sur-bail] [data-parcours-preavis-sortie]')).not.toBeNull();
    expect(choisis()).toEqual([]);
    await preparerPreavis([12]);
    expect(container.querySelector('[data-enregistrer-sans-mail]')).not.toBeNull();
    expect(container.querySelector('[data-enregistrer-avec-mails]')).not.toBeNull();
    await clic(container.querySelector('[data-enregistrer-sans-mail]'));
    await clic(fenetre()!.querySelector('[data-confirmer-parcours]'));
    await clic(fenetre()!.querySelector('[data-fermer-parcours]'));
    expect([...container.querySelectorAll('[data-locataire] [data-en-preavis]')].map((x) => x.closest('[data-locataire]')!.getAttribute('data-locataire'))).toEqual(['12']);
    expect(container.querySelector('[data-preavis-fait] [data-aucun-mail]')).not.toBeNull();
  });
});
