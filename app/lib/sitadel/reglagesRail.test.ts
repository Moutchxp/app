import { describe, it, expect } from 'vitest';
import {
  PARAMS_VEILLE, espaceReglage, reglageDansEspace,
  PARAMS_ESPACE_EMAIL, PARAMS_ESPACE_TELESERVICE, PARAMS_TRANSVERSE, type ParamVeille,
} from './reglagesVeille';

/**
 * R1 (D4-ter) — PARTITION DE RAIL prouvée AVANT tout changement visuel (exigence porteur : « je veux la partition prouvée par
 * tests avant qu'un pixel bouge »). On prouve les quatre garanties demandées : (1) chaque réglage dans le BON espace ; (2) les
 * PARTAGÉS marqués ; (3) AUCUN perdu ; (4) UNE colonne = UNE vérité (un partagé rendu dans les deux espaces reste un seul
 * descripteur). Modèle PUR : ces listes ne sont encore consommées par AUCUN rendu (vérifié : R2 fera l'écran).
 */

// Vérités LITTÉRALES figées (comparées en ENSEMBLE, jamais en ordre) — le contrat que R2 consommera.
// D4-ter (R1) — les 3 délais de cascade (rappel/avis/saisine) sont rail e-mail : ils déterminent une relance AUTOMATIQUE qui
//   n'existe qu'en e-mail. La 4e (relance_jours_avant_echeance) est VESTIGIALE (remplacée par relance_rappel) → reste transverse.
const EMAIL_SEUL = ['envois_max_par_run', 'envois_max_par_jour', 'relance_auto_active', 'envoi_heure_debut', 'envoi_heure_fin',
  'relance_rappel_jours_avant', 'relance_avis_jours_avant', 'relance_saisine_delai_jours'];
const TELESERVICE_SEUL = ['teleservice_dossiers_par_depot', 'teleservice_permis_par_commune_par_mois', 'teleservice_alerte_non_depose_active', 'teleservice_alerte_non_depose_jours'];
// D4-ter (R2) — adresse_reponse N'EST PAS partagée : ses rôles vivants (ligne imprimée dans le corps + boîte relevée) sont
//   TRANSVERSES, et le Reply-To technique dépend du PROFIL (S43), pas d'elle. La ranger « partagée » serait un mensonge d'interface.
const PARTAGES = ['anciennete_max_demande_annees', 'nb_candidats_examines', 'tri_candidats', 'dossiers_par_demande', 'permis_par_commune_par_mois', 'pieces_demandees', 'profil_demandeur_defaut'];

const col = (ps: ParamVeille[]) => ps.map((p) => p.colonne);
const par = (c: string) => PARAMS_VEILLE.find((p) => p.colonne === c)!;

describe('R1 — classification de rail : espaceReglage est TOTALE et sans ambiguïté', () => {
  it('chaque réglage tombe dans exactement une des 4 classes', () => {
    for (const p of PARAMS_VEILLE) {
      expect(['email', 'teleservice', 'partage', 'transverse'], p.colonne).toContain(espaceReglage(p));
    }
  });
  // GARDE d'ambiguïté : `partage` et `rail` s'excluent — sinon un réglage serait « partagé » ET « rail seul » à la fois.
  it('aucun réglage n’est à la fois partagé ET tagué rail', () => {
    for (const p of PARAMS_VEILLE) {
      if (p.partage) expect(p.rail, p.colonne).toBeUndefined();
    }
  });
  it('espaceReglage : partagé > rail (précédence) et défaut = transverse', () => {
    expect(espaceReglage(par('dossiers_par_demande'))).toBe('partage');   // partagé
    expect(espaceReglage(par('envois_max_par_run'))).toBe('email');       // rail e-mail
    expect(espaceReglage(par('teleservice_alerte_non_depose_active'))).toBe('teleservice');
    expect(espaceReglage(par('cada_email'))).toBe('transverse');          // ni rail ni partagé
  });
});

describe('R1 — les deux espaces contiennent le BON ensemble de réglages', () => {
  it('espace E-mail = e-mail seul ∪ partagés', () => {
    expect(new Set(col(PARAMS_ESPACE_EMAIL))).toEqual(new Set([...EMAIL_SEUL, ...PARTAGES]));
  });
  it('espace Téléservice = téléservice seul ∪ partagés', () => {
    expect(new Set(col(PARAMS_ESPACE_TELESERVICE))).toEqual(new Set([...TELESERVICE_SEUL, ...PARTAGES]));
  });
  it('reglageDansEspace est cohérent avec espaceReglage', () => {
    for (const p of PARAMS_VEILLE) {
      expect(reglageDansEspace(p, 'email'), p.colonne).toBe(espaceReglage(p) === 'email' || espaceReglage(p) === 'partage');
      expect(reglageDansEspace(p, 'teleservice'), p.colonne).toBe(espaceReglage(p) === 'teleservice' || espaceReglage(p) === 'partage');
    }
  });
});

describe('R1 — les PARTAGÉS sont marqués et forment l’intersection EXACTE des deux espaces', () => {
  it('les 8 partagés portent bien partage:true', () => {
    for (const c of PARTAGES) expect(par(c).partage, c).toBe(true);
  });
  it('intersection(E-mail, Téléservice) = exactement les partagés', () => {
    const inter = col(PARAMS_ESPACE_EMAIL).filter((c) => col(PARAMS_ESPACE_TELESERVICE).includes(c));
    expect(new Set(inter)).toEqual(new Set(PARTAGES));
  });
});

describe('R1 — UNE colonne = UNE vérité (pas de colonnes jumelles ; le partagé est le MÊME descripteur des deux côtés)', () => {
  it('chaque colonne de PARAMS_VEILLE est unique (aucun doublon)', () => {
    const cols = col(PARAMS_VEILLE);
    expect(new Set(cols).size).toBe(cols.length);
  });
  it('un partagé rendu dans les deux espaces est le MÊME objet (même référence → un seul PATCH, une seule valeur)', () => {
    for (const c of PARTAGES) {
      const e = PARAMS_ESPACE_EMAIL.find((p) => p.colonne === c);
      const t = PARAMS_ESPACE_TELESERVICE.find((p) => p.colonne === c);
      expect(e, c).toBeDefined();
      expect(e, c).toBe(t); // identité référentielle : impossible d'avoir deux valeurs divergentes
    }
  });
});

describe('R1 — les SURCHARGES vivent dans le rail téléservice, distinctes de leur base partagée', () => {
  it('chaque surcharge (surchargeDe) est téléservice-seul, absente de l’espace e-mail ; sa base est un partagé présent des deux côtés', () => {
    const surcharges = PARAMS_VEILLE.filter((p) => p.surchargeDe);
    expect(surcharges.length).toBeGreaterThan(0);
    for (const s of surcharges) {
      expect(espaceReglage(s), s.colonne).toBe('teleservice');
      expect(col(PARAMS_ESPACE_EMAIL), s.colonne).not.toContain(s.colonne); // la surcharge n'apparaît PAS côté e-mail
      expect(col(PARAMS_ESPACE_TELESERVICE), s.colonne).toContain(s.colonne);
      // la base surchargée est un PARTAGÉ (donc rendue dans les deux espaces, valeur commune)
      expect(PARTAGES, s.surchargeDe).toContain(s.surchargeDe);
      expect(espaceReglage(par(s.surchargeDe!))).toBe('partage');
    }
  });
});

describe('R1 — AUCUN réglage perdu : les 4 classes partitionnent PARAMS_VEILLE (disjointes + couvrantes)', () => {
  it('email-seul + téléservice-seul + partagés + transverse = PARAMS_VEILLE, sans recouvrement', () => {
    const email = PARAMS_VEILLE.filter((p) => espaceReglage(p) === 'email');
    const tele = PARAMS_VEILLE.filter((p) => espaceReglage(p) === 'teleservice');
    const partage = PARAMS_VEILLE.filter((p) => espaceReglage(p) === 'partage');
    const total = [...col(email), ...col(tele), ...col(partage), ...col(PARAMS_TRANSVERSE)];
    expect(new Set(total).size).toBe(total.length);                 // disjointes (aucun doublon)
    expect(new Set(total)).toEqual(new Set(col(PARAMS_VEILLE)));     // couvrantes (aucun perdu)
    // et les listes littérales collent aux classes calculées
    expect(new Set(col(email))).toEqual(new Set(EMAIL_SEUL));
    expect(new Set(col(tele))).toEqual(new Set(TELESERVICE_SEUL));
    expect(new Set(col(partage))).toEqual(new Set(PARTAGES));
  });
  // Les réglages transverses ne fuient PAS dans un espace de rail (spot-check des familles concernées).
  it('des transverses représentatifs restent hors des deux espaces', () => {
    // relance_jours_avant_echeance = VESTIGIALE (ne détermine plus de geste) → transverse, malgré la promotion e-mail de ses successeurs.
    for (const c of ['cada_email', 'releve_active', 'alerte_email', 'rattachement_suivi_auto_active', 'relance_jours_avant_echeance', 'demandes_par_commune_par_mois', 'adresse_reponse']) {
      expect(espaceReglage(par(c)), c).toBe('transverse');
      expect(reglageDansEspace(par(c), 'email'), c).toBe(false);
      expect(reglageDansEspace(par(c), 'teleservice'), c).toBe(false);
    }
  });
});
