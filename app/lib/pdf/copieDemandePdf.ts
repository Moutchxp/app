import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import PDFDocument from 'pdfkit';

/**
 * GÉNÉRATEUR PDF GÉNÉRIQUE de la COPIE d'une demande de communication (chantier X1) — la pièce jointe R343-1 d'une future
 * saisine CADA (« copie de la demande initiale restée sans suite »).
 *
 * ⚠️ N'utilise PAS `certificatPdf.ts` et ne le modifie pas : sa mise en page (positionnement absolu, 1 page, verdict/QR)
 * est spécifique au certificat. Ici : pdfkit EN FLUX (pagination automatique), polices existantes de `app/lib/pdf/actifs/`.
 *
 * SOBRE et FIDÈLE : un en-tête rappelant référence / destinataire / date d'envoi, puis le corps FIGÉ repris VERBATIM sur
 * autant de pages que nécessaire. AUCUNE donnée inventée : ce qui n'est pas fourni n'est pas imprimé.
 */

const ACTIFS = join(process.cwd(), 'app', 'lib', 'pdf', 'actifs');
const A = (nom: string): Buffer => readFileSync(join(ACTIFS, nom));

export interface CopieDemande {
  reference: string;              // référence de la demande (toujours présente)
  destinataire?: string | null;  // dest_email figé (imprimé seulement si fourni)
  dateEnvoi?: string | null;      // date d'envoi, déjà formatée (imprimée seulement si fournie)
  corps: string;                  // corps FIGÉ de la demande — repris VERBATIM
}

/** Rôle d'un bloc de texte de la copie (pilote la police/taille au rendu). */
export type RoleBloc = 'titre' | 'entete' | 'corps';
export interface BlocCopie { role: RoleBloc; texte: string }

/**
 * Compose, dans l'ordre d'impression, les blocs de texte de la copie. PUR (aucun PDF) → testable directement. En-tête =
 * SEULEMENT les champs réellement fournis (aucune donnée inventée) ; le corps est le DERNIER bloc, repris VERBATIM.
 */
export function composerCopieDemande(d: CopieDemande): BlocCopie[] {
  const blocs: BlocCopie[] = [{ role: 'titre', texte: 'Copie de la demande de communication' }];
  blocs.push({ role: 'entete', texte: `Référence : ${d.reference}` });
  if (d.destinataire && d.destinataire.trim() !== '') blocs.push({ role: 'entete', texte: `Destinataire : ${d.destinataire.trim()}` });
  if (d.dateEnvoi && d.dateEnvoi.trim() !== '') blocs.push({ role: 'entete', texte: `Envoyée le : ${d.dateEnvoi.trim()}` });
  blocs.push({ role: 'corps', texte: d.corps }); // VERBATIM — jamais reformaté
  return blocs;
}

/**
 * Rend la copie en PDF (Buffer). pdfkit en FLUX : le corps long produit AUTOMATIQUEMENT plusieurs pages A4. Le corps est
 * écrit tel quel (mêmes retours à la ligne). Résout sur `end`, rejette sur `error`.
 */
export function genererCopieDemandePdf(d: CopieDemande): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 }); // ~20 mm
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.registerFont('corps', A('PublicSans-Regular.ttf'));
      doc.registerFont('gras', A('PublicSans-SemiBold.ttf'));

      for (const b of composerCopieDemande(d)) {
        if (b.role === 'titre') { doc.font('gras').fontSize(13).text(b.texte); doc.moveDown(0.6); }
        else if (b.role === 'entete') { doc.font('gras').fontSize(9).text(b.texte); }
        else { doc.moveDown(1); doc.font('corps').fontSize(10).text(b.texte, { align: 'left' }); }
      }
      doc.end();
    } catch (e) { reject(e as Error); }
  });
}
