/**
 * Analyse d'un ACCUSÉ DE REJET (DSN, RFC 3464) — module 100 % PUR (chantier R3d). Aucune I/O, aucun import de pg,
 * d'imapflow ni du repo. Un accusé de rejet NE THREAD PAS (son In-Reply-To ne référence pas notre message) : l'identifiant
 * du message d'origine est dans la CHARGE UTILE du rapport. On extrait donc, par DEUX voies :
 *  - VOIE STRUCTURÉE : les sous-parties MIME (message/rfc822 ou text/rfc822-headers → Message-ID d'origine ;
 *    message/delivery-status → Final-Recipient / Status / Diagnostic-Code) ;
 *  - VOIE DE REPLI : recherche des mêmes motifs dans le texte brut (beaucoup de serveurs ne respectent pas la norme, et
 *    mailparser replie souvent la partie delivery-status dans le corps texte).
 * Le Message-ID est normalisé comme dans rattachementReponse (R2) : chevrons retirés, domaine en minuscules.
 */

/** Une sous-partie MIME pertinente d'un rapport (fournie par l'adaptateur : message/rfc822, text/rfc822-headers, message/delivery-status). */
export interface PartieRapport { typeMime: string; contenu: string }
export interface EntreeRapportRejet { corpsTexte?: string; parties?: PartieRapport[] }
export interface ResultatRapportRejet {
  destinataireEchec?: string; // Final-Recipient (adresse), minuscules
  statut?: string;            // Status (ex. 5.1.1)
  messageIdOrigine?: string;  // Message-ID du message d'origine, NORMALISÉ
  diagnostic?: string;        // Diagnostic-Code (1re ligne)
}

/** Normalise un Message-ID comme rattachementReponse (R2) : chevrons retirés, trim, domaine en minuscules (local sensible). */
export function normaliserMessageId(brut: string): string {
  const s = brut.trim().replace(/^<+/, '').replace(/>+$/, '').trim();
  const at = s.lastIndexOf('@');
  return at === -1 ? s : `${s.slice(0, at)}@${s.slice(at + 1).toLowerCase()}`;
}

function chercherMessageId(txt: string): string | undefined {
  const m = txt.match(/Message-ID:\s*(<[^>]+>|\S+)/i);
  return m ? normaliserMessageId(m[1]) : undefined;
}
function chercherFinalRecipient(txt: string): string | undefined {
  const m = txt.match(/Final-Recipient:\s*[^;\n]*;\s*([^\s>]+)/i);
  return m ? m[1].trim().toLowerCase() : undefined;
}
function chercherStatut(txt: string): string | undefined {
  const m = txt.match(/\bStatus:\s*(\d\.\d+\.\d+)/i);
  return m ? m[1] : undefined;
}
function chercherDiagnostic(txt: string): string | undefined {
  const m = txt.match(/Diagnostic-Code:\s*([^\r\n]+)/i);
  return m ? m[1].trim() : undefined;
}

/** Analyse un DSN. Champs absents = undefined. Un message normal (sans partie ni motif) → tout undefined. */
export function analyserRapportRejet(m: EntreeRapportRejet): ResultatRapportRejet {
  const parties = m.parties ?? [];
  const partOrig = parties.find((p) => /rfc822/i.test(p.typeMime));        // message/rfc822 | text/rfc822-headers
  const partDS = parties.find((p) => /delivery-status/i.test(p.typeMime)); // souvent replié dans le corps par mailparser
  const toutTexte = [m.corpsTexte ?? '', ...parties.map((p) => p.contenu)].join('\n');
  const sourceDS = partDS?.contenu ?? toutTexte;

  return {
    messageIdOrigine: (partOrig ? chercherMessageId(partOrig.contenu) : undefined) ?? chercherMessageId(toutTexte),
    destinataireEchec: chercherFinalRecipient(sourceDS) ?? chercherFinalRecipient(toutTexte),
    statut: chercherStatut(sourceDS) ?? chercherStatut(toutTexte),
    diagnostic: chercherDiagnostic(sourceDS) ?? chercherDiagnostic(toutTexte),
  };
}
