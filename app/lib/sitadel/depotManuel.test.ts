import { describe, it, expect, vi } from 'vitest';

// depotManuel importe `query` (db/client) pour ses deps RÉELLES uniquement ; on le neutralise (les tests passent des deps injectées).
vi.mock('../db/client', () => ({ query: vi.fn() }));

import {
  objetEstPermis, estCandidatDepot, traiterDepotManuel, empreinteDe, parserAdressesConnues,
  type DepsDepotManuel, type CandidatDossier, type CaracteristiquesPermis, type IssueDepot,
} from './depotManuel';
import type { MessageBoite, PieceMeta } from '../veille/releveReponses';

// ── Fabriques ─────────────────────────────────────────────────────────────────
const piece = (nom: string, contenu: string, typeMime: string | null = 'application/pdf'): PieceMeta =>
  ({ nomFichier: nom, typeMime, tailleOctets: contenu.length, contenu: Buffer.from(contenu) });
const mail = (over: Partial<MessageBoite['message']> = {}, pieces: PieceMeta[] = [piece('a.pdf', 'x')]): MessageBoite => ({
  uid: 1, message: { messageId: '<m1@x>', deAdresse: 'a.jorel@sansvisavis.com', objet: 'permis', ...over },
  recuLe: new Date('2026-08-14T09:00:00Z'), deNom: null, pieces, partiesRapport: undefined,
});
const CARAC: CaracteristiquesPermis = {
  reference: 'SVAV-DEM-2026-000042', numDau: '0930012500081', type: 'PC', adresse: '12 rue des Fleurs',
  communeNom: 'Aubervilliers', codeInsee: '93001', natureTravaux: 'Construction neuve', dateAutorisation: '2026-05-01', surface: '2000', logements: 20,
};

function harness(opts: {
  candidats?: CandidatDossier[]; textes?: Record<string, string | null>; dejaTraite?: boolean; empreintes?: Set<string>;
  deposeMotif?: string; // si défini → deposer échoue avec ce motif
} = {}) {
  const journal: { messageId: string; issue: IssueDepot; dossierId: number | null }[] = [];
  const alertes: { sujet: string; corps: string }[] = [];
  const forwards: { sujet: string; corps: string }[] = [];
  const marques: { demandeId: number; dossierId: number }[] = [];
  const deposes: { dossierId: number; nom: string }[] = [];
  const deps: DepsDepotManuel = {
    dejaTraite: async () => opts.dejaTraite === true,
    journaliser: async (e) => { journal.push({ messageId: e.messageId, issue: e.issue, dossierId: e.dossierId }); },
    extraireTextePdf: async (contenu) => (opts.textes ? (opts.textes[contenu.toString()] ?? null) : contenu.toString()),
    chargerCandidats: async () => opts.candidats ?? [],
    empreintesEnGed: async () => opts.empreintes ?? new Set<string>(),
    marquerSatisfait: async (demandeId, dossierId) => { marques.push({ demandeId, dossierId }); },
    deposer: async (dossierId, p) => { if (opts.deposeMotif) return { ok: false, motif: opts.deposeMotif }; deposes.push({ dossierId, nom: p.nomFichier }); return { ok: true }; },
    caracteristiques: async () => CARAC,
    envoyerAlerte: async (sujet, corps) => { alertes.push({ sujet, corps }); },
    forwarder: async (_mb, sujet, corps) => { forwards.push({ sujet, corps }); },
  };
  return { deps, journal, alertes, forwards, marques, deposes };
}

describe('F-N1 — parserAdressesConnues : séparateurs tolérés, casse ignorée, vides ignorés', () => {
  it('point-virgule accepté (jamais zéro adresse en silence)', () => {
    expect(parserAdressesConnues('a@x.com;b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('virgule + espace acceptés', () => {
    expect(parserAdressesConnues('a@x.com, b@y.com')).toEqual(['a@x.com', 'b@y.com']);
  });
  it('espaces et retours à la ligne acceptés, entrées vides ignorées', () => {
    expect(parserAdressesConnues('a@x.com\n\nb@y.com ;; , c@z.com')).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
  });
  it('casse normalisée (comparaison insensible)', () => {
    expect(parserAdressesConnues('A@X.COM')).toEqual(['a@x.com']);
  });
  it('chaîne vide → aucune adresse', () => {
    expect(parserAdressesConnues('')).toEqual([]);
    expect(parserAdressesConnues('   ')).toEqual([]);
  });
});

describe('N1-A — reconnaissance (objet « permis » + expéditeur connu + pièces)', () => {
  it('objetEstPermis : « permis » seul, casse/accents/espaces/Re:/Fwd: tolérés ; jamais un objet composé', () => {
    for (const o of ['permis', 'Permis', '  PERMIS ', 'Re: permis', 'Fwd: Permis', 'TR : permís']) expect(objetEstPermis(o)).toBe(true);
    for (const o of ['les permis', 'permis 093', 'demande de permis', '', null, undefined]) expect(objetEstPermis(o as string)).toBe(false);
  });
  it('estCandidatDepot : les TROIS conditions cumulatives ; une seule manquante → false', () => {
    const adr = new Set(['a.jorel@sansvisavis.com']);
    expect(estCandidatDepot({ objet: 'permis', deAdresse: 'A.Jorel@Sansvisavis.com', nbPieces: 1 }, adr)).toBe(true); // casse ignorée
    expect(estCandidatDepot({ objet: 'autre', deAdresse: 'a.jorel@sansvisavis.com', nbPieces: 1 }, adr)).toBe(false); // objet
    expect(estCandidatDepot({ objet: 'permis', deAdresse: 'inconnu@x.fr', nbPieces: 1 }, adr)).toBe(false);           // expéditeur
    expect(estCandidatDepot({ objet: 'permis', deAdresse: 'a.jorel@sansvisavis.com', nbPieces: 0 }, adr)).toBe(false); // pièces
  });
});

describe('N1-A — les quatre issues (§4)', () => {
  const CAND: CandidatDossier = { dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false };

  it('(a) UN candidat → verse TOUTES les pièces (même celles sans référence), bascule en Archives, alerte succès', async () => {
    const h = harness({
      candidats: [CAND],
      textes: { 'contient 0930012500081 ici': 'contient 0930012500081 ici', 'aucune ref': 'aucune ref' },
    });
    const mb = mail({}, [piece('arrete.pdf', 'contient 0930012500081 ici'), piece('plan.pdf', 'aucune ref')]);
    const res = await traiterDepotManuel(mb, 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.marques).toEqual([{ demandeId: 10, dossierId: 1 }]);            // satisfait AVANT dépôt (garde saine)
    expect(h.deposes.map((d) => d.nom)).toEqual(['arrete.pdf', 'plan.pdf']); // TOUTES les pièces, pas seulement celle qui cite
    expect(h.alertes).toHaveLength(1);
    expect(h.alertes[0].corps).toContain('N°0930012500081');
    expect(h.alertes[0].corps).toContain('SVAV-DEM-2026-000042');
    expect(h.alertes[0].corps).toContain('12 rue des Fleurs');
    expect(h.journal[0]).toMatchObject({ issue: 'verse', dossierId: 1 });
    expect(h.forwards).toHaveLength(0);
  });

  it('(a2) dossier DÉJÀ satisfait (Archives) → n’appelle pas marquerSatisfait, ajoute simplement les pièces', async () => {
    const h = harness({ candidats: [{ ...CAND, dejaSatisfait: true }], textes: { 'ref 0930012500081': 'ref 0930012500081' } });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(h.marques).toEqual([]); // déjà satisfait → pas de re-marquage
    expect(h.deposes).toHaveLength(1);
  });

  it('(b) PLUSIEURS candidats → NE VERSE RIEN, alerte listant les permis en concurrence', async () => {
    const h = harness({
      candidats: [{ dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false }, { dossierId: 2, demandeId: 11, numDau: '0930012500082', dejaSatisfait: true }],
      textes: { 'les deux 0930012500081 et 0930012500082': 'les deux 0930012500081 et 0930012500082' },
    });
    const res = await traiterDepotManuel(mail({}, [piece('deux.pdf', 'les deux 0930012500081 et 0930012500082')]), 'entreprise', h.deps);
    expect(res.issue).toBe('ambigu');
    expect(h.deposes).toHaveLength(0);
    expect(h.marques).toHaveLength(0);
    expect(h.alertes[0].corps).toContain('Candidat 1');
    expect(h.alertes[0].corps).toContain('Candidat 2');
    expect(h.journal[0]).toMatchObject({ issue: 'ambigu', dossierId: null });
  });

  it('(c) AUCUN candidat (texte lu, aucun n° connu) → NE VERSE RIEN, FORWARD du mail + alerte', async () => {
    const h = harness({ candidats: [CAND], textes: { 'rien de reconnaissable': 'rien de reconnaissable' } });
    const res = await traiterDepotManuel(mail({}, [piece('z.pdf', 'rien de reconnaissable')]), 'entreprise', h.deps);
    expect(res.issue).toBe('aucun_candidat');
    expect(h.deposes).toHaveLength(0);
    expect(h.forwards).toHaveLength(1);
    expect(h.forwards[0].corps).toContain('AUCUN numéro de permis');
    expect(h.alertes).toHaveLength(0); // le forward EST l'alerte (contient le mail complet)
    expect(h.journal[0]).toMatchObject({ issue: 'aucun_candidat' });
  });

  it('(d) extraction ÉCHOUÉE → traité comme (c) mais avec le MOTIF exact ; jamais de silence', async () => {
    const h = harness({ candidats: [CAND], textes: { 'scan': null } }); // extraction renvoie null → PDF sans texte
    const res = await traiterDepotManuel(mail({}, [piece('scan.pdf', 'scan')]), 'entreprise', h.deps);
    expect(res.issue).toBe('extraction_echec');
    expect(h.forwards[0].corps).toContain('PDF sans couche texte lisible');
    expect(h.forwards[0].corps).toContain('scan.pdf');
    expect(h.deposes).toHaveLength(0);
  });

  it('idempotence : message déjà traité → deja_traite, RIEN refait (ni versement, ni alerte, ni forward, ni journal)', async () => {
    const h = harness({ candidats: [CAND], dejaTraite: true, textes: { 'ref 0930012500081': 'ref 0930012500081' } });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('deja_traite');
    expect([h.deposes.length, h.alertes.length, h.forwards.length, h.journal.length, h.marques.length]).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('N1-A — dédoublonnage partiel (§6) : ne verse que les pièces absentes', () => {
  it('5 pièces dont 3 déjà en GED (par empreinte) → 2 versées, 3 ignorées ; le mail n’est jamais rejeté en entier', async () => {
    const contenus = ['p1', 'p2', 'p3', 'p4-ref 0930012500081', 'p5'];
    const pieces = contenus.map((c, i) => piece(`p${i + 1}.pdf`, c));
    const dejaEnGed = new Set([empreinteDe(pieces[0].contenu), empreinteDe(pieces[1].contenu), empreinteDe(pieces[2].contenu)]);
    const textes: Record<string, string> = Object.fromEntries(contenus.map((c) => [c, c]));
    const h = harness({ candidats: [{ dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: false }], empreintes: dejaEnGed, textes });
    const res = await traiterDepotManuel(mail({}, pieces), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(res.deposees).toEqual(['p4.pdf', 'p5.pdf']);          // seules les absentes
    expect(res.ignorees).toEqual(['p1.pdf', 'p2.pdf', 'p3.pdf']); // déjà présentes
    expect(h.deposes.map((d) => d.nom)).toEqual(['p4.pdf', 'p5.pdf']);
    expect(h.alertes[0].corps).toContain('déjà présentes');
  });

  it('échec de dépôt d’UNE pièce → consigné dans l’alerte (echecs), jamais avalé', async () => {
    const h = harness({ candidats: [{ dossierId: 1, demandeId: 10, numDau: '0930012500081', dejaSatisfait: true }], textes: { 'ref 0930012500081': 'ref 0930012500081' }, deposeMotif: 'type non autorisé pour le dépôt' });
    const res = await traiterDepotManuel(mail({}, [piece('x.pdf', 'ref 0930012500081')]), 'entreprise', h.deps);
    expect(res.issue).toBe('verse');
    expect(res.echecs).toEqual(['x.pdf (type non autorisé pour le dépôt)']);
    expect(h.alertes[0].corps).toContain('NON versées');
  });
});
