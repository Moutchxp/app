/**
 * CÂBLAGE de l'ENVOI du certificat (Lot 7) — dernier maillon. Rangé dans `app/lib/email/` (avec le transport qu'il
 * orchestre), comme le câblage carte vit dans `carte/` et le câblage PDF dans `pdf/`.
 *
 * Appelé à l'émission APRÈS `publierCertificatPdf`, hors transaction. BEST-EFFORT, ne throw JAMAIS. Log
 * `console.error('[certificat-envoi] …')`.
 *
 * STATUT EN CAS D'ÉCHEC D'ENVOI : le statut RESTE `'genere'` (le PDF existe, l'envoi est retentable) ; on renseigne
 * seulement `derniere_erreur`. `'echec'` est réservé à l'échec de GÉNÉRATION (6b). On distingue « généré, jamais
 * tenté » de « généré, envoi raté » par `derniere_erreur` NON NULL. Comme au 6b, `derniere_erreur = le NOM de
 * l'erreur`, jamais son message (un message SMTP peut contenir l'adresse du destinataire).
 *
 * ⚠️ Aucun log ne contient le jeton, ni l'adresse du destinataire, ni le corps du mail.
 */
import { query } from '../db/client';
import { recuperer, stockageConfigure } from '../stockage';
import { signerJetonRetrait } from '../internaute/jetonRectification';
import { effacerIdentiteLivraisonSiEligible } from '../internaute/cycleVie';
import { lireConfigEmail, obtenirTransporteur, envoyerCertificat } from './index';
import { genererBufferCertificat } from '../pdf/publierCertificatPdf';
import { genererVisuelPng } from '../visuel/genererVisuelPng';

/** Base absolue du site (serveur only), pour le lien de vérification du corps. `null` si absente/mal formée. */
function siteUrl(): string | null {
  const u = (process.env.SITE_URL ?? '').trim();
  return /^https?:\/\/.+/.test(u) ? u.replace(/\/+$/, '') : null;
}

interface LigneEnvoi {
  numero: string;
  reference: string;
  prenom: string | null;
  email: string | null; // LEFT JOIN internaute : NULL possible sur un dossier effacé (RGPD)
  pdf_cle: string | null; // sur certificat_acheminement : NULL si PDF non généré
  internaute_id: string; // internaute_projet.internaute_id (NOT NULL) → scelle le jeton de désabonnement
  a_un_compte: boolean; // documents secondaires (anonymisé/visuel) réservés aux titulaires de compte
  // Colonnes du SET VISUEL (snapshot certificat + resultat.visuel figé au Commit 1). Aucune donnée nominative.
  verdict: string;
  score: string | null; // numeric → string (driver pg)
  type_bien: string | null;
  surface_m2: string | null;
  nb_pieces: number | null;
  annee_batiment: number | null;
  epoque: string | null;
  etage: number | null;
  dernier_etage: boolean | null;
  visuel_exterieur: string | null;
  visuel_ville: string | null;
}

const REQUETE = `
  SELECT c.numero, c.reference, i.prenom, i.email, a.pdf_cle, ip.internaute_id,
         EXISTS (SELECT 1 FROM internaute_auth ia WHERE ia.internaute_id = ip.internaute_id) AS a_un_compte,
         c.verdict, c.score, c.type_bien, c.surface_m2, c.nb_pieces, c.annee_batiment, c.epoque, c.etage, c.dernier_etage,
         c.resultat->'visuel'->>'exterieur' AS visuel_exterieur, c.resultat->'visuel'->>'ville' AS visuel_ville
    FROM certificat c
    JOIN internaute_projet ip ON ip.id = c.projet_id
    LEFT JOIN internaute i ON i.id = ip.internaute_id
    LEFT JOIN certificat_acheminement a ON a.certificat_id = c.id
   WHERE c.id = $1
`;

export async function publierEnvoiCertificat(certificatId: number): Promise<void> {
  try {
    if (!stockageConfigure()) return; // pas de PDF récupérable → rien à envoyer (silencieux)
    const config = lireConfigEmail();
    if (!config) {
      console.error('[certificat-envoi] configuration SMTP absente/incomplète → pas d’envoi');
      return;
    }
    const base = siteUrl();
    if (!base) {
      console.error('[certificat-envoi] SITE_URL absente → pas d’envoi (lien de vérification incomplet)');
      return;
    }

    const r = await query<LigneEnvoi>(REQUETE, [certificatId]);
    const row = r.rows[0];
    if (!row) {
      console.error('[certificat-envoi] certificat introuvable', certificatId);
      return;
    }
    // Dossier effacé (RGPD) → plus de destinataire : NORMAL, pas une erreur.
    if (!row.email) {
      console.error('[certificat-envoi] destinataire absent (dossier effacé ?) → pas d’envoi', certificatId);
      return;
    }
    // PDF pas encore généré (6b différé/échec) → rien à joindre.
    if (!row.pdf_cle) {
      console.error('[certificat-envoi] PDF non généré → envoi différé', certificatId);
      return;
    }

    const pdf = await recuperer(row.pdf_cle); // relecture (pas de régénération) — NOMINATIF, toujours joint

    // DOCUMENTS SECONDAIRES (best-effort), générés À LA VOLÉE, RÉSERVÉS AUX TITULAIRES DE COMPTE : un one-shot n'a ni
    // anonymisé authentifiable ni visuel exploitable (leur QR renverrait « sans_compte »). Chaque génération est isolée :
    // un échec omet SEULEMENT la pièce concernée — le nominatif part TOUJOURS. Aucun dépôt, aucune donnée sensible loggée.
    let pdfAnonyme: Buffer | undefined;
    let visuelPng: Buffer | undefined;
    if (row.a_un_compte) {
      try {
        pdfAnonyme = (await genererBufferCertificat(certificatId, { anonymise: true, typeDocument: 'anonyme' })) ?? undefined;
      } catch (e) {
        console.error('[certificat-envoi] anonymisé non généré (best-effort)', (e as Error)?.name ?? 'Erreur');
      }
      try {
        visuelPng = await genererVisuelPng({
          verdict: row.verdict,
          score: row.score === null ? null : Number(row.score),
          reference: row.reference,
          urlBase: base,
          descriptif: {
            ville: row.visuel_ville,
            typeBien: row.type_bien,
            surfaceM2: row.surface_m2 === null ? null : Number(row.surface_m2),
            pieces: row.nb_pieces,
            anneeOuEpoque: row.annee_batiment !== null ? String(row.annee_batiment) : row.epoque,
            etage: row.etage,
            dernierEtage: row.dernier_etage,
            exterieur: row.visuel_exterieur,
          },
        });
      } catch (e) {
        console.error('[certificat-envoi] visuel non généré (best-effort)', (e as Error)?.name ?? 'Erreur');
      }
    }

    // Jeton de DÉSABONNEMENT (voie de retrait e-mail). BEST-EFFORT : si la signature échoue (secret absent), on envoie
    // le certificat SANS le pied — ne JAMAIS priver l'internaute de son certificat pour un pied manquant.
    let jetonDesabonnement: string | null = null;
    try {
      jetonDesabonnement = await signerJetonRetrait(row.internaute_id);
    } catch (e) {
      console.error('[certificat-envoi] jeton de désabonnement non frappé (envoi sans pied)', (e as Error)?.name ?? 'Erreur');
    }

    await envoyerCertificat(obtenirTransporteur(config), config.from, {
      to: row.email,
      prenom: row.prenom,
      numero: row.numero,
      reference: row.reference,
      siteUrl: base,
      pdf,
      pdfAnonyme,
      visuelPng,
      jetonDesabonnement,
    });
    await query(
      `UPDATE certificat_acheminement SET statut = 'envoye', envoye_le = now(), maj_a = now() WHERE certificat_id = $1`,
      [certificatId],
    );
    // EFFACEMENT AUTO (Commit 4 — A2) : l'envoi est CONFIRMÉ ('envoye' posé ci-dessus). Si l'internaute est
    // NON-CONSENTANT, on anonymise IMMÉDIATEMENT son identité de livraison — le certificat/projet SURVIT (vérifiable
    // par jeton). Best-effort (la fonction ne throw jamais). JAMAIS avant ce point : un envoi raté n'efface rien.
    await effacerIdentiteLivraisonSiEligible(row.internaute_id);
  } catch (e) {
    // Best-effort : le statut RESTE 'genere' ; on renseigne seulement derniere_erreur (le NOM, jamais le message).
    const nom = (e as Error)?.name ?? 'Erreur';
    console.error('[certificat-envoi] envoi indisponible', nom);
    try {
      await query(`UPDATE certificat_acheminement SET derniere_erreur = $1, maj_a = now() WHERE certificat_id = $2`, [nom, certificatId]);
    } catch {
      /* best-effort : même l'écriture de l'échec ne doit jamais throw */
    }
  }
}
