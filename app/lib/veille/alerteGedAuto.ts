/**
 * G1 — ORCHESTRATION des alertes « contenu reçu, pas encore classé en GED ». Branché dans le CORPS d'executerVeille (aucun
 * nouveau job, aucune nouvelle clé), sous le MÊME verrou, APRÈS les propositions CADA. Testable PAR INJECTION (aucun SMTP,
 * aucun S3, aucune base dans les tests). Idempotence par (réponse × permis × type) via la table alerte_ged.
 *
 * INVARIANTS : on ne SUIT JAMAIS un lien de mairie (ni vérif ni téléchargement — geste humain) ; une alerte ne pose NI
 * satisfait_le NI demande.statut NI bascule Archives ; envoi à TOUTE heure (jamais bridé par alerte_heure_locale) ; le retard
 * (passe manquée, machine éteinte) est ENREGISTRÉ (en_retard) pour rester visible. ISOLATION : un échec n'interrompt ni les
 * autres alertes ni la veille.
 */
import { query } from '../db/client';
import { chargerConfigVeille } from '../sitadel/veilleConfig';
import {
  expirationEffective, alertesDues, pieceEstLourde, dureeLienSigne, sujetAlerte, composerCorpsForward,
  type TypeAlerteGed, type ContexteAlerte, type PieceForward,
} from './alerteGed';

/** Une pièce stockée d'une réponse (métadonnées ; le contenu est relu à la demande via le stockage). */
export interface PieceCandidate { nomFichier: string; tailleOctets: number | null; cleStockage: string | null; typeMime: string | null }

/** Un couple (réponse × permis) à surveiller — ou (réponse × NULL) pour une réponse non rattachée porteuse d'un lien. */
export interface CandidatAlerteGed {
  reponseId: number;
  dossierId: number | null;   // null = réponse non rattachée (permis inconnu)
  numDau: string | null;
  communeNom: string | null;
  recuLe: Date;
  expireLeCapte: Date | null; // expiration L1 (plus proche des liens forts) ou null → défaut 7 j
  aLienPerissable: boolean;
  liensPerissables: { url: string; mention: string }[];
  autresPermis: string[];
  pieces: PieceCandidate[];
  classe: boolean;            // ce permis a une ligne dossier_document (rebours éteint)
  deAdresse: string; deNom: string | null; objet: string | null; corpsTexte: string | null;
}

/** I/O de l'alerte GED, injectables pour les tests. */
export interface DepsAlerteGed {
  maintenant(): Date;
  lireConfig(): Promise<{ active: boolean; email: string }>;
  chargerCandidats(): Promise<CandidatAlerteGed[]>;
  dejaEnvoyes(reponseId: number, dossierId: number | null): Promise<TypeAlerteGed[]>;
  lienSigne(cle: string, dureeS: number): Promise<string>;          // urlSignee (jamais un GET vers la mairie)
  lireContenuPiece(cle: string): Promise<Buffer>;                   // recuperer (pièce déjà chez nous)
  envoyer(mail: { to: string; sujet: string; corps: string; attachments: { filename: string; content: Buffer; contentType: string }[] }): Promise<void>;
  journaliser(e: { reponseId: number; dossierId: number | null; type: TypeAlerteGed; seuil: Date; enRetard: boolean; sujet: string }): Promise<void>;
}

export interface BilanAlerteGed { examinees: number; envoyees: number; enRetard: number; erreurs: number }

/**
 * Une passe d'alertes. Pour chaque candidat, calcule les alertes DUES (J-3/24 h, non déjà envoyées, permis non classé, dans la
 * fenêtre), compose le forward (lien EN TÊTE ; pièces petites jointes / lourdes en lien signé ≥ 72 h), envoie, journalise. Le
 * journal AVANT la prochaine passe empêche tout doublon. Un échec sur une alerte est ISOLÉ (compté, on continue).
 */
export async function executerAlerteGedAuto(deps: DepsAlerteGed): Promise<BilanAlerteGed> {
  const config = await deps.lireConfig();
  if (!config.active || config.email.trim() === '') return { examinees: 0, envoyees: 0, enRetard: 0, erreurs: 0 };

  const maintenant = deps.maintenant();
  const candidats = await deps.chargerCandidats();
  let examinees = 0, envoyees = 0, enRetard = 0, erreurs = 0;

  for (const c of candidats) {
    examinees += 1;
    const expiration = expirationEffective(c.recuLe, c.expireLeCapte);
    const dejaEnvoyes = await deps.dejaEnvoyes(c.reponseId, c.dossierId);
    const dues = alertesDues({ expiration, classe: c.classe, dejaEnvoyes, maintenant });

    for (const due of dues) {
      try {
        // Pièces : joindre les petites (relues du stockage), lier les lourdes (URL signée ≥ temps restant, plancher 72 h).
        const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
        const piecesForward: PieceForward[] = [];
        for (const p of c.pieces) {
          if (p.cleStockage === null) { piecesForward.push({ nomFichier: p.nomFichier, jointe: false, lienSigne: null }); continue; }
          if (pieceEstLourde(p.tailleOctets)) {
            const url = await deps.lienSigne(p.cleStockage, dureeLienSigne(expiration, maintenant));
            piecesForward.push({ nomFichier: p.nomFichier, jointe: false, lienSigne: url });
          } else {
            const contenu = await deps.lireContenuPiece(p.cleStockage);
            attachments.push({ filename: p.nomFichier, content: contenu, contentType: p.typeMime ?? 'application/octet-stream' });
            piecesForward.push({ nomFichier: p.nomFichier, jointe: true, lienSigne: null });
          }
        }

        const ctx: ContexteAlerte = { numDau: c.numDau, aLienPerissable: c.aLienPerissable };
        const sujet = sujetAlerte(due.type, ctx);
        const corps = composerCorpsForward({
          type: due.type, ctx, liensPerissables: c.liensPerissables, autresPermis: c.autresPermis, communeNom: c.communeNom,
          pieces: piecesForward, deAdresse: c.deAdresse, deNom: c.deNom, objet: c.objet, recuLe: c.recuLe.toISOString(), corpsTexte: c.corpsTexte, enRetard: due.enRetard,
        });

        await deps.envoyer({ to: config.email, sujet, corps, attachments });
        await deps.journaliser({ reponseId: c.reponseId, dossierId: c.dossierId, type: due.type, seuil: due.seuil, enRetard: due.enRetard, sujet });
        envoyees += 1;
        if (due.enRetard) enRetard += 1;
      } catch {
        erreurs += 1; // ISOLATION : un échec (SMTP, S3…) n'interrompt ni les autres alertes ni la veille. Pas de journal → retenté à la passe suivante.
      }
    }
  }
  return { examinees, envoyees, enRetard, erreurs };
}

// ── Implémentations RÉELLES (production) ──────────────────────────────────────

/** Mention brève et datée d'un lien fort (audit/forward), sans jamais suivre le lien. */
function mentionLien(expireLe: string | null, indice: string | null): string {
  if (expireLe) return `expire le ${expireLe.slice(8, 10)}/${expireLe.slice(5, 7)}${indice ? ` (${indice})` : ''}`;
  return indice ? `validité : ${indice}` : 'durée de validité non précisée';
}

export function depsReellesAlerteGed(): DepsAlerteGed {
  return {
    maintenant: () => new Date(),
    lireConfig: async () => {
      const c = await chargerConfigVeille();
      return { active: c.alerteActive, email: c.alerteEmail }; // même opt-in / destinataire que le récap quotidien
    },
    chargerCandidats: async () => {
      // 1) Bases : (réponse × permis actif) des réponses rattachées AVEC contenu (pièce OU lien fort), hors rebond ; +
      //    (réponse × NULL) des réponses NON rattachées porteuses d'un lien fort. `classe` = ce permis a un dossier_document.
      const { rows: base } = await query<{
        reponse_id: number; dossier_id: number | null; num_dau: string | null; commune_nom: string | null;
        recu_le: string; de_adresse: string; de_nom: string | null; objet: string | null; corps_texte: string | null; classe: boolean;
      }>(
        `SELECT r.id::int AS reponse_id, dd.dossier_id::int AS dossier_id, s.num_dau, c.nom AS commune_nom,
                r.recu_le::text AS recu_le, r.de_adresse, r.de_nom, r.objet, r.corps_texte,
                EXISTS (SELECT 1 FROM dossier_document doc WHERE doc.dossier_id = dd.dossier_id) AS classe
           FROM demande_reponse r
           JOIN demande d ON d.id = r.demande_id
           JOIN demande_dossier dd ON dd.demande_id = d.id AND dd.actif
           JOIN sitadel_dossier s ON s.id = dd.dossier_id
           LEFT JOIN commune c ON c.code_insee = d.code_insee
          WHERE r.demande_id IS NOT NULL AND r.nature <> 'rebond'
            AND (EXISTS (SELECT 1 FROM demande_reponse_piece p WHERE p.reponse_id = r.id)
                 OR EXISTS (SELECT 1 FROM demande_reponse_lien l WHERE l.reponse_id = r.id AND l.fort))
          UNION ALL
         SELECT r.id::int AS reponse_id, NULL::int AS dossier_id, NULL::text AS num_dau, NULL::text AS commune_nom,
                r.recu_le::text AS recu_le, r.de_adresse, r.de_nom, r.objet, r.corps_texte, false AS classe
           FROM demande_reponse r
          WHERE r.demande_id IS NULL AND r.nature <> 'rebond'
            AND EXISTS (SELECT 1 FROM demande_reponse_lien l WHERE l.reponse_id = r.id AND l.fort)
          ORDER BY reponse_id, dossier_id`,
      );
      if (base.length === 0) return [];
      const reponseIds = [...new Set(base.map((b) => b.reponse_id))];

      // 2) Liens FORTS par réponse (pour l'expiration + le forward). expire_le trié → le plus proche en tête.
      const { rows: liens } = await query<{ reponse_id: number; url: string; expire_le: string | null; expiration_indice: string | null }>(
        `SELECT reponse_id::int AS reponse_id, url, expire_le::text AS expire_le, expiration_indice
           FROM demande_reponse_lien WHERE fort AND reponse_id = ANY($1::bigint[]) ORDER BY reponse_id, expire_le NULLS LAST`,
        [reponseIds]);
      const liensParReponse = new Map<number, { url: string; mention: string; expireLe: string | null }[]>();
      for (const l of liens) {
        (liensParReponse.get(l.reponse_id) ?? liensParReponse.set(l.reponse_id, []).get(l.reponse_id)!)
          .push({ url: l.url, mention: mentionLien(l.expire_le, l.expiration_indice), expireLe: l.expire_le });
      }

      // 3) Pièces stockées par réponse.
      const { rows: pieces } = await query<{ reponse_id: number; nom_fichier: string; taille_octets: number | null; cle_stockage: string | null; type_mime: string | null }>(
        `SELECT reponse_id::int AS reponse_id, nom_fichier, taille_octets::bigint AS taille_octets, cle_stockage, type_mime
           FROM demande_reponse_piece WHERE reponse_id = ANY($1::bigint[]) ORDER BY reponse_id, id`,
        [reponseIds]);
      const piecesParReponse = new Map<number, PieceCandidate[]>();
      for (const p of pieces) {
        (piecesParReponse.get(p.reponse_id) ?? piecesParReponse.set(p.reponse_id, []).get(p.reponse_id)!)
          .push({ nomFichier: p.nom_fichier, tailleOctets: p.taille_octets === null ? null : Number(p.taille_octets), cleStockage: p.cle_stockage, typeMime: p.type_mime });
      }

      // autresPermis : les autres num_dau de la MÊME réponse (dérivé des bases).
      const permisParReponse = new Map<number, string[]>();
      for (const b of base) if (b.num_dau) (permisParReponse.get(b.reponse_id) ?? permisParReponse.set(b.reponse_id, []).get(b.reponse_id)!).push(b.num_dau);

      return base.map((b) => {
        const lf = liensParReponse.get(b.reponse_id) ?? [];
        const expiresCaptes = lf.map((x) => x.expireLe).filter((x): x is string => x !== null).map((s) => new Date(s));
        const expireLeCapte = expiresCaptes.length > 0 ? new Date(Math.min(...expiresCaptes.map((d) => d.getTime()))) : null;
        return {
          reponseId: b.reponse_id, dossierId: b.dossier_id, numDau: b.num_dau, communeNom: b.commune_nom,
          recuLe: new Date(b.recu_le), expireLeCapte, aLienPerissable: lf.length > 0,
          liensPerissables: lf.map((x) => ({ url: x.url, mention: x.mention })),
          autresPermis: (permisParReponse.get(b.reponse_id) ?? []).filter((n) => n !== b.num_dau),
          pieces: piecesParReponse.get(b.reponse_id) ?? [],
          classe: b.classe, deAdresse: b.de_adresse, deNom: b.de_nom, objet: b.objet, corpsTexte: b.corps_texte,
        };
      });
    },
    dejaEnvoyes: async (reponseId, dossierId) => {
      const { rows } = await query<{ type: TypeAlerteGed }>(
        `SELECT type FROM alerte_ged WHERE reponse_id = $1 AND coalesce(dossier_id, 0) = coalesce($2, 0)`,
        [reponseId, dossierId]);
      return rows.map((r) => r.type);
    },
    lienSigne: async (cle, dureeS) => {
      const { urlSignee } = await import('../stockage');
      return urlSignee(cle, dureeS);
    },
    lireContenuPiece: async (cle) => {
      const { recuperer } = await import('../stockage');
      return recuperer(cle);
    },
    envoyer: async (mail) => {
      const { lireConfigEmail, obtenirTransporteur, envoyerForwardGed } = await import('../email');
      const cfg = lireConfigEmail();
      if (cfg === null) throw new Error('compte SMTP par défaut non configuré (SMTP_* / MAIL_FROM)');
      await envoyerForwardGed(obtenirTransporteur(cfg), cfg.from, { to: mail.to, sujet: mail.sujet, corps: mail.corps, attachments: mail.attachments });
    },
    journaliser: async (e) => {
      await query(
        `INSERT INTO alerte_ged (reponse_id, dossier_id, type, seuil_le, en_retard, sujet)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (reponse_id, coalesce(dossier_id, 0), type) DO NOTHING`,
        [e.reponseId, e.dossierId, e.type, e.seuil, e.enRetard, e.sujet]);
    },
  };
}
