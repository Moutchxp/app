import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { estDocumentEnvoye, MARQUEUR_DOCUMENT, REGLE_EXCLUSION_DOCUMENT } from './documentsAuto';
import { examinerMessage } from './rattachement';
import type { BienConnu } from './propositionsBien';
import type { AdresseEchange } from './propositionTri';
import type { Reconnaissance } from './adressesMessage';

/**
 * ══ 🔴🔴 LOT DOCUMENTS-HORS-BIENS — UN DOCUMENT NE VA JAMAIS DANS LA FICHE D'UN BIEN ══════════════════════════
 *
 * CONSTAT D'ARNO (01/10/2026) : la fiche du bien lot 176 (25 rue Edith Cavell) affichait 77 mails dans « Vie du
 * bien », dont nos propres « Document CRITERIMMO » — quittances, avis mensuels, révisions — avec un badge « Auto ».
 *
 * RÈGLE D'ARNO : « Les “Document CRITERIMMO” concernent des PERSONNES, pas le bien. Ils vont UNIQUEMENT dans le
 * dossier “Documents automatiques” de la fiche locataire ou propriétaire. JAMAIS dans la fiche d'un bien, ni dans
 * “Vie du bien”, ni dans aucun historique ou compteur de bien. »
 *
 * 🔒 Aucune donnée réelle : adresses en @fictif.fr, clés de lot inventées.
 */

const locataire = (lot: string, prop: string): Reconnaissance => ({
  partie: 'locataire', proprietaireCle: prop, locataireId: 1, lotCle: lot, motif: 'locataire à la date du mail',
});
const adr = (adresse: string, messageId: number, reconnaissance: Reconnaissance): AdresseEchange =>
  ({ adresse, messageId, interne: false, reconnaissance });
const BIENS: BienConnu[] = [{
  cle: '495', numero: '495', adresse: '4 rue Fictive', commune: 'Ville-Fictive',
  proprietaireCle: '339', proprietaireNom: 'Bailleur 339',
}];

/** Le mail type : un locataire reconnu, donc un bien parfaitement identifiable. C'est tout l'enjeu. */
const ADRESSES = [adr('locataire@fictif.fr', 1, locataire('495', '339'))];

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ① RECONNAÎTRE UN DE NOS ENVOIS AUTOMATIQUES
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('① « est-ce un document que NOUS avons envoyé ? »', () => {
  it('🔴 envoyé + objet marqué ⇒ oui', () => {
    expect(estDocumentEnvoye({ sens: 'envoye', objet: `${MARQUEUR_DOCUMENT} - Quittance Mars 2026` })).toBe(true);
  });

  /** ⚠️ Un document SORTI en Réception (lot précédent) n'a plus de règle d'exclusion : l'objet le dit encore. */
  it('⚠️ un document rendu visible reste un document', () => {
    expect(estDocumentEnvoye({
      sens: 'envoye', objet: `${MARQUEUR_DOCUMENT} - R21 - Rappel garant`, exclusionRegleId: null,
    })).toBe(true);
  });

  /** ⚠️ Et un document encore caché est reconnu par sa règle, quelle que soit la forme de son objet. */
  it('⚠️ la règle d’exclusion n° 5 suffit, même sans marqueur dans l’objet', () => {
    expect(estDocumentEnvoye({
      sens: 'envoye', objet: 'Avis d’échéance', exclusionRegleId: REGLE_EXCLUSION_DOCUMENT,
    })).toBe(true);
  });

  /**
   * 🔴🔴 LA DISTINCTION QUI PORTE TOUT LE LOT. Une RÉPONSE humaine à un document est du vrai courrier client :
   * elle garde ses biens, et c'est une demande explicite d'Arno. Seul le `sens` les sépare.
   */
  it('🔴🔴 un mail REÇU n’est jamais un de nos documents, même avec le même objet', () => {
    expect(estDocumentEnvoye({ sens: 'recu', objet: `Re: ${MARQUEUR_DOCUMENT} - Quittance` })).toBe(false);
    expect(estDocumentEnvoye({ sens: 'recu', objet: 'Quittance', exclusionRegleId: REGLE_EXCLUSION_DOCUMENT }))
      .toBe(false);
  });

  it('⚠️ un envoi ordinaire n’est pas un document', () => {
    expect(estDocumentEnvoye({ sens: 'envoye', objet: 'Votre demande d’intervention' })).toBe(false);
    expect(estDocumentEnvoye({ sens: 'envoye', objet: null })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ② LE MOTEUR NE PROPOSE PLUS AUCUN BIEN POUR UN DOCUMENT
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('② un document envoyé n’est JAMAIS lié à un bien', () => {
  /**
   * 🔴🔴 LE CAS QUI MOTIVE LE LOT. Sans le garde, le moteur reconnaît l'adresse du locataire, en déduit son
   * logement, et pose un lien CERTAIN. Le mail n'est pas ambigu — il est HORS SUJET.
   */
  it('🔴🔴 le moteur ne rend aucun candidat pour un document, même avec un locataire reconnu', () => {
    const e = examinerMessage({
      messageId: 1, adressesEchange: ADRESSES, biens: BIENS,
      textes: { objet: `${MARQUEUR_DOCUMENT} - Quittance Mars 2026`, corps: '', pieces: [] },
      sens: 'envoye',
    });
    expect(e.issue).toBe('sans_candidat');
    expect(e.certain).toBe(null);
    expect(e.candidats).toEqual([]);
  });

  /** ⚠️ `sans_candidat`, donc AUCUNE proposition pré-cochée — la dernière phrase du point 3 d'Arno. */
  it('⚠️ il n’entre dans la file de tri d’aucun bien', () => {
    const e = examinerMessage({
      messageId: 1, adressesEchange: ADRESSES, biens: BIENS,
      textes: { objet: `${MARQUEUR_DOCUMENT} - Avis d’échéance`, corps: '', pieces: [] },
      sens: 'envoye', exclusionRegleId: REGLE_EXCLUSION_DOCUMENT,
    });
    expect(e.issue).toBe('sans_candidat');
    expect(e.motif).toContain('jamais dans un bien');
  });

  /**
   * 🔴🔴 LA CONTRE-ÉPREUVE, ET C'EST ELLE QUI PROUVE QUE LE GARDE NE DÉBORDE PAS. Même conversation, même objet,
   * même locataire : une RÉPONSE humaine garde son bien. Arno : « les mails REÇUS ne sont pas touchés ».
   */
  it('🔴🔴 une RÉPONSE humaine au même document garde son bien', () => {
    const e = examinerMessage({
      messageId: 1, adressesEchange: ADRESSES, biens: BIENS,
      textes: { objet: `Re: ${MARQUEUR_DOCUMENT} - Quittance Mars 2026`, corps: '', pieces: [] },
      sens: 'recu',
    });
    expect(e.issue).toBe('automatique');
    expect(e.certain?.cible).toEqual({ sorte: 'lot', cle: '495', id: null });
  });

  /** ⚠️ SANS `sens`, LE MOTEUR EST EXACTEMENT CELUI D'AVANT : un appelant qui ne le passe pas ne change rien. */
  it('⚠️ sans le sens, le garde ne joue pas et le comportement d’avant est inchangé', () => {
    const e = examinerMessage({
      messageId: 1, adressesEchange: ADRESSES, biens: BIENS,
      textes: { objet: `${MARQUEUR_DOCUMENT} - Quittance`, corps: '', pieces: [] },
    });
    expect(e.issue).toBe('automatique');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ③ LES AUTRES CHEMINS D'ÉCRITURE, RELUS DANS LE CODE
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('③ aucun chemin ne peut reposer un bien sur un document', () => {
  /**
   * 🔴🔴 LA PROJECTION DES FENÊTRES EST L'AUTRE CHEMIN, et sans ce garde le retrait serait défait au premier
   * geste : 20 206 fenêtres vivantes ont été ouvertes PAR un document (reprise 290), et chacune reposerait son
   * lien à la prochaine projection.
   */
  it('🔴🔴 la projection d’une fenêtre saute les documents', () => {
    const repo = readFileSync('app/lib/gestion/periodeRepo.ts', 'utf8');
    expect(repo).toContain('async function documentsDuFil');
    expect(repo).toContain('if (documents.has(m)) break;');
  });

  /**
   * 🔴 ON NE FERME AUCUNE FENÊTRE. Demande d'Arno : « on ne leur retire PAS leurs biens ». Les réponses humaines
   * de ces conversations continuent d'en recevoir leurs biens — c'est le document seul qui est sauté.
   */
  it('🔴 aucune fenêtre n’est fermée par ce lot', () => {
    const script = readFileSync('app/scripts/retirer-documents-des-biens.ts', 'utf8');
    expect(script).not.toContain('remplacee_le = now()');
    expect(script).not.toContain('DELETE FROM gestion_fil_periode');
  });

  /** 🔴 LE RETRAIT N'EST PAS UNE SUPPRESSION : statut, date, auteur, motif — et réversible. */
  it('🔴 le retrait est daté, signé, réversible', () => {
    const script = readFileSync('app/scripts/retirer-documents-des-biens.ts', 'utf8');
    expect(script).toContain("SET statut = 'retire', statut_le = now(), statut_par_libelle = $1");
    expect(script).not.toContain('DELETE FROM gestion_rattachement');
  });

  /** 🔴 LES LIENS POSÉS À LA MAIN SONT ÉPARGNÉS — demande explicite d'Arno, et question qu'il tranchera. */
  it('🔴 les liens manuels sont épargnés', () => {
    const script = readFileSync('app/scripts/retirer-documents-des-biens.ts', 'utf8');
    expect(script).toContain('AND NOT ${EST_MANUEL}');
    expect(script).toContain("r.origine <> 'automatique' OR r.statut_par_libelle IS NOT NULL");
  });

  /**
   * ⚠️ LE SQL ET LE MODULE PUR DOIVENT DIRE LA MÊME CHOSE. Deux définitions de « document » qui divergeraient
   * donneraient un script qui retire ce que le moteur reposerait — ou l'inverse.
   */
  it('⚠️ le SQL du script est le jumeau du module pur', () => {
    const script = readFileSync('app/scripts/retirer-documents-des-biens.ts', 'utf8');
    const sql = script.slice(script.indexOf('const EST_DOCUMENT_ENVOYE'));
    expect(sql).toContain("m.sens = 'envoye'");
    expect(sql).toContain('coalesce(m.exclu_par_regle_id, 0)');
    expect(sql).toContain('${MARQUEUR_DOCUMENT}');
  });
});

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════════════
   ④ LE GARDE-FOU DE BASE (migration 292, livrée NON APPLIQUÉE)
   ════════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

describe('④ le garde-fou en base', () => {
  const migration = readFileSync('db/migrations/292_gestion_document_jamais_un_bien.sql', 'utf8');

  it('🔴 elle est livrée NON APPLIQUÉE, et le dit en toutes lettres', () => {
    expect(migration).toContain('NON APPLIQUÉE');
    expect(migration.toLowerCase()).toContain('accord');
  });

  /** 🔴 INSERT **ET** UPDATE : sinon il suffirait d'insérer en « retire » puis de passer en « confirme ». */
  it('🔴🔴 le trigger couvre l’INSERT ET l’UPDATE', () => {
    expect(migration.replace(/\s+/g, ' ')).toContain('BEFORE INSERT OR UPDATE OF statut, cible_sorte, message_id');
  });

  /** 🔴 LA LEÇON DE LA 291 : une comparaison sur un NULL ne refuse rien. La forme bivalente, partout. */
  it('🔴🔴 il est BIVALENT : aucune comparaison nue sur une colonne qui peut être NULL', () => {
    const corps = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'), migration.indexOf('COMMIT;'));
    expect(corps).toContain('coalesce(m.exclu_par_regle_id, 0) = 5');
    expect(corps).toContain('coalesce(doc, false)');
    expect(corps).not.toMatch(/\bm\.exclu_par_regle_id = 5/);
  });

  /** 🔴 UN LIEN MORT RESTE LISIBLE : les 33 164 lignes retirées ne doivent pas devenir intouchables. */
  it('🔴 il laisse passer les liens morts et les mails reçus', () => {
    const corps = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION'), migration.indexOf('COMMIT;'));
    expect(corps).toContain("IF NEW.statut NOT IN ('propose', 'confirme') THEN RETURN NEW; END IF;");
    expect(corps).toContain("m.sens = 'envoye'");
  });

  it('🔴 elle est réversible, et l’écrit', () => {
    expect(migration).toContain('POUR REVENIR EN ARRIÈRE');
    expect(migration).toContain('DROP TRIGGER IF EXISTS gestion_rattachement_document_bien_trg');
  });
});
