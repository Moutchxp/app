/**
 * MODULE « GESTION » — LOT RATTACHEMENT-2 : L'ENCHAÎNEMENT RÉEL, après une passe de relève. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 IL NE TOUCHE NI GMAIL, NI LE DRIVE, NI MinIO. Il lit `gestion_message`, écrit `gestion_message_adresse` (par les
 * fonctions du lot DRIVE-2-bis), puis `gestion_rattachement` et son mémo d'examen (par celles du lot
 * RATTACHEMENT-1). Aucune fonction nouvelle d'écriture n'est écrite ici : c'est du CÂBLAGE, et c'est voulu — deux
 * chemins d'écriture pour un même fait finiraient par diverger.
 *
 * 🔴 IL NE JETTE JAMAIS VERS L'APPELANT. `enchainerApresReleve` attrape tout et rend un verdict. La relève du courrier
 * ne doit pas échouer parce que l'annuaire est absent ou qu'une migration manque.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
// 🔴 LOT NOM-UNIQUE-DES-PIECES — la cadence de la relecture des noms Drive. Une passe sur dix, pas à chaque tour.
import { UNE_PASSE_SUR } from './reprendreNomsDrive';
import { adressesMessagesDisponibles, rattachementsDisponibles, suiteReleveDisponible } from './schema';
import { chargerAnnuaireAdresses, releverPaquet, COMPTES_RELEVE_VIDE } from './adressesRepo';
import {
  chargerLibelles, examinerFilsPrecis, COMPTES_VIDES, type ComptesPasse,
} from './rattachementRepo';
import {
  motifSuite, resumeSuite, COMPTES_SUITE_VIDES, MARGE_RETOUR_SUITE, PLAFOND_MESSAGES_SUITE,
  type ComptesSuite, type IssueSuite,
} from './suiteReleve';

/**
 * LES MESSAGES SANS AUCUNE ADRESSE RELEVÉE, et les fils concernés. LECTURE SEULE.
 *
 * 🔴 LA BORNE EST CALCULÉE À PART ET PASSÉE EN PARAMÈTRE, jamais écrite en sous-requête. MESURÉ le 26/09/2026 : en
 * sous-requête, le planificateur ne sait pas la constanter et retombe sur un balayage séquentiel complet de
 * `gestion_message` — 124 ms au lieu de 4,8 ms, une fois par minute, le plus souvent pour ne rien trouver.
 */
export async function messagesSansAdresses(plafond = PLAFOND_MESSAGES_SUITE): Promise<{
  messages: number[]; fils: number[]; reste: number;
}> {
  const { rows: curseur } = await query<{ n: string | null }>(
    'SELECT max(message_id)::text AS n FROM gestion_message_adresse');
  const borne = Math.max(Number(curseur[0]?.n ?? 0) - MARGE_RETOUR_SUITE, 0);

  // UNE ligne de plus que le plafond : sa présence, et elle seule, dit qu'il en reste pour la passe suivante.
  const { rows } = await query<{ id: string; fil_id: string }>(
    `SELECT m.id, m.fil_id FROM gestion_message m
      WHERE m.id > $1
        AND NOT EXISTS (SELECT 1 FROM gestion_message_adresse a WHERE a.message_id = m.id)
      ORDER BY m.id LIMIT $2`, [borne, plafond + 1]);

  const gardees = rows.slice(0, plafond);
  return {
    messages: gardees.map((r) => Number(r.id)),
    fils: [...new Set(gardees.map((r) => Number(r.fil_id)))],
    reste: rows.length > plafond ? 1 : 0,
  };
}

/**
 * LES FILS ENCORE AMBIGUS parmi ceux qu'on va réexaminer — c'est-à-dire ceux qui portent au moins un rattachement
 * resté « proposé ». LECTURE SEULE.
 *
 * ⚠️ ON N'A PAS BESOIN DE LES CHERCHER AILLEURS. Le lot demande de réexaminer « les messages nouveaux ET les autres
 * messages encore proposés DES MÊMES ÉCHANGES » : puisqu'on réexamine les fils ENTIERS des messages nouveaux, ces
 * messages-là sont déjà couverts. Cette fonction ne sert donc qu'à COMPTER ce qui était ambigu avant, pour le dire
 * dans le résumé — pas à élargir le périmètre.
 */
export async function filsAmbigus(filIds: readonly number[]): Promise<number> {
  if (filIds.length === 0) return 0;
  const { rows } = await query<{ n: string }>(
    `SELECT count(DISTINCT m.fil_id)::text AS n
       FROM gestion_rattachement r JOIN gestion_message m ON m.id = r.message_id
      WHERE m.fil_id = ANY($1::bigint[]) AND r.statut = 'propose'`, [filIds]);
  return Number(rows[0]?.n ?? 0);
}

/**
 * L'ENCHAÎNEMENT : relevé des adresses des messages nouveaux, puis réexamen de leurs échanges.
 *
 * 🔴 IL RETOURNE TOUJOURS, ET NE JETTE JAMAIS. Trois issues :
 *   · `ignore` — rien à faire (l'état ordinaire : la plupart des passes ne rapportent aucun message), ou une
 *     migration manque. Ce n'est pas une erreur, et le dire « erreur » ferait crier le bandeau tous les jours.
 *   · `ok`     — quelque chose a été fait, et le détail le dit.
 *   · `erreur` — quelque chose s'est mal passé. La relève du courrier, elle, reste réussie.
 */
export async function enchainerApresReleve(journal?: (ligne: string) => void): Promise<IssueSuite> {
  const debut = Date.now();
  const c: ComptesSuite = { ...COMPTES_SUITE_VIDES };

  try {
    /**
     * ── ⓪ LES AVIS DE NON-REMISE ──────────────────────────────────────────────────────────────────────────────
     * 🔴 AVANT TOUS LES RETOURS ANTICIPÉS, ET CE N'EST PAS UN DÉTAIL D'ORDRE. Une passe qui ne rapporte rien de
     * nouveau à rattacher sort plus bas par `ignore` — or c'est exactement le cas où un avis de non-remise arrive :
     * le mail est parti il y a dix minutes, aucun message neuf n'est là, et le serveur d'en face vient de le
     * refuser. Ranger ce pas après les retours l'aurait rendu muet précisément quand il sert.
     *
     * ⚠️ IL NE PEUT PAS FAIRE ÉCHOUER LE RESTE : sans la migration 261, `lireAvisEnAttente` rend ses comptes à zéro
     * sans émettre une seule requête.
     */
    const { lireAvisEnAttente } = await import('./nonRemiseRepo');
    const avis = await lireAvisEnAttente();
    c.avisLus = avis.inscrits;
    c.avisRattaches = avis.rattaches;
    if (avis.inscrits > 0) {
      journal?.(`suite : ${avis.inscrits} avis de non-remise lu(s), ${avis.rattaches} rattaché(s)`
        + `${avis.orphelins > 0 ? `, ${avis.orphelins} sans message connu` : ''}`);
    }

    /**
     * ── ⓪ bis 🔴🔴 LOT RATTACHER-EN-ECRIVANT — LES BIENS COCHÉS AVANT L'ENVOI, POSÉS DÈS QUE LEUR MESSAGE EST LÀ
     *
     * Quand quelqu'un coche des biens dans la modale de rédaction, le message n'existe pas encore en base :
     * l'intention attend, attachée à l'envoi. C'est cette passe-ci qui vient de capturer le message dans
     * « Envoyés » — donc c'est ici, et nulle part ailleurs, que l'intention peut devenir un rattachement.
     *
     * 🔴 AVANT LES RETOURS ANTICIPÉS, exactement pour la raison écrite au ⓪ ci-dessus : une passe peut n'avoir
     * rien de nouveau à rattacher au sens des ADRESSES et venir tout de même de capturer l'envoi qu'on attendait.
     *
     * ⚠️ ELLE NE PEUT PAS FAIRE ÉCHOUER LA SUITE : sans la migration 282, `appliquerCiblesEnAttente` rend 0 sans
     * émettre une seule requête, et elle attrape ses propres erreurs.
     */
    const { appliquerCiblesEnAttente, appliquerInterneEnAttente } = await import('./envoiCiblesRepo');
    const posesEnvoi = await appliquerCiblesEnAttente();
    if (posesEnvoi > 0) {
      journal?.(`suite : ${posesEnvoi} bien(s) choisi(s) avant l’envoi, rattaché(s) au message maintenant capturé`);
    }
    /**
     * ⚠️ ET « INTERNE » DEMANDÉ SUR UN MESSAGE NEUF, pour la même raison et au même moment : l'échange n'existait
     * pas quand on a coché la case, il existe maintenant. Sans la migration 283, la fonction rend 0 sans rien
     * demander à la base.
     */
    const posesInterne = await appliquerInterneEnAttente();
    if (posesInterne > 0) {
      journal?.(`suite : ${posesInterne} échange(s) marqué(s) « interne », comme demandé avant l’envoi`);
    }

    /**
     * ══ 🔴🔴 LOT NOM-UNIQUE-DES-PIECES — LES NOMS CHANGÉS DANS GOOGLE DRIVE, REPRIS ICI ═══════════════════════
     *
     * Arno : « À la relève (ou dans une passe légère séparée, espacée), relis en métadonnées le nom des fichiers
     * Drive créés par l'app. »
     *
     * 🔴 UNE PASSE SUR DIX, ET PAS À CHAQUE RELÈVE. Mesuré : 26 543 copies Drive. Les relire toutes chaque
     * minute ferait près de 400 000 appels par jour pour découvrir un renommage que personne ne fait plus d'une
     * fois par semaine — et le jour où Google limite le compte, c'est la RELÈVE qui s'arrête. Le détail du
     * calcul est dans l'encadré de `reprendreNomsDrive.ts`.
     *
     * ⚠️ L'HORLOGE FAIT LE TIRAGE, pas un compteur en mémoire : le travailleur redémarre (launchd, un
     * déploiement), et un compteur repartirait de zéro à chaque fois — donc relirait à chaque redémarrage.
     *
     * ⚠️ ELLE NE PEUT PAS FAIRE ÉCHOUER LA SUITE : sans la migration 286 elle rend un rapport vide sans émettre
     * une requête, et elle attrape ses propres erreurs.
     */
    if (Math.floor(Date.now() / 60_000) % UNE_PASSE_SUR === 0) {
      const { reprendreNomsDepuisDrive } = await import('./reprendreNomsDrive');
      const repris = await reprendreNomsDepuisDrive();
      if (repris.reprises > 0) {
        journal?.(`suite : ${repris.reprises} pièce(s) renommée(s) dans Google Drive, nom repris dans l’application`);
      }
    }

    /**
     * ⚠️ « A-T-ON FAIT QUELQUE CHOSE ? » TIENT COMPTE DES AVIS. Les deux sorties ci-dessous rendaient `ignore` —
     * « rien à faire, et ce n'est pas une erreur ». Depuis ce lot, une passe peut n'avoir rien à rattacher ET avoir
     * lu un avis de non-remise : la classer `ignore` mettrait « rien de nouveau » dans le journal de la passe alors
     * qu'un mail vient d'être refusé. On rend alors `ok`, et le détail dit ce qui a été lu.
     */
    const issueSansRattachement = (detail: string): IssueSuite => ({
      resultat: c.avisLus > 0 ? 'ok' : 'ignore',
      ms: Date.now() - debut,
      comptes: c,
      detail: c.avisLus > 0 ? resumeSuite(c) : detail,
    });

    if (!(await adressesMessagesDisponibles())) {
      return issueSansRattachement('migration 256 non appliquée : aucune trace d’adresses à tenir à jour');
    }

    const aFaire = await messagesSansAdresses();
    if (aFaire.messages.length === 0) return issueSansRattachement('rien de nouveau à rattacher');

    // ── ① LES ADRESSES DES MESSAGES NOUVEAUX ────────────────────────────────────────────────────────────────────
    const annuaire = await chargerAnnuaireAdresses();
    const comptesReleve = { ...COMPTES_RELEVE_VIDE };
    // `releverPaquet` avance par curseur d'identifiant : on part juste avant le premier message à traiter, et on
    //   boucle jusqu'à les avoir tous dépassés. C'est la MÊME fonction que la commande, sans variante.
    const dernier = aFaire.messages[aFaire.messages.length - 1];
    let depuis = aFaire.messages[0] - 1;
    while (depuis < dernier) {
      const suivant = await releverPaquet(depuis, 500, annuaire, comptesReleve);
      if (suivant === null) break;
      depuis = suivant;
    }
    c.messagesReleves = comptesReleve.messagesVus;
    c.adressesEcrites = comptesReleve.adressesEcrites;
    c.resteAFaire = aFaire.reste === 0 ? 0 : 1;
    journal?.(`suite : ${c.messagesReleves} message(s) relevé(s), ${c.adressesEcrites} adresse(s)`);

    // ── ② LE RÉEXAMEN DES ÉCHANGES TOUCHÉS ──────────────────────────────────────────────────────────────────────
    if (!(await rattachementsDisponibles())) {
      return {
        resultat: 'ok', ms: Date.now() - debut, comptes: c,
        detail: `${resumeSuite(c)} — migration 257 non appliquée, rattachement remis à plus tard`,
      };
    }

    const ambigusAvant = await filsAmbigus(aFaire.fils);
    const libelles = await chargerLibelles();
    const comptesExamen: ComptesPasse = { ...COMPTES_VIDES };
    await examinerFilsPrecis(aFaire.fils, libelles, comptesExamen, true);

    c.filsReexamines = comptesExamen.filsVus;
    c.messagesExamines = comptesExamen.messagesVus;
    c.liensPoses = comptesExamen.liensEcrits;
    c.candidatsPoses = comptesExamen.candidatsEcrits;
    c.respectes = comptesExamen.respectes;
    journal?.(`suite : ${c.filsReexamines} échange(s) réexaminé(s)`
      + `${ambigusAvant > 0 ? ` (dont ${ambigusAvant} qui portaient une ambiguïté)` : ''}`);

    return { resultat: 'ok', ms: Date.now() - debut, comptes: c, detail: resumeSuite(c) };
  } catch (e) {
    // 🔴 ON ATTRAPE TOUT. Le courrier est arrivé ; ce qui a échoué est le confort. L'appelant ne doit pas le savoir
    //   autrement que par ce verdict — surtout pas par une exception qui ferait passer la passe pour ratée.
    const detail = motifSuite(e);
    journal?.(`suite : ÉCHEC — ${detail}`);
    return { resultat: 'erreur', ms: Date.now() - debut, comptes: c, detail };
  }
}

/**
 * CONSIGNE L'ISSUE. Deux endroits, et chacun pour une raison :
 *   · `gestion_releve_run` (migration 258) — c'est LE journal de la passe, celui que le bandeau lit ;
 *   · `gestion_journal` — le journal du module, qui garde la trace même sans la 258, et même pour un `ignore`
 *     instructif.
 *
 * 🔴 ELLE NE JETTE JAMAIS NON PLUS. Un journal qui échoue ne doit pas faire échouer le geste qu'il décrit — c'est la
 * règle du module depuis `journalEnvoi`.
 */
export async function consignerSuite(runId: number | null, issue: IssueSuite): Promise<void> {
  try {
    if (runId !== null && (await suiteReleveDisponible())) {
      await query(
        `UPDATE gestion_releve_run SET suite_resultat = $2, suite_detail = $3, suite_ms = $4 WHERE id = $1`,
        [runId, issue.resultat, issue.detail, issue.ms]);
    }
  } catch { /* la colonne manque ou la base a bronché : le journal du module reste, ci-dessous */ }

  try {
    // On ne journalise pas les « rien à faire » : une ligne par minute pour dire qu'il n'y avait rien noierait le
    //   journal. On garde les réussites qui ont fait quelque chose, et TOUS les échecs.
    if (issue.resultat === 'ignore' && issue.comptes.messagesReleves === 0) return;
    if (!(await rattachementsDisponibles())) return;
    await query(
      `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_libelle)
       VALUES ('rattachement', $1, 'suite', $2, $3, 'relève automatique')`,
      [runId ?? 0, issue.resultat, `${issue.detail} (${issue.ms} ms)`]);
  } catch { /* idem : jamais au prix du geste */ }
}
