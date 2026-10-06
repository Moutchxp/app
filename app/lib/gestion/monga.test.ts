/**
 * ══ 🔴🔴 LOT MONGA-1, POINT 1 — ÉPREUVES DE LA LECTURE D'UN MAIL MONGA ═══════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Les corps ci-dessous sont les VRAIS corps, recopiés de la base locale le 06/10/2026 et rognés. Les inventer
 * aurait fait des épreuves qui prouvent que mon extracteur lit ce que j'imagine que Monga écrit — c'est-à-dire
 * rien. Le défaut « MNG-20354 lu comme code postal » n'aurait JAMAIS été attrapé par un corps inventé : il tient
 * tout entier au fait que cette référence porte cinq chiffres.
 *
 * La mesure sur les **97 mails réels** vit dans `mongaRepo.itest.ts` (hors `npm test`, comme toute épreuve qui
 * touche la base) : elle compare le taux de lecture à celui de l'audit.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  badgeMonga, estAdresseMonga, etapeMonga, finDIntervention, libelleDeLObjet, libelleUtile,
  lienMissionMonga, lireEnTeteMonga, motDerniereEtape, motEncartMonga, motEtapeMonga, motFiltreMonga,
  motRenommageMonga, questionNomVerrouille, referenceMonga, referencesMonga, renommageAFaire,
} from './monga';

/** GABARIT A — le courant. Mail réel MNG-23987 (le mail de l'essai d'Arno), rogné. */
const GABARIT_A = `Monga

barre de douche defixer MNG-23987

53 avenue des Ternes, 75017 PARIS
barre de douche defixer
Bonjour Anaïs BOURBEAU

Le devis pour la mission MNG-23987 est toujours en attente de validation. Vous
pouvez le valider via le lien ci-dessous.

Vers Mission
[https://app.monga.io/missions/view/dbb10000-bd6e-6045-3484-08df17f3181f]

Une question ? interventions@monga.io [interventions@monga.io] · 01 89 71 31 25`;

/**
 * GABARIT B — « V3 ». Mail réel 5045, rogné. 🔴🔴 C'EST LE CAS DU DÉFAUT : « MNG-20354 » porte CINQ CHIFFRES, et
 * la première passe de l'audit l'a lu comme un code postal — 36 références sur 40 passaient alors pour « sans
 * bien ». Noter aussi que cette adresse n'a PAS de numéro de rue.
 */
const GABARIT_B = `
[https://app.monga.io/assets/mails/V3/logo_monga_noir.png] https://app.monga.io

[https://app.monga.io/assets/mails/V3/bordure_blanche.png]

Porte de box défaillante manque un ressort

MNG-20354



"Porte de box défaillante manque un ressort "

Rue Camille Deschanel, 92400 Courbevoie

[https://app.monga.io/assets/mails/V3/bordure_haute.png]

Bonjour

Un nouveau message vous a été envoyé concernant la mission`;

describe('monga — la référence', () => {
  it('lit la référence du corps du gabarit A', () => {
    expect(referenceMonga('MNG-23987 - Rappel 1 : Devis en attende de validation', GABARIT_A))
      .toBe('MNG-23987');
  });

  it('🔴 lit « Le ticket MONGA 20354 » SANS TIRET — le gabarit B l’écrit ainsi dans l’objet', () => {
    expect(referenceMonga('Le ticket MONGA 20354 requiert votre attention', '')).toBe('MNG-20354');
    // Sans cette branche, les mails « requiert votre attention » auraient formé une intervention à part, et
    // l'historique d'une même intervention se serait coupé en deux.
    expect(referenceMonga('Le ticket MONGA 24544 requiert votre attention', '')).toBe('MNG-24544');
  });

  it('rend null quand il n’y a aucune référence — et n’en invente pas', () => {
    expect(referenceMonga('Relevé de vos factures Monga', 'Bonjour, voici votre relevé.')).toBeNull();
    expect(referenceMonga(null, null)).toBeNull();
  });

  it('normalise la casse et liste toutes les références citées, sans doublon', () => {
    expect(referenceMonga('mng-23987 suite', '')).toBe('MNG-23987');
    expect(referencesMonga('MNG-23987 et MNG-20354', 'rappel MNG-23987'))
      .toEqual(['MNG-23987', 'MNG-20354']);
  });
});

describe('monga — l’en-tête (libellé, adresse, lien)', () => {
  it('lit le gabarit A en entier', () => {
    const e = lireEnTeteMonga('MNG-23987 - Rappel 1 : Devis en attende de validation', GABARIT_A);
    expect(e).toEqual({
      reference: 'MNG-23987',
      libelle: 'barre de douche defixer',
      adresse: '53 avenue des Ternes, 75017 PARIS',
      lienMission: 'https://app.monga.io/missions/view/dbb10000-bd6e-6045-3484-08df17f3181f',
    });
  });

  it('🔴🔴 LE DÉFAUT CORRIGÉ : « MNG-20354 » n’est pas un code postal', () => {
    const e = lireEnTeteMonga('Le ticket MONGA 20354 requiert votre attention', GABARIT_B);
    expect(e.reference).toBe('MNG-20354');
    // L'adresse est la ligne d'adresse, PAS la ligne de la référence. Avant la correction, `adresse` valait
    // « MNG-20354 » et aucun lot ne pouvait se rapprocher.
    expect(e.adresse).toBe('Rue Camille Deschanel, 92400 Courbevoie');
    expect(e.adresse).not.toContain('MNG-');
    // Le libellé est la ligne d'AVANT, parce que la ligne de la référence ne porte que la référence.
    expect(e.libelle).toBe('Porte de box défaillante manque un ressort');
  });

  it('🔴 l’adresse vient APRÈS la référence — un en-tête de transfert recopié n’en est pas une', () => {
    const transfert = `De : noreply@monga.io
Objet : MNG-23987
Date : 05/10/2026
75017 Paris, bureaux de la gestion

barre de douche defixer MNG-23987
53 avenue des Ternes, 75017 PARIS`;
    expect(lireEnTeteMonga('Tr : MNG-23987', transfert).adresse).toBe('53 avenue des Ternes, 75017 PARIS');
  });

  it('⚠️ un code postal SEUL ne fait pas une adresse (il faut des lettres)', () => {
    expect(lireEnTeteMonga('MNG-23987', 'un truc MNG-23987\n92800\n12 rue Cartault, 92800 Puteaux').adresse)
      .toBe('12 rue Cartault, 92800 Puteaux');
  });

  it('🔴🔴 LA GARDE DU CODE POSTAL : un NUMÉRO DE FACTURE n’est pas une adresse', () => {
    /**
     * C'est la garde même qui corrige le défaut « MNG-20354 », et voici ce qu'elle attrape EN PLUS de la
     * référence : « FACT-20260701-14788 » contient « 20260 », « 02607 », « 26070 »… — six fenêtres de cinq
     * chiffres, et la ligne porte des lettres. Sans l'exigence « un code postal n'est jamais collé à un tiret
     * ni encadré de chiffres », l'adresse de MNG-23830 serait devenue son numéro de facture.
     *
     * ⚠️ UNE ÉPREUVE MESURÉE : la première version de cette série ne tombait PAS quand on retirait la garde,
     * parce que le cas « MNG-20354 » est aussi écarté par l'exclusion du mot « MNG- » — un second verrou.
     * Celle-ci éprouve la garde SEULE, sur le cas qu'elle est seule à tenir.
     */
    const facture = `sangle volet hs MNG-23830
Facture FACT-20260701-14788 du 01/07/2026
44 Rue Auguste Blanche, 92800 Puteaux`;
    expect(lireEnTeteMonga('MNG-23830', facture).adresse).toBe('44 Rue Auguste Blanche, 92800 Puteaux');
  });

  it('⚠️ écarte les mentions légales, qui portent pourtant un code postal', () => {
    const legal = `fuite MNG-21801
Monga SAS au capital de 100 000 € — 75008 PARIS — RCS Paris
48 boulevard de la Mission Marchand, 92400 COURBEVOIE`;
    expect(lireEnTeteMonga('MNG-21801', legal).adresse)
      .toBe('48 boulevard de la Mission Marchand, 92400 COURBEVOIE');
  });

  it('🔴 retire les marques de citation d’un transfert (mesuré : « > 2 rue Mars et Roty »)', () => {
    const cite = `> Pouvez-vous me dire où en est le dossier MNG-19078
> 2 rue Mars et Roty, 92800 Puteaux`;
    expect(lireEnTeteMonga('MNG-19078', cite).adresse).toBe('2 rue Mars et Roty, 92800 Puteaux');
  });

  it('🔴 retire l’étiquette « Adresse : » (mesuré sur MNG-19724)', () => {
    const rdv = `Intervention plomberie MNG-19724
> • Adresse : 54 avenue du Puvis de Chavannes, 92400 COURBEVOIE`;
    expect(lireEnTeteMonga('MNG-19724', rdv).adresse)
      .toBe('54 avenue du Puvis de Chavannes, 92400 COURBEVOIE');
  });

  it('🔴 un horodatage n’est jamais un libellé — l’objet répond à la place', () => {
    const transfert = `Objet - Rappel 2 : Devis en attende de validation
Date 11/05/2026 09:00:44
MNG-19733`;
    const e = lireEnTeteMonga('MNG-19733 - Rappel 2 - fuite salle de bain', transfert);
    expect(e.libelle).toBe('fuite salle de bain');
  });

  it('le lien Mission, dans ses DEUX formes', () => {
    expect(lienMissionMonga('Vers Mission\n[https://app.monga.io/mng/20354]'))
      .toBe('https://app.monga.io/mng/20354');
    expect(lienMissionMonga(GABARIT_A))
      .toBe('https://app.monga.io/missions/view/dbb10000-bd6e-6045-3484-08df17f3181f');
    expect(lienMissionMonga('aucun lien ici')).toBeNull();
  });

  it('le libellé de l’objet : le dernier segment, jamais la référence', () => {
    expect(libelleDeLObjet('MNG-23987 - Rappel 1 : Devis en attende de validation - barre de douche defixer'))
      .toBe('barre de douche defixer');
    expect(libelleDeLObjet('Tr : MNG-23987 - fuite')).toBe('fuite');
    expect(libelleDeLObjet('Rappel - MNG-23987')).toBeNull();
    expect(libelleDeLObjet('Relevé de vos factures')).toBeNull();
  });

  it('⚠️ libelleUtile écarte le gras, les en-têtes et les lignes de facture', () => {
    expect(libelleUtile('**')).toBeNull();
    expect(libelleUtile('Subject: MNG-23987')).toBeNull();
    expect(libelleUtile('• FACT-2026-0012')).toBeNull();
    expect(libelleUtile('  fuite   sous   baignoire ')).toBe('fuite sous baignoire');
    expect(libelleUtile('en attente de règlement :')).toBe('en attente de règlement');
    // ⚠️ UN LIBELLÉ QUI COMMENCE PAR UN MOT D'EN-TÊTE N'EST PAS UN EN-TÊTE : « De-bouchage » survit, « De : »
    //    tombe. Le tiret d'un en-tête recopié est toujours suivi d'une espace.
    expect(libelleUtile('De-bouchage douche')).toBe('De-bouchage douche');
    expect(libelleUtile('Objet - Rappel 2 : Devis en attende de validation')).toBeNull();
  });

  it('l’adresse de Monga, sous-domaines compris', () => {
    expect(estAdresseMonga('noreply@monga.io')).toBe(true);
    expect(estAdresseMonga('comptabilite@leanpay.monga.io')).toBe(true);
    expect(estAdresseMonga('NOREPLY@MONGA.IO ')).toBe(true);
    // ⚠️ un domaine qui se TERMINE par monga.io n'est pas monga.io : « fauxmonga.io » doit tomber.
    expect(estAdresseMonga('a@fauxmonga.io')).toBe(false);
    expect(estAdresseMonga('a.jorel@sansvisavis.com')).toBe(false);
    expect(estAdresseMonga(null)).toBe(false);
  });
});

describe('monga — les étapes', () => {
  it('🔴 l’objet décide', () => {
    expect(etapeMonga('MNG-23987 - Devis envoyé - fuite')).toBe('devis_envoye');
    expect(etapeMonga('MNG-23987 - Rappel 1 : Devis en attende de validation')).toBe('devis_rappel');
    expect(etapeMonga('MNG-23987 - Nouveau commentaire')).toBe('commentaire');
    expect(etapeMonga('Le ticket MONGA 20354 requiert votre attention')).toBe('attention');
    expect(etapeMonga('MNG-21641 - Mission terminée')).toBe('terminee');
    expect(etapeMonga('Facture Monga n° FACT-2026-0012')).toBe('facture');
    // Objet RÉEL, apostrophe droite comprise — et la variante typographique est acceptée aussi.
    expect(etapeMonga('Monga X CRITERIMMO: Rappel de l\'échéance de votre facture')).toBe('relance_facture');
    expect(etapeMonga('Rappel de l’échéance de votre facture')).toBe('relance_facture');
    expect(etapeMonga('Fwd: RELANCE - Factures Impayées - MONGA X CRITERIMMO')).toBe('relance_facture');
    expect(etapeMonga('MNG-23987 - Compte-rendu d’intervention')).toBe('compte_rendu');
    expect(etapeMonga('[MONGA] Invitation: formation')).toBe('service');
    expect(etapeMonga('MNG-23987')).toBe('autre');
  });

  it('⚠️ « Mission terminée » l’emporte, même annoncée dans le corps seul', () => {
    expect(etapeMonga('MNG-21641 - Nouveau commentaire', 'La mission terminée, le paiement a été reçu.'))
      .toBe('terminee');
  });

  it('🔴 SEULE « terminee » marque une fin — un seul mail du corpus la porte', () => {
    expect(finDIntervention('terminee')).toBe(true);
    for (const e of ['devis_envoye', 'devis_rappel', 'commentaire', 'attention', 'facture',
      'relance_facture', 'compte_rendu', 'service', 'autre'] as const) {
      expect(finDIntervention(e)).toBe(false);
    }
  });

  it('chaque étape a un mot, et aucun ne manque', () => {
    for (const e of ['devis_envoye', 'devis_rappel', 'commentaire', 'attention', 'terminee', 'facture',
      'relance_facture', 'compte_rendu', 'service'] as const) {
      expect(motEtapeMonga(e)).not.toBe('Étape inconnue');
    }
    expect(motEtapeMonga('autre')).toBe('Étape inconnue');
  });

  it('« Devis en attente de validation · 05/10 » — heure de Paris, jamais UTC', () => {
    // 🔴 23:30 UTC le 04/10 est le 05/10 à Paris. Un `toISOString()` aurait affiché le 04.
    expect(motDerniereEtape('devis_rappel', '2026-10-04T23:30:00Z'))
      .toBe('Devis en attente de validation · 05/10');
    expect(motDerniereEtape('devis_rappel', null)).toBe('Devis en attente de validation');
    expect(motDerniereEtape('devis_rappel', 'pas une date')).toBe('Devis en attente de validation');
    expect(motDerniereEtape(null, '2026-10-05T10:00:00Z')).toBeNull();
  });
});

describe('monga — la RÈGLE DU NOM d’Arno', () => {
  it('l’événement PREND le libellé Monga', () => {
    expect(renommageAFaire('Fuite salle de bain', 'barre de douche defixer')).toBe('barre de douche defixer');
  });

  it('🔴 null QUAND LE NOM NE CHANGE PAS : on ne journalise pas une modification qui n’en est pas une', () => {
    expect(renommageAFaire('barre de douche defixer', 'barre de douche defixer')).toBeNull();
    expect(renommageAFaire('  barre de douche defixer  ', 'barre de douche defixer')).toBeNull();
    // Un libellé Monga vide ne renomme rien : on ne vide jamais le « quoi » d'un événement.
    expect(renommageAFaire('Fuite salle de bain', '   ')).toBeNull();
  });

  it('les mots d’Arno, au mot près', () => {
    expect(motRenommageMonga('barre de douche defixer'))
      .toBe('Le nom deviendra « barre de douche defixer » (nom Monga). Ancien nom conservé dans l’historique.');
    expect(questionNomVerrouille('MNG-23987')).toBe(
      'Cet événement est lié à l’intervention Monga MNG-23987 : son nom doit rester identique à celui de '
      + 'Monga. Modifier quand même ?');
    expect(badgeMonga('MNG-23987')).toBe('Monga MNG-23987');
    expect(motFiltreMonga(40)).toBe('Interventions Monga à relier (40)');
  });

  it('l’encart de la fenêtre « Classer » — et il tient sans adresse', () => {
    expect(motEncartMonga({
      reference: 'MNG-23987', libelle: 'barre de douche defixer', adresse: '53 avenue des Ternes',
    })).toBe('Intervention Monga MNG-23987 · barre de douche defixer · 53 avenue des Ternes');
    expect(motEncartMonga({ reference: 'MNG-19492', libelle: null, adresse: null }))
      .toBe('Intervention Monga MNG-19492');
  });
});

describe('monga — la liste des étapes ne peut pas divergée de la base', () => {
  /**
   * 🔴🔴 LE GARDE QUI COMPTE. `EtapeMonga` (TypeScript) et la contrainte `gestion_monga_mail_etape_chk` (SQL)
   * disent la même liste à deux endroits. Ajouter une étape d'un seul côté ne lèverait AUCUNE erreur à la
   * compilation : l'écriture échouerait en base, à l'exécution, sur le premier mail qui porte la nouvelle
   * étape — c'est-à-dire bien plus tard, et chez Arno. Cette épreuve lit la migration et compare.
   */
  it('les dix étapes du code sont exactement celles de la migration 311', () => {
    const sql = readFileSync('db/migrations/311_gestion_monga_reference.sql', 'utf8');
    const bloc = /gestion_monga_mail_etape_chk[\s\S]*?CHECK \(etape IN \(([\s\S]*?)\)\)/.exec(sql);
    expect(bloc).not.toBeNull();
    const enBase = [...(bloc as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const dansLeCode = ['devis_envoye', 'devis_rappel', 'commentaire', 'attention', 'terminee', 'facture',
      'relance_facture', 'compte_rendu', 'service', 'autre'].sort();
    expect(enBase).toEqual(dansLeCode);
    // Et chacune de ces dix valeurs est bien un `EtapeMonga` : `motEtapeMonga` les accepte toutes.
    for (const e of enBase) expect(typeof motEtapeMonga(e as never)).toBe('string');
  });

  it('la migration 311 est ADDITIVE : elle ne touche aucune table existante', () => {
    const sql = readFileSync('db/migrations/311_gestion_monga_reference.sql', 'utf8');
    /**
     * 🔴 ON LIT LES INSTRUCTIONS, PAS LE TEXTE. Chercher le mot « DELETE » dans le fichier entier échouait sur
     * « ON DELETE CASCADE » — qui est l'inverse d'une suppression de données : c'est la clause qui dit ce qui
     * arrive à NOS lignes si un mail disparaît. On retire donc les commentaires, puis on exige que CHAQUE
     * instruction crée ou commente. Un `ALTER TABLE` glissé dans ce fichier ne passerait pas.
     */
    const instructions = sql.replace(/^\s*--.*$/gm, '').replace(/'(?:''|[^'])*'/g, "''").split(';')
      .map((s) => s.trim().replace(/\s+/g, ' ')).filter((s) => s !== '');
    expect(instructions.length).toBeGreaterThan(0);
    for (const i of instructions) {
      expect(i).toMatch(/^(?:CREATE TABLE IF NOT EXISTS|CREATE (?:UNIQUE )?INDEX IF NOT EXISTS|COMMENT ON)\b/);
    }
    // 🔴 « Premier rattachement d'une référence = TOUJOURS un clic d'Arno » : la garde est EN BASE.
    expect(sql).toContain('gestion_monga_lien_humain_chk');
    expect(sql).toContain("lower(btrim(relie_par_libelle)) <> 'automatique'");
    // Unique par référence VIVANTE : délier puis relier ailleurs reste possible.
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS gestion_monga_lien_vivant_idx');
    expect(sql).toContain('ON gestion_monga_lien (reference) WHERE retire_le IS NULL');
  });
});
