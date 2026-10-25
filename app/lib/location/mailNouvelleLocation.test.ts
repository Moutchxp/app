import { describe, expect, it } from 'vitest';
import {
  bandeauAdresses, bandeauGli, cleAdresse, dateEnLettres, grouperParAdresse, htmlNouvelleLocation, lignesBailMail, lignesDuLot, listeProposee,
  lotDuMail, mentionEnvoi, objetNouvelleLocation, statutProprietaires, texteNouvelleLocation, verifierDestinataires,
  type DonneesNouvelleLocation, type LotSource, type PersonneMail,
} from './mailNouvelleLocation';
import type { ConditionsEntree } from './conditionsEntree';
import type { CalculHonoraires } from './honorairesProprietaire';

/**
 * 🔴 LE MAIL « NOUVELLE LOCATION » (Arno, 21/10/2026) — le contenu, tiré à la source. Modèle :
 * `docs/modeles/modele-mail-nouveau-locataire.html`.
 */
const P = (nom: string, prenom: string, plus: Partial<PersonneMail> = {}): PersonneMail => ({
  civilite: 'M.', nom, prenom, qualite: null, adresse: null, mobiles: [], fixes: [], emails: [], note: null, ...plus,
});
const VIDE: LotSource = {
  id: 1, principal: true, categorie: 'logement', typeLibelle: 'Appartement', nombrePieces: 3, meuble: false, nomAnnexe: null, parkingSituation: null, parkingType: null,
  voie: '12 rue Victor Hugo', codePostal: '92400', commune: 'Courbevoie', porte: null, numLotCopro: null, batiment: null, escalier: null, etage: null,
  precisionAcces: null, ascenseur: null, digicode: null, digicodeCode: null, surfaceHabitable: null, surfaceCarrez: null, surfaceExterieure: null, surface: null,
  construction: null, chauffage: null, dpeClasse: null, dpeDate: null, dpeNonSoumis: null, syndic: null, derniereAg: null, assurancePno: null, pnoAnniversaire: null,
  entretiens: [], annotation: null, commentaire: null,
};
const ADR = { voie: '12 rue Victor Hugo', codePostal: '92400', commune: 'Courbevoie' };
const CONDITIONS: ConditionsEntree = {
  depot: 'agence', prelevement: true, jour: 5, garant: true, assurance: 'aucune', assurancePrecision: null,
  honorairesLocataire: 'agence', honorairesProprietaire: 'gestion',
  sommes: { prorataLoyer: 124000, prorataCharges: 18000, depotGarantie: 124000, honorairesAgence: 77682 },
  reglement: 'virement', reglementPrecision: null, commentaire: null,
};
const HONO: CalculHonoraires = {
  etat: 'ok', surface: '61.8', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, baremeId: 1, baremeDepuis: '2026-01-01', source: 'x',
  tarifZone: '12.1', tarifEdl: '3.03', visiteBail: '747.78', etatDesLieux: '187.254', total: '935.034',
};

function donnees(plus: Partial<DonneesNouvelleLocation> = {}): DonneesNouvelleLocation {
  const principal = lotDuMail({ ...VIDE, porte: 'Porte gauche', numLotCopro: '47', digicode: true, digicodeCode: '57B83', surfaceCarrez: '61.8' }, ADR);
  const cave = lotDuMail({ ...VIDE, id: 2, principal: false, categorie: 'cave', typeLibelle: null, nombrePieces: null, meuble: null, voie: '12 RUE VICTOR-HUGO', porte: '12', numLotCopro: '112', etage: '-1' }, ADR);
  return {
    bailId: 9, entree: '2026-11-01', bien: ADR,
    statut: statutProprietaires({ proprietaires: [{ nom: 'M. DUPONT Jean', dejaEnGestion: false, depuis: null }], biensEnGestion: 1, mandats: ['G-2026-041'] }),
    proprietaires: [P('DUPONT', 'Jean', { mobiles: ['06 12 34 56 78', '07 11 22 33 44'], fixes: ['01 45 67 89 10'], emails: ['jean@exemple.test', 'j2@exemple.test'], note: 'Le matin' })],
    lots: [principal, cave], gli: bandeauGli({ assurance: 'aucune', precision: null, garantPhysique: true }, ['M. MARTIN Henri']),
    locataires: [P('MARTIN', 'Sophie', { civilite: 'Mme', mobiles: ['06 11 22 33 44'], emails: ['sophie@exemple.test'] }), P('MARTIN', 'Paul')],
    garants: [{ ...P('MARTIN', 'Henri', { emails: ['henri@exemple.test'] }), garantit: ['Mme MARTIN Sophie', 'M. MARTIN Paul'] }],
    bail: { loyer: { principal: 124000, provisions: 18000 }, lignes: lignesBailMail('2026-11-01', CONDITIONS, HONO) },
    driveUrl: 'https://drive.google.com/drive/folders/ABC', expediteur: 'gestion@criterimmo.fr', ...plus,
  };
}

describe('🔴 statut du propriétaire : nouveau / déjà en gestion (1 et 2 propriétaires)', () => {
  it('UN propriétaire nouveau : « NOUVEAU / PROPRIÉTAIRE », « Premier bien confié en gestion par … », le mandat s’il est renseigné', () => {
    const s = statutProprietaires({ proprietaires: [{ nom: 'M. DUPONT Jean', dejaEnGestion: false, depuis: null }], biensEnGestion: 1, mandats: ['G-1', ''] });
    expect(s).toEqual({ sorte: 'nouveau', pastille: ['NOUVEAU', 'PROPRIÉTAIRE'], objet: 'NOUVEAU PROPRIÉTAIRE',
      phrase: 'Premier bien confié en gestion par M. DUPONT Jean', mandat: 'Mandat de gestion n° G-1' });
  });
  it('DEUX propriétaires nouveaux : au pluriel, les deux noms', () => {
    const s = statutProprietaires({ proprietaires: [{ nom: 'M. DUPONT Jean', dejaEnGestion: false, depuis: null }, { nom: 'Mme DUPONT Claire', dejaEnGestion: false, depuis: null }], biensEnGestion: 1, mandats: [] });
    expect(s.pastille).toEqual(['NOUVEAUX', 'PROPRIÉTAIRES']);
    expect(s.objet).toBe('NOUVEAUX PROPRIÉTAIRES');
    expect(s.phrase).toBe('Premier bien confié en gestion par M. DUPONT Jean et Mme DUPONT Claire');
    expect(s.mandat).toBeNull();
  });
  it('UN propriétaire déjà en gestion : « PROPRIÉTAIRE / DÉJÀ EN GESTION », depuis le …, N biens', () => {
    const s = statutProprietaires({ proprietaires: [{ nom: 'M. DUPONT Jean', dejaEnGestion: true, depuis: '2019-03-15' }], biensEnGestion: 3, mandats: [] });
    expect(s).toMatchObject({ sorte: 'deja', pastille: ['PROPRIÉTAIRE', 'DÉJÀ EN GESTION'], objet: 'PROPRIÉTAIRE DÉJÀ EN GESTION',
      phrase: 'En gestion depuis le 15/03/2019 · 3 biens en gestion' });
  });
  it('DEUX propriétaires déjà en gestion : au pluriel, la date la plus ancienne', () => {
    const s = statutProprietaires({ proprietaires: [{ nom: 'A', dejaEnGestion: true, depuis: '2021-01-01' }, { nom: 'B', dejaEnGestion: true, depuis: '2018-06-01' }], biensEnGestion: 1, mandats: [] });
    expect(s.objet).toBe('PROPRIÉTAIRES DÉJÀ EN GESTION');
    expect(s.phrase).toBe('En gestion depuis le 01/06/2018 · 1 bien en gestion');
  });
  it('HISTORIQUES DIFFÉRENTS : un déjà en gestion suffit ; le copropriétaire qui arrive est nommé', () => {
    const s = statutProprietaires({ proprietaires: [{ nom: 'M. DUPONT Jean', dejaEnGestion: true, depuis: null }, { nom: 'Mme DURAND Claire', dejaEnGestion: false, depuis: null }], biensEnGestion: 2, mandats: [] });
    expect(s.objet).toBe('PROPRIÉTAIRES DÉJÀ EN GESTION');
    expect(s.phrase).toBe('Déjà en gestion · 2 biens en gestion · nouveau copropriétaire : Mme DURAND Claire');
  });
});

describe('🔴 BANDEAU GARANTIE (Arno, 21/10/2026) : GLI, Visale, Autre en vert ; Aucune en rouge ; non renseignée en orange ; l’objet', () => {
  const sansSuffixe = 'Nouvelle location · NOUVEAU PROPRIÉTAIRE · 12 rue Victor Hugo, Courbevoie · MARTIN · 01/11/2026';
  it('GLI : vert ✓ « ASSURANCE LOYERS IMPAYÉS (GLI) » + l’assureur et le n° de contrat saisis ; l’objet sans suffixe', () => {
    const g = bandeauGli({ assurance: 'gli', precision: 'AXA · contrat 123', garantPhysique: false }, []);
    expect(g).toEqual({ etat: 'oui', sorte: 'gli', titre: 'ASSURANCE LOYERS IMPAYÉS (GLI)', detail: 'GLI — AXA · contrat 123' });
    expect(objetNouvelleLocation(donnees({ gli: g }))).toBe(sansSuffixe);
  });
  it('🔴 Arno (25/10/2026) — GLI Garantme : « GLI — Garantme » (casse et espaces de la saisie ignorés) ; GLI personnalisée : « GLI — <texte> »', () => {
    expect(bandeauGli({ assurance: 'gli', precision: 'Garantme', garantPhysique: false }, []).detail).toBe('GLI — Garantme');
    expect(bandeauGli({ assurance: 'gli', precision: ' garant me ', garantPhysique: false }, []).detail).toBe('GLI — Garantme');
    expect(bandeauGli({ assurance: 'gli', precision: 'Assureur X', garantPhysique: false }, []).detail).toBe('GLI — Assureur X');
    expect(bandeauGli({ assurance: 'gli', precision: null, garantPhysique: false }, []).detail).toBeNull();
  });
  it('Visale : vert ✓ « GARANTIE VISALE » + le n° de visa s’il est saisi ; jamais « SANS GLI »', () => {
    expect(bandeauGli({ assurance: 'visale', precision: null, garantPhysique: true }, ['M. MARTIN Henri'])).toEqual({ etat: 'oui', sorte: 'visale', titre: 'GARANTIE VISALE', detail: null });
    const g = bandeauGli({ assurance: 'visale', precision: 'V123456789', garantPhysique: false }, []);
    expect(g).toEqual({ etat: 'oui', sorte: 'visale', titre: 'GARANTIE VISALE', detail: 'N° de visa : V123456789' });
    expect(objetNouvelleLocation(donnees({ gli: g }))).toBe(sansSuffixe);
  });
  it('Autre : vert ✓ « GARANTIE : <détail saisi> », ou « AUTRE GARANTIE » sans détail ; jamais « SANS GLI »', () => {
    const g = bandeauGli({ assurance: 'autre', precision: 'caution bancaire', garantPhysique: false }, []);
    expect(g).toEqual({ etat: 'oui', sorte: 'autre', titre: 'GARANTIE : caution bancaire', detail: null });
    expect(bandeauGli({ assurance: 'autre', precision: '  ', garantPhysique: false }, []).titre).toBe('AUTRE GARANTIE');
    expect(objetNouvelleLocation(donnees({ gli: g }))).toBe(sansSuffixe);
  });
  it('Aucune : rouge ✕ « PAS D’ASSURANCE LOYERS IMPAYÉS » + la caution en place (les garants), ou « Aucune garantie » ; « · SANS GLI »', () => {
    const g = bandeauGli({ assurance: 'aucune', precision: null, garantPhysique: true }, ['M. MARTIN Henri', 'Mme MARTIN Sophie']);
    expect(g).toEqual({ etat: 'non', sorte: 'aucune', titre: 'PAS D’ASSURANCE LOYERS IMPAYÉS', detail: 'Caution en place : M. MARTIN Henri et Mme MARTIN Sophie' });
    expect(bandeauGli({ assurance: 'aucune', precision: null, garantPhysique: false }, []).detail).toBe('Aucune garantie');
    expect(bandeauGli({ assurance: 'aucune', precision: null, garantPhysique: true }, []).detail).toBe('Caution en place : garant personne physique');
    expect(objetNouvelleLocation(donnees({ gli: g }))).toMatch(/ · 01\/11\/2026 · SANS GLI$/);
  });
  it('non renseignée (pas de conditions d’entrée) : orange « GARANTIE NON RENSEIGNÉE » ; « · GARANTIE À VÉRIFIER »', () => {
    const g = bandeauGli(null, []);
    expect(g).toMatchObject({ etat: 'inconnue', sorte: null, titre: 'GARANTIE NON RENSEIGNÉE' });
    expect(objetNouvelleLocation(donnees({ gli: g }))).toMatch(/ · GARANTIE À VÉRIFIER$/);
  });
  it('les couleurs et le signe : vert ✓ pour GLI, Visale, Autre ; rouge ✕ pour Aucune ; orange ! pour non renseignée (HTML et texte)', () => {
    // Le fond pâle et le rond du signe, lus JUSTE AVANT le titre du bandeau (la pastille de statut a aussi du vert).
    const cas: [Parameters<typeof bandeauGli>[0], string, string, string][] = [
      [{ assurance: 'gli', precision: 'AXA', garantPhysique: false }, '#e8f4ec', '#2f7d4f', '✓'], [{ assurance: 'visale', precision: null, garantPhysique: false }, '#e8f4ec', '#2f7d4f', '✓'],
      [{ assurance: 'autre', precision: 'caution bancaire', garantPhysique: false }, '#e8f4ec', '#2f7d4f', '✓'],
      [{ assurance: 'aucune', precision: null, garantPhysique: false }, '#fdecec', '#d64545', '✕'], [null, '#fdf3e1', '#b7791f', '!'],
    ];
    for (const [c, fond, rond, signe] of cas) {
      const g = bandeauGli(c, []);
      const html = htmlNouvelleLocation(donnees({ gli: g }));
      const i = html.indexOf(`>${g.titre}</b>`);
      expect(i).toBeGreaterThan(-1);
      const avant = html.slice(Math.max(0, i - 1200), i);
      expect(avant).toContain(`bgcolor="${fond}"`);
      expect(avant).toContain(`bgcolor="${rond}"`);
      expect(avant).toContain(`>${signe}</td>`);
      expect(texteNouvelleLocation(donnees({ gli: g }))).toContain(`${signe} ${g.titre}`);
    }
  });
  it('l’objet suit le statut accordé (déjà en gestion, deux propriétaires) et les noms des locataires', () => {
    const statut = statutProprietaires({ proprietaires: [{ nom: 'A', dejaEnGestion: true, depuis: null }, { nom: 'B', dejaEnGestion: false, depuis: null }], biensEnGestion: 2, mandats: [] });
    const d = donnees({ statut, locataires: [P('Youenou', 'A'), P('TALHOUARN', 'B')] });
    expect(objetNouvelleLocation(d)).toBe('Nouvelle location · PROPRIÉTAIRES DÉJÀ EN GESTION · 12 rue Victor Hugo, Courbevoie · YOUENOU – TALHOUARN · 01/11/2026 · SANS GLI');
  });
});

describe('🔴 le bien loué : même adresse / adresses différentes, lots regroupés', () => {
  it('casse, accents, tirets, espaces et abréviations (bd, av, r) ne font pas une autre adresse', () => {
    expect(cleAdresse({ voie: '12 Bd Victor-Hugo', codePostal: '92 400', commune: 'COURBEVOIE' })).toBe(cleAdresse({ voie: '12  boulevard victor hugo', codePostal: '92400', commune: 'Courbevoie' }));
    expect(cleAdresse({ voie: '3 av. des Prés', codePostal: '75011', commune: 'Paris' })).toBe(cleAdresse({ voie: '3 AVENUE DES PRES', codePostal: '75011', commune: 'PARIS' }));
    expect(cleAdresse({ voie: '4 r de la Paix', codePostal: '75002', commune: 'Paris' })).toBe(cleAdresse({ voie: '4 rue de la Paix', codePostal: '75002', commune: 'Paris' }));
    expect(cleAdresse({ voie: '14 rue Victor Hugo', codePostal: '92400', commune: 'Courbevoie' })).not.toBe(cleAdresse(ADR));
  });
  it('MÊME ADRESSE : un groupe, bandeau vert', () => {
    const d = donnees();
    const g = grouperParAdresse(d.lots);
    expect(g).toHaveLength(1);
    expect(bandeauAdresses(g)).toEqual({ ok: true, titre: '✓ Tous les lots sont à la même adresse', detail: null });
    expect(htmlNouvelleLocation(d)).toContain('✓ Tous les lots sont à la même adresse');
  });
  it('ADRESSES DIFFÉRENTES : bandeau orange avec le détail, le groupe du lot principal d’abord, l’autre marqué « autre adresse »', () => {
    const parking = lotDuMail({ ...VIDE, id: 3, principal: false, categorie: 'parking', typeLibelle: null, nombrePieces: null, meuble: null, parkingType: 'box_simple',
      voie: '14 rue Victor Hugo', porte: '34', numLotCopro: '134', etage: '-1' }, ADR);
    const d = donnees();
    const lots = [parking, ...d.lots];
    const g = grouperParAdresse(lots);
    expect(g.map((x) => [x.adresse, x.lots.length, x.autre])).toEqual([['12 rue Victor Hugo, 92400 Courbevoie', 2, false], ['14 rue Victor Hugo, 92400 Courbevoie', 1, true]]);
    expect(bandeauAdresses(g)).toEqual({ ok: false, titre: '⚠ ATTENTION · lots à 2 adresses différentes', detail: '12 rue Victor Hugo (2 lots) · 14 rue Victor Hugo (1 lot)' });
    const html = htmlNouvelleLocation({ ...d, lots });
    expect(html).toContain('⚠ ATTENTION · lots à 2 adresses différentes');
    expect(html).toContain('1 lot · autre adresse');
    expect(html.indexOf('📍 12 rue Victor Hugo')).toBeLessThan(html.indexOf('📍 14 rue Victor Hugo'));
    expect(html).toContain('Parking · box simple');
  });
  it('le lot principal : grand encart, type et pièces, étiquette meublé, une caractéristique par ligne, digicode en gras', () => {
    const l = lotDuMail({ ...VIDE, porte: 'Porte gauche', numLotCopro: '47', batiment: 'B', escalier: '2', etage: '3', precisionAcces: 'À droite', ascenseur: true,
      digicode: true, digicodeCode: '57B83', surfaceHabitable: '64.2', surfaceCarrez: '61.8', surfaceExterieure: '8', construction: '1975 – 1996', chauffage: 'Individuel gaz',
      dpeClasse: 'd', dpeDate: '2024-03-12', syndic: 'FONCIA', derniereAg: '2026-06-12', assurancePno: true, pnoAnniversaire: '2027-01-01', entretiens: ['Chaudière'] }, ADR);
    expect(l.titre).toBe('Lot principal · Appartement 3 pièces');
    expect(l.etiquette).toBe('NON MEUBLÉ');
    expect(l.lignes.map((x) => `${x.mot}=${x.valeur}`)).toEqual([
      'N° affiché=Porte gauche', 'N° de lot=47', 'Bâtiment=B', 'Escalier=2', 'Étage=3ᵉ', 'Précision=À droite', 'Ascenseur=Oui', 'Digicode=57B83', 'Pièces=3',
      'Surface habitable=64,2 m²', 'Surface Carrez/Boutin=61,8 m²', 'Surface extérieure=8 m²', 'Construction=1975 – 1996', 'Chauffage=Individuel gaz',
      'DPE=Classe D, du 12/03/2024', 'Syndic=FONCIA', 'Dernière AG=12/06/2026', 'Assurance PNO=Oui · date anniversaire le 01/01/2027', 'Entretiens=Chaudière',
    ]);
    expect(l.lignes.find((x) => x.mot === 'Digicode')?.fort).toBe(true);
    expect(htmlNouvelleLocation(donnees({ lots: [l] }))).toContain('<b>57B83</b>');
  });
  it('🔴 Arno (21/10/2026, 400) — « Charges copro » EN GRAS, juste après « Syndic » ; absente si non renseignée (HTML et texte brut)', () => {
    for (const [valeur, attendu] of [['proprietaire', 'Payées par le propriétaire'], ['agence', 'Payées par l’agence']] as const) {
      const l = lotDuMail({ ...VIDE, syndic: 'FONCIA', derniereAg: '2026-06-12', chargesCopro: valeur }, ADR);
      const mots = l.lignes.map((x) => x.mot);
      expect(mots.indexOf('Charges copro')).toBe(mots.indexOf('Syndic') + 1);
      expect(l.lignes.find((x) => x.mot === 'Charges copro')).toEqual({ mot: 'Charges copro', valeur: attendu, fort: true });
      const d = donnees({ lots: [l] });
      expect(htmlNouvelleLocation(d)).toContain(`<b>${attendu.replace('’', '’')}</b>`);
      expect(texteNouvelleLocation(d)).toContain(`Charges copro : ${attendu}`);
    }
    // Sans syndic, la ligne reste là (toujours après l'emplacement du syndic).
    expect(lotDuMail({ ...VIDE, chargesCopro: 'agence' }, ADR).lignes.map((x) => x.mot)).toContain('Charges copro');
    // Non renseigné (null ou absent) : aucune ligne, ni dans le HTML ni dans le texte brut.
    for (const vide of [{ chargesCopro: null }, {}]) {
      const l = lotDuMail({ ...VIDE, syndic: 'FONCIA', ...vide }, ADR);
      expect(l.lignes.map((x) => x.mot)).not.toContain('Charges copro');
      expect(htmlNouvelleLocation(donnees({ lots: [l] }))).not.toContain('Charges copro');
      expect(texteNouvelleLocation(donnees({ lots: [l] }))).not.toContain('Charges copro');
    }
  });
  it('🔴 Arno (21/10/2026) — l’ID fiscal du bien n’entre JAMAIS dans le mail « Nouvelle location » (HTML ni texte brut)', () => {
    const l = lotDuMail({ ...VIDE, idFiscal: '921234567890' } as LotSource, ADR);
    expect(l.lignes.map((x) => x.mot).join(' ')).not.toMatch(/fiscal/i);
    const d = donnees({ lots: [l] });
    expect(htmlNouvelleLocation(d)).not.toMatch(/fiscal|921234567890/i);
    expect(texteNouvelleLocation(d)).not.toMatch(/fiscal|921234567890/i);
  });
  it('une annexe : type, N° affiché ET N° de lot chacun sur sa ligne, niveau', () => {
    const cave = lotDuMail({ ...VIDE, id: 2, principal: false, categorie: 'cave', typeLibelle: null, nombrePieces: null, meuble: null, porte: '12', numLotCopro: '112', etage: '-1' }, ADR);
    expect(cave.titre).toBe('Cave');
    expect(cave.etiquette).toBeNull();
    expect(cave.lignes).toEqual([{ mot: 'N° affiché', valeur: '12' }, { mot: 'N° de lot', valeur: '112' }, { mot: 'Niveau', valeur: '−1' }]);
  });
  it('🔴 INFORMATION ABSENTE NON AFFICHÉE : un lot sans rien n’a aucune ligne, et le mail ne dit jamais « non renseigné » hors bandeau GLI', () => {
    expect(lignesDuLot({ ...VIDE, nombrePieces: null })).toEqual([]);
    const d = donnees({ lots: [lotDuMail({ ...VIDE, nombrePieces: null }, ADR)], proprietaires: [P('DUPONT', 'Jean')], locataires: [P('MARTIN', 'Sophie')], garants: [], driveUrl: null,
      bail: { loyer: null, lignes: lignesBailMail('2026-11-01', null, null) } });
    const html = htmlNouvelleLocation(d);
    for (const mot of ['N° affiché', 'Digicode', 'Mobile', 'E-mail', 'Note', 'Qualité', 'Loyer principal', 'Prélèvement', 'GARANT', 'undefined', 'null', 'NaN']) expect(html).not.toContain(mot);
    expect(html.toLowerCase()).not.toContain('non renseign');
    expect(texteNouvelleLocation(d).toLowerCase()).not.toContain('non renseign');
    expect(html).toContain('Dossier Drive en cours de création');
    // Seul le bandeau garantie dit « NON RENSEIGNÉE ».
    expect(htmlNouvelleLocation({ ...d, gli: bandeauGli(null, []) })).toContain('GARANTIE NON RENSEIGNÉE');
  });
});

describe('🔴 le mail complet : blocs, ordre, personnes, garant, compatibilité', () => {
  const d = donnees();
  const html = htmlNouvelleLocation(d);
  it('les blocs dans l’ordre du modèle', () => {
    const ordre = ['Sans Vis-à-Vis®', 'Nouvelle location', 'entrée le 1er novembre 2026', 'NOUVEAU<br>PROPRIÉTAIRE', '>Propriétaire', 'Le bien loué', 'Locataires',
      'PAS D’ASSURANCE LOYERS IMPAYÉS', 'LOCATAIRE', 'COLOCATAIRE', 'GARANT', 'Le bail', 'Loyer principal', 'Ouvrir le dossier Drive du bail', 'Pour toute question, répondez simplement à ce mail.'];
    let i = 0;
    for (const m of ordre) { const j = html.indexOf(m, i); expect(j, m).toBeGreaterThan(-1); i = j; }
    expect(html).toContain('https://drive.google.com/drive/folders/ABC');
    expect(html).toContain('L’équipe gestion</b> · Sans Vis-à-Vis® · SARL CRITERIMMO');
  });
  it('TOUTES les coordonnées du propriétaire : tous les mobiles, fixes, e-mails, la note', () => {
    for (const x of ['06 12 34 56 78', '07 11 22 33 44', '01 45 67 89 10', 'jean@exemple.test', 'j2@exemple.test', 'Le matin', 'Téléphone fixe']) expect(html).toContain(x);
  });
  it('le GARANT : carte en pointillés, « Garantit : » en PREMIÈRE ligne', () => {
    const g = html.slice(html.indexOf('border:1px dashed'));
    expect(g).toContain('GARANT');
    expect(html).toMatch(/border:1px dashed[^>]*>[\s\S]{0,700}?M\. MARTIN Henri/);
    expect(g.indexOf('Garantit')).toBeLessThan(g.indexOf('henri@exemple.test'));
    expect(g).toContain('Mme MARTIN Sophie · M. MARTIN Paul');
  });
  it('le BAIL : loyer, total CC, entrée, prélèvement, règlement, proratas, dépôt et qui le conserve, honoraires et barème', () => {
    for (const x of ['1 240,00 €', '180,00 €', '1 420,00 €', 'Le 5 de chaque mois', 'Virement', 'Loyer 1 240,00 € · charges 180,00 €', '1 240,00 € · conservé par l’agence',
      '776,82 € · compte bancaire agence', '935,03 € · 61,8 m² × (12,10 € + 3,03 €) · barème du 01/01/2026, zone très tendue · compte bancaire gestion']) expect(html).toContain(x);
  });
  it('🔴 jamais le mot « client » ; HTML compatible (640 px, tables, styles en ligne, aucune ressource externe) ; texte brut équivalent', () => {
    expect(html.toLowerCase()).not.toMatch(/client/);
    expect(texteNouvelleLocation(d).toLowerCase()).not.toMatch(/client/);
    expect(html).toContain('width="640"');
    expect(html).toContain('role="presentation"');
    expect(html).not.toMatch(/<link|<script|<img|url\(|src="http/i);
    const t = texteNouvelleLocation(d);
    for (const x of ['NOUVELLE LOCATION', '[NOUVEAU PROPRIÉTAIRE]', 'M. DUPONT Jean — PROPRIÉTAIRE', '📍 12 rue Victor Hugo, 92400 Courbevoie (2 lots)', 'Digicode : 57B83',
      '✕ PAS D’ASSURANCE LOYERS IMPAYÉS', 'M. MARTIN Henri — GARANT', '  Garantit : Mme MARTIN Sophie · M. MARTIN Paul', 'Total charges comprises : 1 420,00 €',
      'Ouvrir le dossier Drive du bail : https://drive.google.com/drive/folders/ABC', 'gestion@criterimmo.fr']) expect(t).toContain(x);
  });
  it('les valeurs sont échappées (aucune injection de balise)', () => {
    const h = htmlNouvelleLocation(donnees({ proprietaires: [P('<b>X</b>', 'Y', { note: '"><script>' })] }));
    expect(h).not.toContain('<b>X</b>');
    expect(h).not.toContain('"><script>');
  });
  it('les dates en lettres', () => {
    expect(dateEnLettres('2026-11-01')).toBe('1er novembre 2026');
    expect(dateEnLettres('2024-10-26')).toBe('26 octobre 2024');
  });
});

describe('🔴 les destinataires d’un envoi', () => {
  const CONFIG = [
    { adresse: 'gestion@criterimmo.fr', libelle: 'Service gestion (copie de confirmation)' },
    { adresse: 'gestion.criterimmo@gmail.com', libelle: 'ADHOC' },
    { adresse: 'laura@monga.io', libelle: 'MONGA' },
  ];
  it('EN TÊTE la personne connectée (« Vous (…) · copie personnelle »), puis les trois adresses par défaut', () => {
    expect(listeProposee(CONFIG, { email: 'a.jorel@sansvisavis.com', nom: 'Arnaud Jorel' })).toEqual([
      { adresse: 'a.jorel@sansvisavis.com', libelle: 'Vous (Arnaud Jorel) · copie personnelle', personnelle: true }, ...CONFIG,
    ]);
  });
  it('PAS DE DOUBLON : l’adresse de la personne déjà dans la liste n’est pas ajoutée une seconde fois (casse ignorée)', () => {
    expect(listeProposee(CONFIG, { email: 'Gestion@Criterimmo.fr', nom: 'Service' })).toEqual(CONFIG);
    expect(listeProposee(CONFIG, { email: null, nom: 'Accès de secours' })).toEqual(CONFIG);
  });
  it('contrôle du format, pas de doublon, au moins une adresse', () => {
    expect(verifierDestinataires([{ adresse: ' a@b.fr ', libelle: ' A ' }])).toEqual({ ok: true, liste: [{ adresse: 'a@b.fr', libelle: 'A' }] });
    expect(verifierDestinataires([])).toEqual({ ok: false, motif: 'Ajoutez au moins un destinataire.' });
    expect(verifierDestinataires([{ adresse: 'pas-une-adresse', libelle: '' }])).toMatchObject({ ok: false, motif: 'Ligne 1 : « pas-une-adresse » n’est pas une adresse e-mail valide.' });
    expect(verifierDestinataires([{ adresse: 'a@b.fr' }, { adresse: 'A@B.fr' }])).toMatchObject({ ok: false, motif: '« A@B.fr » figure deux fois dans la liste.' });
    expect(verifierDestinataires([{ adresse: 'a@b.fr, c@d.fr' }])).toMatchObject({ ok: false });
  });
  it('la mention d’envoi : « Envoyé le … à … par … à … » (heure de Paris)', () => {
    expect(mentionEnvoi({ quand: '2026-10-21T12:32:00Z', par: 'Arnaud Jorel', destinataires: ['a@b.fr', 'c@d.fr'] }))
      .toBe('Envoyé le 21/10/2026 à 14:32 par Arnaud Jorel à a@b.fr, c@d.fr');
  });
});


/** 🔴 Arno (21/10/2026, 402) — le mail dit le montant SAISI À LA MAIN comme tel ; le calcul garde surface × tarifs · barème. */
describe('mail « Nouvelle location » — honoraires propriétaire calculés ou saisis à la main', () => {
  const ligne = (h: CalculHonoraires | null) => lignesBailMail('2026-11-01', CONDITIONS, h).find((l) => l.mot === 'Honoraires propriétaire')?.valeur;
  it('calculés : « 935,03 € · 61,8 m² × (…) · barème du … »', () => {
    expect(ligne(HONO)).toMatch(/^935,03 € · 61,8 m² × \(12,10 € \+ 3,03 €\) · barème du /);
  });
  it('saisis à la main : « 935,03 € (saisi à la main) » et le compte, sans barème ni surface', () => {
    const v = ligne({ etat: 'saisi', zone: 'tres_tendue', date: '2026-11-01', dateSupposee: false, total: '935.03' });
    expect(v).toBe('935,03 € (saisi à la main) · compte bancaire gestion');
    expect(v).not.toMatch(/barème|m²/);
  });
});
