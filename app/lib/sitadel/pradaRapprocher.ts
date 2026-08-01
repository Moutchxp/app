/**
 * Moteur de RAPPROCHEMENT des lignes PRADA (classement = 'Mairie') avec la table `commune` (chantier S14c). Ne touche NI
 * `mairie_contact`, NI `demande`, NI les colonnes `dest_*` : le basculement du destinataire est un chantier ultérieur.
 *
 * Règle (établie et mesurée, non réinventée) : candidates = lignes `classement = 'Mairie'` d'un département du PÉRIMÈTRE
 * (lu en base : SELECT DISTINCT departement FROM commune, jamais en dur). Nom de commune extrait par `villeDepuisNomMairie`.
 * Comparaison EXACTE : `departement` identique ET `lower(svv_unaccent_immutable(nom))` égal. 1 correspondance → 'automatique',
 * 0 ou plusieurs → 'ambigu', reste → 'hors_perimetre'. Aucune règle SAINT/ST, tiret ou distance.
 *
 * DEUX INVARIANTS « le travail humain prime » (verrouillés par test) :
 *   - une ligne `prada_import` déjà en `rapprochement = 'manuel'` n'est JAMAIS retouchée ;
 *   - une ligne `mairie_prada` déjà `statut = 'confirme'` ou `origine = 'saisie_manuelle'` n'est JAMAIS écrasée.
 */
import { withTransaction } from '../db/client';
import { villeDepuisNomMairie } from './prada';

// ── SQL PURS (fabriqués → inspectables par les tests) ────────────────────────
/** Candidats : mairies du périmètre (périmètre lu EN BASE), jamais les lignes 'manuel'. */
export function sqlSelectionCandidats(): string {
  return `SELECT id, nom_administration, departement, adresse, prenom, nom, courriel, millesime
FROM prada_import
WHERE rapprochement <> 'manuel' AND classement = 'Mairie' AND departement IN (SELECT DISTINCT departement FROM commune)
ORDER BY id`;
}

/** Tout ce qui n'est pas une mairie du périmètre → 'hors_perimetre' (en masse), sans jamais toucher une ligne 'manuel'. */
export function sqlHorsPerimetre(): string {
  return `UPDATE prada_import SET rapprochement = 'hors_perimetre', code_insee = NULL
WHERE rapprochement <> 'manuel'
  AND NOT (classement = 'Mairie' AND departement IN (SELECT DISTINCT departement FROM commune))`;
}

/** Mise à jour du rapprochement d'UNE ligne. Garde `rapprochement <> 'manuel'` (double verrou de l'invariant humain). */
export function sqlMajRapprochement(): string {
  return `UPDATE prada_import SET code_insee = $1, rapprochement = $2 WHERE id = $3 AND rapprochement <> 'manuel'`;
}

/** Correspondance EXACTE : même département ET nom désaccentué/minuscule identique (svv_unaccent_immutable des deux côtés). */
export function sqlMatchCommune(): string {
  return `SELECT code_insee FROM commune
WHERE departement = $1 AND lower(svv_unaccent_immutable(nom)) = lower(svv_unaccent_immutable($2))`;
}

/**
 * Alimente `mairie_prada` depuis une ligne 'automatique'. ON CONFLICT (code_insee) DO UPDATE, mais la clause WHERE PROTÈGE
 * ce qu'un humain a validé : n'écrase JAMAIS une ligne `statut = 'confirme'` ou `origine = 'saisie_manuelle'`. RETURNING
 * (xmax = 0) distingue insertion/mise à jour ; si la protection s'applique, AUCUNE ligne n'est retournée.
 */
export function sqlUpsertMairiePrada(): string {
  return `INSERT INTO mairie_prada (code_insee, import_id, nom, prenom, courriel, adresse_formatee, millesime, origine, statut)
VALUES ($1, $2, $3, $4, $5, $6, $7, 'annuaire_cada', 'presume')
ON CONFLICT (code_insee) DO UPDATE SET
  import_id = EXCLUDED.import_id, nom = EXCLUDED.nom, prenom = EXCLUDED.prenom, courriel = EXCLUDED.courriel,
  adresse_formatee = EXCLUDED.adresse_formatee, millesime = EXCLUDED.millesime, maj_le = now()
WHERE mairie_prada.statut <> 'confirme' AND mairie_prada.origine <> 'saisie_manuelle'
RETURNING (xmax = 0) AS insere, courriel`;
}

/** Journal append-only d'un changement de PRADA (création ou changement de courriel). */
export function sqlJournalMairiePrada(): string {
  return `INSERT INTO mairie_prada_journal (code_insee, courriel_avant, courriel_apres, origine, motif, auteur)
VALUES ($1, $2, $3, $4, $5, $6)`;
}

// ── Moteur ───────────────────────────────────────────────────────────────────
export interface ResultatRapprochement {
  examinees: number;          // mairies du périmètre examinées
  automatiques: number;
  ambigues: string[];         // nom_administration des lignes ambiguës
  horsPerimetre: number;      // lignes basculées 'hors_perimetre'
  ecritesMairiePrada: number; // lignes réellement écrites (créées ou mises à jour) dans mairie_prada
  communesCouvertes: number;  // communes du périmètre ayant désormais une PRADA
  communesTotal: number;
}

interface LigneCandidate {
  id: number; nom_administration: string; departement: string; adresse: string;
  prenom: string; nom: string; courriel: string; millesime: string;
}

/**
 * Exécute le rapprochement en UNE transaction. `auteur` (facultatif) est journalisé. Ne lance rien d'externe. Retourne les
 * compteurs pour le rapport CLI. Idempotent : rejouer ne change rien tant que les données sources sont identiques (et ne
 * retouche jamais le travail humain — cf. invariants).
 */
export async function rapprocher(auteur: string | null = null): Promise<ResultatRapprochement> {
  return withTransaction(async (q) => {
    const hp = await q(sqlHorsPerimetre());
    const horsPerimetre = hp.rowCount ?? 0;

    const cand = await q<LigneCandidate>(sqlSelectionCandidats());
    let automatiques = 0;
    let ecritesMairiePrada = 0;
    const ambigues: string[] = [];

    for (const r of cand.rows) {
      const ville = villeDepuisNomMairie(r.nom_administration);
      const match = await q<{ code_insee: string }>(sqlMatchCommune(), [r.departement, ville]);
      if (match.rows.length === 1) {
        const code = match.rows[0].code_insee;
        await q(sqlMajRapprochement(), [code, 'automatique', r.id]);
        automatiques += 1;

        const avant = await q<{ courriel: string | null }>(`SELECT courriel FROM mairie_prada WHERE code_insee = $1`, [code]);
        const courrielAvant = avant.rows[0]?.courriel ?? null;
        const up = await q<{ insere: boolean; courriel: string | null }>(
          sqlUpsertMairiePrada(), [code, r.id, r.nom, r.prenom, r.courriel, r.adresse, r.millesime],
        );
        if (up.rows.length === 1) { // 0 ligne = protégée (confirme / saisie_manuelle) → rien écrit, rien journalisé
          ecritesMairiePrada += 1;
          const courrielApres = up.rows[0].courriel;
          if (up.rows[0].insere || (courrielAvant ?? '') !== (courrielApres ?? '')) {
            await q(sqlJournalMairiePrada(), [
              code, courrielAvant, courrielApres, 'annuaire_cada',
              up.rows[0].insere ? 'création (rapprochement automatique)' : 'maj courriel (rapprochement automatique)', auteur,
            ]);
          }
        }
      } else {
        await q(sqlMajRapprochement(), [null, 'ambigu', r.id]);
        ambigues.push(r.nom_administration);
      }
    }

    const cov = await q<{ n: number }>(`SELECT count(*)::int AS n FROM mairie_prada`);
    const tot = await q<{ n: number }>(`SELECT count(*)::int AS n FROM commune`);
    return {
      examinees: cand.rows.length, automatiques, ambigues, horsPerimetre, ecritesMairiePrada,
      communesCouvertes: cov.rows[0]?.n ?? 0, communesTotal: tot.rows[0]?.n ?? 0,
    };
  });
}
