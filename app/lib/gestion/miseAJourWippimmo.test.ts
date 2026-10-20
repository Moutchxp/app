import { describe, expect, it } from 'vitest';
import type { PlanImport, ProprietairePlan, LotPlan, LocatairePlan, OccupationPlan } from './annuaireImport';
import {
  adapterBailleurs, calculerMiseAJour, occupationsASortieValidee, sqlMiseAJour,
  type ContactBase, type EtatBase, type LocataireBase, type LotBase, type OccupationBase, type Op, type ProprietaireBase, type ResultatMaj,
} from './miseAJourWippimmo';

const AUJ = '2026-10-20';
const NOUVEAU = ['civilite', 'prenom', 'telecoms'] as const;

const prop = (w: string, o: Partial<ProprietairePlan> = {}): ProprietairePlan => ({
  wippimmoId: w, civilite: null, nom: `NOM${w} Prénom`, prenom: null, nomComplet: `NOM${w} Prénom`, nomNormalise: `nom${w} prenom`,
  adresse: `${w} rue A`, commune: 'Paris', codePostal: '75011', adresseNormalisee: `${w} rue a paris`, relationDepuis: '2020-01-01', contacts: [], ...o,
});
const lot = (w: string, proprio: string | null, o: Partial<LotPlan> = {}): LotPlan => ({
  wippimmoId: w, proprietaireTexte: proprio === null ? '' : `NOM${proprio} Prénom`, proprietaireCle: proprio === null ? null : `nom${proprio} prenom`,
  immeuble: null, nature: 'Appartement', typeBien: 'T2', adresse: `${w} rue B`, commune: 'Paris', codePostal: '75011',
  adresseNormalisee: `${w} rue b paris`, gestionDebut: '2020-01-01', gestionFin: null, ...o,
});
const loc = (cle: string, w: string, o: Partial<LocatairePlan> = {}): LocatairePlan => ({
  clePersonne: cle, wippimmoId: w, nom: `LOC ${cle}`, nomNormalise: `loc ${cle}`, adresse: null, commune: null, codePostal: null, adresseNormalisee: '', contacts: [], ...o,
});
const occ = (w: string, cle: string, lotW: string, entree: string | null, sortie: string | null): OccupationPlan => ({ wippimmoId: w, clePersonne: cle, lotWippimmoId: lotW, lotConnu: true, entree, sortie });
const plan = (p: Partial<PlanImport>): PlanImport => ({
  proprietaires: [], lots: [], locataires: [], occupations: [], rejets: [], homonymes: [], lotsSansProprietaire: 0, occupationsHorsGestion: 0, locatairesRegroupes: 0, ...p,
});

const bProp = (id: string, w: string, o: Partial<ProprietaireBase> = {}): ProprietaireBase => {
  const p = prop(w);
  return { id, wippimmo_id: w, cle_import: null, civilite: 'Mme', nom: `NOM${w}`, prenom: 'Prénom', nom_complet: p.nomComplet, nom_normalise: p.nomNormalise,
    adresse: p.adresse, commune: p.commune, code_postal: p.codePostal, adresse_normalisee: p.adresseNormalisee, relation_depuis: p.relationDepuis,
    absent_le: null, archive_le: null, supprime_le: null, sorti_portefeuille_le: null, ...o };
};
const bLot = (id: string, w: string, proprio: string | null, proprietaireId: string | null, o: Partial<LotBase> = {}): LotBase => {
  const l = lot(w, proprio);
  return { id, wippimmo_id: w, proprietaire_id: proprietaireId, proprietaire_texte: l.proprietaireTexte, immeuble: null, nature: l.nature, type_bien: l.typeBien,
    adresse: l.adresse, commune: l.commune, code_postal: l.codePostal, adresse_normalisee: l.adresseNormalisee, gestion_debut: l.gestionDebut, gestion_fin: null,
    taux_honos_wippimmo: null, base_honos_wippimmo: null, absent_le: null, sorti_portefeuille_le: null, ...o };
};
const bLoc = (id: string, cle: string, w: string, o: Partial<LocataireBase> = {}): LocataireBase => ({
  id, cle_personne: cle, wippimmo_id: w, cle_import: null, nom: `LOC ${cle}`, nom_normalise: `loc ${cle}`, adresse: null, commune: null, code_postal: null,
  adresse_normalisee: '', absent_le: null, archive_le: null, supprime_le: null, sorti_portefeuille_le: null, ...o,
});
const bOcc = (id: string, w: string, locataireId: string, lotId: string, lotW: string, entree: string | null, sortie: string | null): OccupationBase => ({
  id, wippimmo_id: w, cle_import: null, locataire_id: locataireId, lot_id: lotId, lot_wippimmo_id: lotW, entree, sortie, absent_le: null,
});
const etat = (e: Partial<EtatBase>): EtatBase => ({
  proprietaires: [], lots: [], locataires: [], occupations: [], contacts: [], verrous: [], lotProprietaires: [], journalSorties: [], preavis: [], avecTaux: false, ...e,
});
const calc = (p: PlanImport, e: EtatBase) => calculerMiseAJour(p, e, { absentes: [...NOUVEAU], aujourdhui: AUJ });
const maj = (r: ResultatMaj, table: string) => r.ops.filter((o): o is Extract<Op, { sorte: 'maj' }> => o.sorte === 'maj' && o.table === table);
const crees = (r: ResultatMaj, table: string) => r.ops.filter((o): o is Extract<Op, { sorte: 'creer' }> => o.sorte === 'creer' && o.table === table);

describe('le nouveau format de Bailleurs.xlsx', () => {
  it('lit « Propriétaire » comme le nom entier, et dit quelles colonnes manquent', () => {
    const r = adapterBailleurs({ entetes: ['Id', 'Propriétaire', 'Adresse', 'Commune', 'C.P.', 'Mobile', 'Email'], lignes: [['1', 'DUPONT Jean']] });
    expect(r.feuille.entetes[1]).toBe('Nom');
    expect(r.absentes).toEqual(['civilite', 'prenom', 'telecoms']);
  });
  it('laisse l’ancien format tel quel', () => {
    const f = { entetes: ['Id', 'Civilité', 'Nom prop.', 'Prénom prop.', 'Télécoms', 'Mobile'], lignes: [] };
    const r = adapterBailleurs(f);
    expect(r.feuille).toBe(f);
    expect(r.absentes).toEqual([]);
  });
});

describe('les propriétaires', () => {
  it('Id connu : seuls les champs WIPPIMMO qui changent ; civilité et prénom absents de l’export ne sont jamais touchés', () => {
    const r = calc(plan({ proprietaires: [prop('7', { adresse: '9 rue Neuve', adresseNormalisee: '9 rue neuve paris' })] }), etat({ proprietaires: [bProp('70', '7')] }));
    const m = maj(r, 'proprietaire');
    expect(m).toHaveLength(1);
    expect(Object.keys(m[0].apres).sort()).toEqual(['adresse', 'adresse_normalisee']);
    expect(r.comptes.proprietaire).toEqual({ crees: 0, majs: 1, inchanges: 0 });
  });
  it('un champ verrouillé (saisi dans l’application) n’est pas écrit : conflit listé', () => {
    const r = calc(plan({ proprietaires: [prop('7', { adresse: '9 rue Neuve' })] }),
      etat({ proprietaires: [bProp('70', '7')], verrous: [{ sujet: 'proprietaire', sujet_id: '70', champ: 'adresse' }] }));
    expect(maj(r, 'proprietaire').flatMap((o) => Object.keys(o.apres))).not.toContain('adresse');
    expect(r.conflits.find((c) => c.champ === 'adresse')?.motif).toMatch(/verrou/);
  });
  it('un autre nom sur le même Id : conflit, ni la fiche ni le texte de ses lots ne changent', () => {
    const r = calc(plan({ proprietaires: [prop('7', { nomComplet: 'AUTRE Personne', nomNormalise: 'autre personne' })], lots: [{ ...lot('1', '7'), proprietaireTexte: 'AUTRE Personne', proprietaireCle: 'autre personne' }] }),
      etat({ proprietaires: [bProp('70', '7')], lots: [bLot('10', '1', '7', '70')] }));
    expect(r.ops).toEqual([]);
    expect(r.conflits.map((c) => `${c.table}.${c.champ}`).sort()).toEqual(['lot.proprietaire_texte', 'proprietaire.nom']);
  });
  it('nouvel Id = création ; son nouveau lot le désigne par sa clé, et il est noté pour l’arborescence', () => {
    const r = calc(plan({ proprietaires: [prop('8')], lots: [lot('2', '8')] }), etat({}));
    expect(crees(r, 'proprietaire')[0].valeurs).toMatchObject({ wippimmo_id: '8', nom: 'NOM8 Prénom', prenom: null, civilite: null });
    expect(crees(r, 'lot')[0].valeurs.proprietaire_id).toEqual({ proprietaire: '8' });
    expect(r.nouveaux).toEqual({ proprietaires: ['8'], lots: [{ lot: '2', proprietaire: { proprietaire: '8' } }] });
  });
});

describe('jamais de suppression ni de marque « absent »', () => {
  it('ce qui manque à l’export est listé, et aucune opération ne le touche', () => {
    const e = etat({
      proprietaires: [bProp('70', '7'), bProp('71', 'app-x', { wippimmo_id: 'app-x' })], lots: [bLot('10', '1', '7', '70')],
      locataires: [bLoc('30', 'loc#a', '50')], occupations: [bOcc('40', '50', '30', '10', '1', '2020-01-01', null)],
    });
    const r = calc(plan({}), e);
    expect(r.ops).toEqual([]);
    expect(r.absents.map((a) => `${a.table}:${a.id}`).sort()).toEqual(['locataire:30', 'lot:10', 'occupation:40', 'proprietaire:70']);
  });
  it('une fiche revenue dans l’export perd sa marque d’un import précédent (absent_le → NULL), rien d’autre', () => {
    const r = calc(plan({ proprietaires: [prop('7')] }), etat({ proprietaires: [bProp('70', '7', { absent_le: '2026-09-28T16:00:00+02:00' })] }));
    expect(maj(r, 'proprietaire')[0].apres).toEqual({ absent_le: null });
    expect(r.revenus).toBe(1);
  });
});

describe('les lots', () => {
  it('le bailleur n’est jamais vidé quand l’export ne permet pas de le rattacher', () => {
    const r = calc(plan({ proprietaires: [prop('7')], lots: [lot('1', null)] }), etat({ proprietaires: [bProp('70', '7')], lots: [bLot('10', '1', '7', '70')] }));
    expect(maj(r, 'lot').flatMap((o) => Object.keys(o.apres))).not.toContain('proprietaire_id');
    expect(r.conflits.some((c) => c.table === 'lot' && c.champ === 'propriétaire')).toBe(true);
  });
  it('un bien dont l’application tient les propriétaires (remplacement, co-propriétaire) ne change pas de bailleur', () => {
    const e = etat({ proprietaires: [bProp('70', '7'), bProp('71', '8')], lots: [bLot('10', '1', '7', '70')],
      lotProprietaires: [{ lot_id: '10', proprietaire_id: '70', jusqu_a: '2026-05-01', cree_par_libelle: 'Arno' }] });
    const r = calc(plan({ proprietaires: [prop('7'), prop('8')], lots: [lot('1', '8')] }), e);
    expect(maj(r, 'lot').flatMap((o) => Object.keys(o.apres))).not.toContain('proprietaire_id');
    expect(r.conflits.find((c) => c.champ === 'propriétaire')?.motif).toMatch(/application/);
  });
  it('un nouveau lot à l’adresse d’un bien créé dans l’application chez le même bailleur n’est pas doublé', () => {
    const e = etat({ proprietaires: [bProp('70', '7')], lots: [bLot('11', 'app-1', null, '70', { adresse_normalisee: '2 rue b paris' })] });
    const r = calc(plan({ proprietaires: [prop('7')], lots: [lot('2', '7')] }), e);
    expect(crees(r, 'lot')).toEqual([]);
    expect(r.conflits[0].motif).toMatch(/doublon possible/);
  });
});

describe('les locataires et leurs baux', () => {
  it('rapprochés par l’Id de leurs baux : un e-mail changé ne crée pas une seconde personne', () => {
    const e = etat({ proprietaires: [bProp('70', '7')], lots: [bLot('10', '1', '7', '70')],
      locataires: [bLoc('30', 'loc a#ancien@x.fr', '50')], occupations: [bOcc('40', '50', '30', '10', '1', '2020-01-01', null)] });
    const r = calc(plan({ proprietaires: [prop('7')], lots: [lot('1', '7')], locataires: [loc('loc a#nouveau@x.fr', '50', { nom: 'LOC loc a#ancien@x.fr', nomNormalise: 'loc loc a#ancien@x.fr' })],
      occupations: [occ('50', 'loc a#nouveau@x.fr', '1', '2020-01-01', null)] }), e);
    expect(crees(r, 'locataire')).toEqual([]);
    expect(crees(r, 'occupation')).toEqual([]);
  });
  it('dates mises à jour depuis WIPPIMMO… sauf pour un bail dont la sortie a été validée dans l’application', () => {
    const e = etat({ proprietaires: [bProp('70', '7')], lots: [bLot('10', '1', '7', '70')],
      locataires: [bLoc('30', 'a', '50'), bLoc('31', 'b', '51')],
      occupations: [bOcc('40', '50', '30', '10', '1', '2020-01-01', '2026-10-01'), bOcc('41', '51', '31', '10', '1', '2020-01-01', null)],
      journalSorties: [{ action: 'location_sortie_locataire', entite_id: '30', valeur_apres: '2026-10-01', commentaire: 'sortie du logement x (lot 10) le 2026-10-01 — occupation(s) 40' }] });
    const r = calc(plan({ proprietaires: [prop('7')], lots: [lot('1', '7')], locataires: [loc('a', '50'), loc('b', '51')],
      occupations: [occ('50', 'a', '1', '2020-01-01', '2026-09-30'), occ('51', 'b', '1', '2020-01-01', '2026-11-30')] }), e);
    expect(maj(r, 'occupation').map((o) => [o.id, o.apres])).toEqual([['41', { sortie: '2026-11-30' }]]);
    expect(r.conflits.find((c) => c.table === 'occupation')).toMatchObject({ champ: 'sortie', wippimmo: '2026-09-30', appli: '2026-10-01' });
  });
  it('les gestes de sortie journalisés désignent leurs occupations (sortie, correction, clôture d’archivage)', () => {
    const occs = [bOcc('40', '50', '30', '10', '1', null, null), bOcc('41', '51', '31', '12', '2', null, null)];
    const s = occupationsASortieValidee([
      { action: 'location_sortie_corrigee', entite_id: '30', valeur_apres: null, commentaire: 'date de sortie corrigée : a → b — occupation(s) 40, 77' },
      { action: 'location_cloture_archivage', entite_id: '31', valeur_apres: null, commentaire: 'location du bien 12 close le 2026-10-19 par l’archivage' },
      { action: 'location_preavis_enregistre', entite_id: '30', valeur_apres: null, commentaire: 'occupation(s) 99' },
    ], occs);
    expect([...s].sort()).toEqual(['40', '41', '77']);
  });
});

describe('les coordonnées', () => {
  const c = (id: string, valeur: string, o: Partial<ContactBase> = {}): ContactBase => ({ id, sujet: 'proprietaire', sujet_id: '70', sorte: 'telephone', valeur, valeur_brute: valeur, rang: 0, libelle_source: 'Mobile', absent_le: null, archive_le: null, origine: 'import', ...o });
  const ct = (valeur: string) => ({ sorte: 'telephone' as const, valeur, valeurBrute: valeur, rang: 0, libelleSource: 'Mobile' });
  it('ajoutée si nouvelle ; une coordonnée retirée dans l’application n’est pas rétablie ; une absente est listée, jamais marquée', () => {
    const e = etat({ proprietaires: [bProp('70', '7')], contacts: [c('1', '+331', { archive_le: '2026-10-01T00:00:00Z' }), c('2', '+332'), c('3', '+333', { origine: 'saisie' })] });
    const r = calc(plan({ proprietaires: [prop('7', { contacts: [ct('+331'), ct('+334')] })] }), e);
    expect(crees(r, 'contact').map((o) => [o.valeurs.valeur, o.valeurs.rang])).toEqual([['+334', 1]]);
    expect(r.conflits.map((x) => x.motif)).toEqual(['coordonnée retirée à la main : non rétablie']);
    expect(r.contactsAbsents).toHaveLength(1);
    expect(maj(r, 'contact')).toEqual([]);
  });
});

describe('le SQL', () => {
  const r = calc(plan({ proprietaires: [prop('7', { adresse: "1 rue de l'Église" }), prop('8')], lots: [lot('2', '8')] }), etat({ proprietaires: [bProp('70', '7')] }));
  const sql = sqlMiseAJour(r, { reel: true, dossier: 'd', auteur: 'a', resume: 'r' });
  it('une seule transaction, chaque mise à jour gardée par la valeur lue, une discordance annule tout', () => {
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(sql.replace(/\s+/g, ' ')).toContain("adresse IS NOT DISTINCT FROM '7 rue A'");
    expect(sql).toContain('RAISE EXCEPTION \'DISCORDANCE');
    expect(sql).toContain("'1 rue de l''Église'");
  });
  it('une ligne créée ici est relue par sa clé unique (STRICT), et la passe est inscrite au registre et au journal', () => {
    expect(sql).toContain("SELECT id INTO STRICT r1 FROM gestion_annuaire_proprietaire WHERE wippimmo_id = '8';");
    expect(sql).toContain('INSERT INTO gestion_annuaire_import');
    expect(sql).toContain('INSERT INTO gestion_journal');
  });
  it('aucune suppression, aucune marque « absent »', () => {
    expect(sql).not.toMatch(/\bDELETE\b|\bTRUNCATE\b|absent_le = now\(\)/i);
  });
  it('à blanc : ROLLBACK', () => {
    expect(sqlMiseAJour(r, { reel: false, dossier: 'd', auteur: 'a', resume: 'r' }).trimEnd().endsWith('ROLLBACK;')).toBe(true);
  });
});

describe('relançable sans doublon', () => {
  it('une fois les opérations appliquées, le même export ne rend plus aucune opération', () => {
    const p = plan({ proprietaires: [prop('7', { adresse: '9 rue Neuve' }), prop('8')], lots: [lot('1', '7', { gestionFin: '2026-12-31' }), lot('2', '8')],
      locataires: [loc('a', '50')], occupations: [occ('50', 'a', '2', '2026-01-01', null)] });
    const e = etat({ proprietaires: [bProp('70', '7')], lots: [bLot('10', '1', '7', '70')] });
    const r = calc(p, e);
    // Application en mémoire, comme le ferait la base.
    let n = 100;
    const ids = new Map<string, string>();
    const res = (v: unknown) => (v !== null && typeof v === 'object' ? ('id' in v ? (v as { id: string }).id : ids.get(JSON.stringify(v))!) : v);
    const tables: Record<string, Record<string, unknown>[]> = { proprietaire: e.proprietaires as never, lot: e.lots as never, locataire: e.locataires as never, occupation: e.occupations as never, contact: e.contacts as never };
    for (const o of r.ops) {
      if (o.sorte === 'creer') {
        n += 1; const ligne: Record<string, unknown> = { id: String(n), absent_le: null, archive_le: null, supprime_le: null, sorti_portefeuille_le: null, cle_import: null, origine: 'import' };
        for (const [k, v] of Object.entries(o.valeurs)) ligne[k] = res(v);
        tables[o.table].push(ligne);
        const cle = o.table === 'locataire' ? { locataire: o.valeurs.cle_personne } : { [o.table]: o.valeurs.wippimmo_id };
        ids.set(JSON.stringify(cle), String(n));
      } else {
        const ligne = tables[o.table].find((x) => x.id === o.id)!;
        for (const [k, v] of Object.entries(o.apres)) ligne[k] = res(v);
      }
    }
    expect(r.ops.length).toBeGreaterThan(0);
    expect(calc(p, e).ops).toEqual([]);
  });
});
