// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlocPreavisAccueil, CLE_TRI } from './PreavisAccueil';
import type { LignePreavisAccueil } from '../../../../lib/location/preavis';
import type { PrevisiteAffiche } from '../../../../lib/location/previsite';
import type { EncartLogement } from '../../../../lib/location/sortieLocataires';

/**
 * 🔴🔴 LA PRÉ-VISITE SUR L'ACCUEIL LOCATION (Arno, 10/11/2026) — les VRAIS composants, routes simulées : rien ne part, rien n'est écrit.
 * Pastilles et compteurs, cartouche « Aucune pré-visite fixée », date et heure sur la ligne, filtre, tri, les boutons (rien de retiré),
 * la saisie → le récapitulatif (texte intégral) → la fenêtre du résultat (mails réellement envoyés, échec en rouge), le lien
 * `?previsite=` qui ouvre la ligne dépliée.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ etat: 'ok', data }) }) as unknown as Response;
const pv = (o: Partial<PrevisiteAffiche> = {}): PrevisiteAffiche => ({ statut: 'recu', rdv: null, tacheId: null, collegues: [], tousRefusent: false, rdvPasse: false, alerteEnvoyeeLe: null, ...o });
const ligne = (cle: string, occ: number, nom: string, previsite: PrevisiteAffiche, o: Partial<LignePreavisAccueil> = {}): LignePreavisAccueil => ({
  cle, lotId: 7, adresse: `${cle} rue Fictive`, occupationId: occ, occupationIds: [occ], locataires: [{ occupationId: occ, locataireId: occ * 10, nom }],
  recuLe: '2026-11-01', dateMax: '2099-02-01', etatDesLieuxLe: null, previsite, ...o,
});
const ENCART: EncartLogement = {
  lotId: 7, adresse: '4 rue Fictive, 92800 Puteaux', type: 'Appartement T3', meuble: false, etage: '3', porte: 'G', numLotCopro: null,
  numeroLot: '100', batiment: 'B', escalier: null, surfaceCarrez: null, surfaceHabitable: null, surface: null, surfaceExterieure: null,
  nombrePieces: null, ascenseur: true, digicode: true, digicodeCode: '4521A', precisionAcces: 'Code au portail', dpeClasse: null, dpeDate: null,
  dpeNonSoumis: null, chauffage: null, epoqueConstruction: null,
  lots: [
    { lotId: 7, role: 'logement', type: 'Appartement T3', etage: '3', numLotCopro: null, numeroLot: '100', porte: 'G', place: false },
    { lotId: 8, role: 'annexe', type: 'Parking', etage: '-1', numLotCopro: null, numeroLot: null, porte: '12', place: true },
  ],
  proprietaire: { id: 5, nom: 'DUPONT Jean' }, syndic: null,
  bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null },
  coordonnees: {
    proprietaire: { telephones: ['06 11 22 33 44'], emails: ['jean@exemple.test'] },
    locataires: [
      { occupationId: 11, locataireId: 101, nom: 'BERNARD Alice', telephones: ['06 55 66 77 88'], emails: ['alice@exemple.test'] },
      { occupationId: 12, locataireId: 102, nom: 'BERNARD Paul', telephones: [], emails: [] },
    ],
  },
};
const RDV = { jour: '2026-11-20', heure: '10:00', dureeMinutes: 60 };

let container: HTMLDivElement; let root: Root; let lignes: LignePreavisAccueil[]; let posts: Record<string, unknown>[];
let reponsePost: (c: Record<string, unknown>) => unknown;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  try { window.localStorage.removeItem(CLE_TRI); } catch { /* sans stockage */ }
  window.history.replaceState(null, '', '/admin/location');
  posts = [];
  lignes = [
    ligne('A', 21, 'ALERTE Alice', pv({ statut: 'alerte' })),
    ligne('B', 31, 'PROGRAMME Bob', pv({ statut: 'programmee', rdv: RDV, tacheId: 500, collegues: [{ collaborateurId: 4, libelle: 'Claire Test', email: null, statut: 'acceptee', motif: null }] })),
    ligne('C', 41, 'RECU Carla', pv({ statut: 'recu' })),
  ];
  reponsePost = (c) => (String(c.action).startsWith('apercu') ? { mails: [
    { sorte: 'previsite_invitation', objet: 'Pré-visite EDL de sortie — C rue — 20/11/2026 10h00-11h00', a: ['Arno Test'], cc: [], texte: 'Bonjour Arno Test, [lien personnel « Accepter »]', piece: 'pre-visite.ics' },
    { sorte: 'previsite_locataires', objet: 'Rendez-vous de pré-visite', a: ['carla@exemple.test'], cc: ['gestion@exemple.test'], texte: 'Bonjour Carla RECU,\n\nNous vous confirmons…', piece: 'pre-visite.ics' },
  ], sansEmail: [] } : { rdv: RDV, ancien: null, collegues: [{ destinataire: 'Claire Test', etat: 'desactive' }],
    locataires: [{ sorte: 'previsite_locataires', objet: 'Rendez-vous de pré-visite', a: ['carla@exemple.test'], cc: [], envoye: true, motif: null }], sansEmail: [], agenda: '' });
  global.fetch = vi.fn(async (u: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(corps);
      return ok(reponsePost(corps));
    }
    const s = decodeURIComponent(String(u));
    if (s.includes('preavisEnCours=1')) return ok({ disponible: true, etatDesLieux: true, planification: true, previsite: true, lignes });
    if (s.includes('encartBail=')) return ok(ENCART);
    if (s.includes('previsiteCollegues=1')) return ok([{ id: 3, libelle: 'Arno Test', accesGestion: true }, { id: 4, libelle: 'Claire Test', accesGestion: true }]);
    if (s.includes('previsiteRefus=')) return ok({ texte: 'Bonjour Carla RECU,\n\nMalgré nos recommandations, aucun rendez-vous de pré-visite n’a pu être fixé.', objet: 'Pré-visite d’état des lieux de sortie — C rue', sansEmail: [] });
    if (s.includes('edlsConfiables=1')) return ok([{ id: 3, libelle: 'Arno Test', accesGestion: true }]);
    return ok({ lignes: [], total: 0, page: 0 });
  }) as unknown as typeof fetch;
});
afterEach(() => { act(() => root.unmount()); container.remove(); document.querySelectorAll('.mis-voile').forEach((n) => n.remove()); });

const attendre = async (): Promise<void> => { for (let i = 0; i < 4; i++) await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const rendre = async (): Promise<void> => { await act(async () => { root.render(createElement(BlocPreavisAccueil, { gestion: true })); }); await attendre(); };
const clic = async (el: Element | null): Promise<void> => { if (el === null) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await attendre(); };
const ordre = (): string[] => [...container.querySelectorAll('[data-ligne-preavis]')].map((li) => li.getAttribute('data-ligne-preavis')!);
const fenetre = (): HTMLElement | null => document.querySelector('[data-fenetre-previsite]');
function saisir(el: Element | null, v: string): void {
  const e = el as HTMLInputElement | HTMLTextAreaElement;
  const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); });
}

describe('🔴 Règle 1 — les pastilles de statut, avec compteur ; filtrer ; trier', () => {
  it('les compteurs dans l’ordre d’Arno ; « Alerte préavis » présente parce qu’il y en a une', async () => {
    await rendre();
    const p = [...container.querySelectorAll('[data-filtre-previsite]')].map((b) => b.textContent);
    expect(p).toEqual(['Tous (3)', 'Alerte préavis 1', 'Préavis reçu 1', 'Pré-visite programmée 1', 'Pré-visite effectuée 0', 'Pré-visite refusée / absente 0']);
  });
  it('aucune alerte : la pastille « Alerte préavis » n’apparaît pas', async () => {
    lignes = lignes.filter((l) => l.cle !== 'A');
    await rendre();
    expect(container.querySelector('[data-filtre-previsite="alerte"]')).toBeNull();
  });
  it('cliquer une pastille filtre ; « Tous » remet tout', async () => {
    await rendre();
    await clic(container.querySelector('[data-filtre-previsite="programmee"]'));
    expect(ordre()).toEqual(['B']);
    await clic(container.querySelector('[data-filtre-previsite="tous"]'));
    expect(ordre()).toHaveLength(3);
  });
  it('trier par statut (alerte d’abord)', async () => {
    await rendre();
    await clic(container.querySelector('[data-tri="statut:asc"]'));
    expect(ordre()).toEqual(['A', 'C', 'B']);
  });
});

describe('🔴 Règles 2-3 — la ligne : cartouche « Aucune pré-visite fixée », date et heure de la pré-visite', () => {
  it('en alerte : le cartouche ; programmée : « Pré-visite le 20/11/2026 à 10h00 » dans le détail', async () => {
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="A"] [data-cartouche-previsite="alerte"]')?.textContent).toBe('Aucune pré-visite fixée');
    expect(container.querySelector('[data-ligne-preavis="B"] .pva-detail')?.textContent).toContain('Pré-visite le 20/11/2026 à 10h00');
    expect(container.querySelector('[data-ligne-preavis="C"] [data-cartouche-previsite]')).toBeNull();
  });
  it('★ tous ont refusé : « Personne n’a accepté la pré-visite » et « Réaffecter »', async () => {
    lignes[1].previsite = pv({ statut: 'programmee', rdv: RDV, tacheId: 500, tousRefusent: true,
      collegues: [{ collaborateurId: 4, libelle: 'Claire Test', email: null, statut: 'refusee', motif: 'absente' }] });
    await rendre();
    expect(container.querySelector('[data-ligne-preavis="B"] [data-cartouche-previsite="tous-refusent"]')?.textContent).toBe('Personne n’a accepté la pré-visite');
    await clic(container.querySelector('[data-ouvrir-preavis="B"]'));
    expect(container.querySelector('[data-reaffecter-previsite]')).not.toBeNull();
    expect(container.querySelector('[data-collegue-statut="refusee"]')?.textContent).toBe('Claire Test : refusée (absente)');
  });
});

describe('🔴 Règle 3 — « RDV pré-visite » à côté des boutons existants (rien de retiré) ; saisie → récapitulatif → résultat', () => {
  it('dépliée : « RDV pré-visite », « Planifier l’état des lieux de sortie » et « Valider la sortie » sont tous là', async () => {
    await rendre();
    await clic(container.querySelector('[data-ouvrir-preavis="C"]'));
    expect(container.querySelector('[data-rdv-previsite]')?.textContent).toBe('RDV pré-visite');
    expect(container.querySelector('[data-planifier-edls]')?.textContent).toBe('Planifier l’état des lieux de sortie');
    expect(container.querySelector('[data-valider-sortie]')?.textContent).toBe('Valider la sortie');
    expect(container.querySelector('[data-refus-previsite]')?.textContent).toBe('Refus / absence de pré-visite');
  });
  it('le compte connecté coché par défaut ; plusieurs collègues ; récapitulatif avec le texte intégral ; le résultat dit l’échec en rouge', async () => {
    await rendre();
    await clic(container.querySelector('[data-ouvrir-preavis="C"]'));
    await clic(container.querySelector('[data-rdv-previsite]'));
    expect((document.querySelector('[data-destinataire="3"]') as HTMLInputElement).checked).toBe(true);
    expect((document.querySelector('[data-destinataire="4"]') as HTMLInputElement).checked).toBe(false);
    await clic(document.querySelector('[data-destinataire="4"]'));
    saisir(document.querySelector('[data-previsite-jour]'), '2026-11-20');
    saisir(document.querySelector('[data-previsite-debut]'), '10:00');
    expect((document.querySelector('[data-previsite-fin]') as HTMLInputElement).value).toBe('11:00');
    await clic(document.querySelector('[data-recap-previsite]'));
    expect(posts.at(-1)).toMatchObject({ action: 'apercu-previsite', occupationIds: [41], jour: '2026-11-20', debut: '10:00', fin: '11:00', destinataires: [3, 4] });
    expect(fenetre()?.getAttribute('data-fenetre-previsite')).toBe('recap');
    expect(document.querySelector('[data-rien-enregistre]')).not.toBeNull();
    expect([...document.querySelectorAll('[data-texte-mail]')].map((x) => x.textContent)).toEqual(['Bonjour Arno Test, [lien personnel « Accepter »]', 'Bonjour Carla RECU,\n\nNous vous confirmons…']);
    expect(posts.some((p) => p.action === 'programmer-previsite')).toBe(false);
    await clic(document.querySelector('[data-confirmer-previsite]'));
    expect(posts.at(-1)).toMatchObject({ action: 'programmer-previsite', destinataires: [3, 4] });
    expect(fenetre()?.getAttribute('data-fenetre-previsite')).toBe('resultat');
    expect(document.querySelector('[data-titre-previsite]')?.textContent).toBe('✓ Pré-visite programmée');
    const echec = document.querySelector('[data-mail-parti="previsite_invitation"]');
    expect(echec?.getAttribute('data-envoye')).toBe('non');
    expect(echec?.textContent).toContain('NON ENVOYÉ');
    expect(echec?.textContent).toContain('les mails des tâches sont désactivés');
    expect(document.querySelector('[data-mail-parti="previsite_locataires"]')?.getAttribute('data-envoye')).toBe('oui');
  });
  it('🔴 Règle 4 — « Déplacer la pré-visite » : l’ancien créneau est repris et rappelé', async () => {
    await rendre();
    await clic(container.querySelector('[data-ouvrir-preavis="B"]'));
    await clic(container.querySelector('[data-deplacer-previsite]'));
    expect((document.querySelector('[data-previsite-jour]') as HTMLInputElement).value).toBe('2026-11-20');
    expect((document.querySelector('[data-previsite-fin]') as HTMLInputElement).value).toBe('11:00');
    expect(document.querySelector('[data-previsite-ancien]')?.textContent).toContain('statuts remis à zéro');
    saisir(document.querySelector('[data-previsite-jour]'), '2026-11-25');
    await clic(document.querySelector('[data-recap-previsite]'));
    expect(posts.at(-1)).toMatchObject({ action: 'apercu-previsite', deplacer: true, jour: '2026-11-25' });
    await clic(document.querySelector('[data-confirmer-previsite]'));
    expect(posts.at(-1)).toMatchObject({ action: 'deplacer-previsite', jour: '2026-11-25', debut: '10:00', fin: '11:00' });
  });
});

describe('🔴 Règle 5 — « Compte rendu pré-visite » : après le rendez-vous ; objet prérempli ; case décochée', () => {
  it('pas de bouton avant la fin du rendez-vous', async () => {
    await rendre();
    await clic(container.querySelector('[data-ouvrir-preavis="B"]'));
    expect(container.querySelector('[data-compte-rendu-previsite]')).toBeNull();
  });
  it('le rendez-vous passé : le bouton ; l’objet mot pour mot ; « Envoyer aussi aux locataires » décochée ; le statut au résultat', async () => {
    lignes[1].previsite = { ...lignes[1].previsite!, rdvPasse: true };
    reponsePost = (c) => (String(c.action).startsWith('apercu') ? { mails: [{ sorte: 'previsite_compte_rendu', objet: 'x', a: ['arno@exemple.test'], cc: [], texte: 'Tout va bien.' }], sansEmail: [] }
      : { envois: [{ sorte: 'previsite_compte_rendu', objet: 'x', a: ['arno@exemple.test'], cc: [], envoye: true, motif: null }], statut: 'effectuee' });
    await rendre();
    await clic(container.querySelector('[data-ouvrir-preavis="B"]'));
    await clic(container.querySelector('[data-compte-rendu-previsite]'));
    expect(document.querySelector('[data-objet-compte-rendu]')?.textContent).toBe('Compte rendu de pré-visite d’état des lieux de sortie effectuée le 20/11/2026 à 10h00');
    expect((document.querySelector('[data-aussi-locataires]') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('[data-recap-previsite]') as HTMLButtonElement).disabled).toBe(true);
    saisir(document.querySelector('[data-corps-compte-rendu]'), 'Tout va bien.');
    await clic(document.querySelector('[data-recap-previsite]'));
    await clic(document.querySelector('[data-confirmer-previsite]'));
    expect(posts.at(-1)).toMatchObject({ action: 'compte-rendu-previsite', corps: 'Tout va bien.', aussiLocataires: false });
    expect(document.querySelector('[data-resume]')?.textContent).toContain('Pré-visite effectuée');
  });
});

describe('🔴 Règle 6 — « Refus / absence de pré-visite » : texte prérempli, modifiable, envoyé tel quel', () => {
  it('le texte proposé est dans la modale ; modifié, c’est lui qui part', async () => {
    reponsePost = (c) => (String(c.action).startsWith('apercu') ? { mails: [{ sorte: 'previsite_refus', objet: 'x', a: ['carla@exemple.test'], cc: ['arno@exemple.test'], texte: String(c.texte) }], sansEmail: [] }
      : { envois: [{ sorte: 'previsite_refus', objet: 'x', a: ['carla@exemple.test'], cc: [], envoye: true, motif: null }], statut: 'refusee' });
    await rendre();
    await clic(container.querySelector('[data-ouvrir-preavis="C"]'));
    await clic(container.querySelector('[data-refus-previsite]'));
    const zone = document.querySelector('[data-texte-refus]') as HTMLTextAreaElement;
    expect(zone.value).toContain('Malgré nos recommandations, aucun rendez-vous de pré-visite n’a pu être fixé.');
    saisir(zone, 'Bonjour,\n\nTexte modifié.');
    await clic(document.querySelector('[data-recap-previsite]'));
    expect(document.querySelector('[data-texte-mail]')?.textContent).toBe('Bonjour,\n\nTexte modifié.');
    await clic(document.querySelector('[data-confirmer-previsite]'));
    expect(posts.at(-1)).toMatchObject({ action: 'refus-previsite', texte: 'Bonjour,\n\nTexte modifié.' });
    expect(document.querySelector('[data-resume]')?.textContent).toContain('Pré-visite refusée / absente');
  });
});

describe('🔴 Règle 5 — le lien des mails : `?previsite=<occupation>` ouvre la ligne, dépliée', () => {
  it('?previsite=31 ouvre la ligne B', async () => {
    window.history.replaceState(null, '', '/admin/location?previsite=31');
    await rendre();
    expect(container.querySelector('[data-ligne-depliee="B"]')).not.toBeNull();
    expect(container.querySelector('[data-ligne-depliee="A"]')).toBeNull();
  });
});
