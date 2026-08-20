/**
 * N10-B — ALERTE « superstructures au-dessus de la toiture retenue ». Passe SÉPARÉE (découplée de l'écriture des niveaux : un
 * e-mail qui échoue ne casse jamais une écriture, et l'alerte reste REJOUABLE), sur le modèle de G1 `alerteGedAuto` : orchestration
 * PURE par injection (aucun SMTP, aucun S3, aucune base dans les tests). Réutilise l'ENVOI de G1 (transporteur, adresse d'alerte,
 * URL signées) ; seule la cheville d'idempotence est neuve (table `alerte_permis`, migration 129).
 *
 * POURQUOI (à écrire dans le corps du mail, en clair) : le MNS LiDAR mesure la surface pleine LA PLUS HAUTE — une ombrière
 * photovoltaïque ou une superstructure serait donc captée. Retenir la toiture peut SOUS-ESTIMER l'obstacle : c'est le sens d'erreur
 * DANGEREUX. Une décision HUMAINE est attendue.
 *
 * IDEMPOTENCE : une alerte par (permis, type), jamais réémise (table `alerte_permis`, `ON CONFLICT DO NOTHING`). ISOLATION : un
 * échec (SMTP, S3) est compté, n'interrompt pas les autres. GARDE : si plus de `SEUIL_GARDE` permis sont dus d'un coup (avalanche),
 * on N'ENVOIE RIEN et on le signale — décision Arno (à N=1 il n'y a pas d'avalanche ; au-delà, il tranche avant tout envoi).
 */

/** Une cote de superstructure au-dessus du sommet retenu, avec sa provenance et sa clé de stockage (null = pièce introuvable → pas de lien). */
export interface SuperstructureCote { cote: number; piece: string | null; page: number | null; cle: string | null }
/** Un permis dû à l'alerte : identité + sommet retenu + cotes au-dessus. */
export interface CandidatSuperstructure {
  dossierId: number; numDau: string; communeNom: string | null; adresse: string | null;
  sommetValeur: number; sommetNiveau: string; // ex. 'TOITURE'
  cotes: SuperstructureCote[];
}

export interface DepsAlerteSuperstructures {
  lireConfig(): Promise<{ active: boolean; email: string }>;
  chargerCandidats(): Promise<CandidatSuperstructure[]>;   // permis avec réserve superstructures NON encore alertés
  lienSigne(cle: string): Promise<string>;                 // URL signée INLINE (le #page est ajouté ici, jamais côté serveur de signature)
  envoyer(mail: { to: string; sujet: string; corps: string }): Promise<void>;
  journaliser(e: { dossierId: number; sujet: string }): Promise<void>; // INSERT alerte_permis (ON CONFLICT DO NOTHING)
}

export interface BilanAlerteSuperstructures { examinees: number; envoyees: number; erreurs: number; bloque: boolean; nombreDus: number }

/** GARDE anti-avalanche : au-delà, on n'envoie RIEN (Arno tranche avant). À N=1 (cas réel) : sans effet. */
export const SEUIL_GARDE = 5;

/** Objet EXPLICITE : dit qu'une décision humaine est attendue. */
export function sujetSuperstructures(numDau: string): string {
  return `[Permis ${numDau}] Décision attendue — superstructure(s) au-dessus de la toiture retenue`;
}

/** Corps du mail (texte). `liensParCote` : cote → URL cliquable (à la page) ; absente → la cote reste en texte avec sa pièce/page. */
export function corpsSuperstructures(c: CandidatSuperstructure, liensParCote: Map<number, string>): string {
  const L: string[] = [];
  L.push(`Permis ${c.numDau}${c.communeNom ? ` — ${c.communeNom}` : ''}${c.adresse ? ` — ${c.adresse}` : ''}`);
  L.push('');
  L.push(`Sommet retenu : ${c.sommetValeur} NGF (${c.sommetNiveau}).`);
  L.push('');
  L.push(`${c.cotes.length} cote(s) située(s) AU-DESSUS de ce niveau (superstructures) :`);
  for (const s of c.cotes) {
    const prov = s.piece ? `${s.piece}${s.page !== null ? ` p.${s.page}` : ''}` : 'pièce inconnue';
    const lien = liensParCote.get(s.cote);
    L.push(`  · ${s.cote} NGF — ${prov}${lien ? ` : ${lien}` : ' (document introuvable — vérifier à la main)'}`);
  }
  L.push('');
  L.push('Pourquoi c’est important : le MNS LiDAR mesure la surface pleine LA PLUS HAUTE — une ombrière photovoltaïque ou une');
  L.push('superstructure serait donc captée. Retenir la toiture peut SOUS-ESTIMER l’obstacle : c’est le sens d’erreur DANGEREUX.');
  L.push('Une décision humaine est attendue (vérifier les pièces liées ci-dessus, puis trancher la valeur de sommet du certificat).');
  return L.join('\n');
}

/**
 * Une passe d'alertes superstructures. GARDE d'abord (avalanche → rien envoyé). Puis, par permis dû : résout les liens signés (à la
 * page), compose, envoie, journalise (idempotent). Un échec est ISOLÉ. N'écrit NI le moteur de niveaux NI les valeurs — que le registre.
 */
export async function executerAlerteSuperstructures(deps: DepsAlerteSuperstructures): Promise<BilanAlerteSuperstructures> {
  const config = await deps.lireConfig();
  if (!config.active || config.email.trim() === '') return { examinees: 0, envoyees: 0, erreurs: 0, bloque: false, nombreDus: 0 };

  const candidats = await deps.chargerCandidats();
  if (candidats.length > SEUIL_GARDE) return { examinees: 0, envoyees: 0, erreurs: 0, bloque: true, nombreDus: candidats.length };

  let examinees = 0, envoyees = 0, erreurs = 0;
  for (const c of candidats) {
    examinees += 1;
    try {
      // Liens signés INLINE + #page (le fragment n'est jamais signé → sécurité intacte ; la clé ne sort jamais telle quelle).
      const liens = new Map<number, string>();
      for (const s of c.cotes) {
        if (s.cle === null) continue; // pièce introuvable → pas de lien mort ; le corps le dit
        const base = await deps.lienSigne(s.cle);
        liens.set(s.cote, s.page !== null ? `${base}#page=${s.page}` : base);
      }
      const sujet = sujetSuperstructures(c.numDau);
      await deps.envoyer({ to: config.email, sujet, corps: corpsSuperstructures(c, liens) });
      await deps.journaliser({ dossierId: c.dossierId, sujet });
      envoyees += 1;
    } catch {
      erreurs += 1; // ISOLATION : un échec (SMTP, S3…) n'interrompt pas les autres ; pas de journal → retenté à la passe suivante.
    }
  }
  return { examinees, envoyees, erreurs, bloque: false, nombreDus: candidats.length };
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';

/** Durée d'un lien d'alerte : 7 jours — le mail doit rester ouvrable longtemps après réception (comme le plancher 72 h de G1). */
const DUREE_LIEN_ALERTE_S = 7 * 24 * 3600;

export function depsReellesAlerteSuperstructures(): DepsAlerteSuperstructures {
  return {
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { active: c.alerteActive, email: c.alerteEmail }; // même opt-in / destinataire que le récap quotidien et G1
    },
    chargerCandidats: async () => {
      // Permis dont le SOMMET retenu porte la réserve superstructures, NON encore alertés (registre alerte_permis).
      const { rows: perms } = await query<{ dossier_id: number; num_dau: string; commune_nom: string | null; adresse: string | null; sommet: number; reserve: string }>(
        `SELECT j.dossier_id::int AS dossier_id, s.num_dau, c.nom AS commune_nom,
                nullif(btrim(concat_ws(' ', s.adr_num_ter, s.adr_libvoie_ter, s.adr_localite_ter)), '') AS adresse,
                j.valeur AS sommet, j.reserve
           FROM permis_extraction_journal j
           JOIN sitadel_dossier s ON s.id = j.dossier_id
           LEFT JOIN commune c ON c.code_insee = s.code_insee
          WHERE j.methode = 'enonce' AND j.champ = 'altitude_sommet_ngf' AND j.role = 'retenue'
            AND j.reserve ILIKE '%superstructure%'
            AND NOT EXISTS (SELECT 1 FROM alerte_permis a WHERE a.dossier_id = j.dossier_id AND a.type = 'superstructures')`);
      const out: CandidatSuperstructure[] = [];
      for (const p of perms) {
        // Cotes écartées « superstructure » du même permis, résolues vers leur clé de stockage (unicité (dossier_id, nom_fichier)).
        const { rows: cotes } = await query<{ cote: number; piece: string | null; page: number | null; cle: string | null }>(
          `SELECT je.valeur AS cote, je.piece, je.page,
                  (SELECT doc.cle_stockage FROM dossier_document doc
                    WHERE doc.dossier_id = je.dossier_id AND doc.nom_fichier = je.piece
                    LIMIT 1) AS cle
             FROM permis_extraction_journal je
            WHERE je.dossier_id = $1 AND je.methode = 'enonce' AND je.role = 'ecartee' AND je.motif ILIKE '%superstructure%'
            ORDER BY je.valeur DESC`,
          [p.dossier_id]);
        const sommetNiveau = (p.reserve.split(/[ —(]/)[0] || 'sommet').trim(); // le libellé du niveau (ex. « TOITURE ») ouvre la réserve
        out.push({
          dossierId: p.dossier_id, numDau: p.num_dau, communeNom: p.commune_nom, adresse: p.adresse,
          sommetValeur: p.sommet, sommetNiveau,
          cotes: cotes.map((x) => ({ cote: x.cote, piece: x.piece, page: x.page, cle: x.cle })),
        });
      }
      return out;
    },
    lienSigne: async (cle) => {
      const { urlSignee } = await import('../stockage');
      // N10-B — variante INLINE (pas de forcerTelechargement) → le PDF s'ouvre au visionneur (le #page est ajouté par l'orchestration).
      return urlSignee(cle, DUREE_LIEN_ALERTE_S, {});
    },
    envoyer: async (mail) => {
      const { lireConfigEmail, obtenirTransporteur, envoyerAlerte } = await import('../email');
      const cfg = lireConfigEmail();
      if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
      await envoyerAlerte(obtenirTransporteur(cfg), cfg.from, { to: mail.to, sujet: mail.sujet, corps: mail.corps });
    },
    journaliser: async (e) => {
      await query(
        `INSERT INTO alerte_permis (dossier_id, type, sujet) VALUES ($1, 'superstructures', $2)
         ON CONFLICT (dossier_id, type) DO NOTHING`,
        [e.dossierId, e.sujet]);
    },
  };
}
