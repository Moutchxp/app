/**
 * ══ 🔴🔴 Arno (15/11/2026, 9e retour du test iPhone) — LIRE UN SON SUR L'IPHONE ══════════════════════════════════════════════════════════
 * CAUSE de « Écouter ne démarre pas » : Safari (et Chrome, qui utilise le même moteur sur iPhone) ne lit un son ou une vidéo servis par le
 * serveur que si celui-ci répond aux demandes PARTIELLES (`Range: bytes=0-1` → 206 Partial Content, `Accept-Ranges`, `Content-Range`).
 * Les pièces étaient servies en bloc, en « pièce jointe » : le lecteur de l'iPhone refusait de les lire. Ces règles disent quelle plage
 * rendre. PUR, sans import.
 */
export type Plage = { debut: number; fin: number };

/** La plage demandée (`Range: bytes=…`), bornée à la taille ; null : pas de plage (tout le fichier) ; 'invalide' : 416. PUR. */
export function lirePlage(entete: string | null | undefined, taille: number): Plage | null | 'invalide' {
  if (!entete) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete.trim());
  if (m === null || (m[1] === '' && m[2] === '')) return null; // plusieurs plages ou forme inconnue : tout le fichier
  if (taille <= 0) return 'invalide';
  if (m[1] === '') {
    // « bytes=-500 » : les 500 derniers octets
    const n = Number(m[2]);
    if (!(n > 0)) return 'invalide';
    return { debut: Math.max(0, taille - n), fin: taille - 1 };
  }
  const debut = Number(m[1]);
  const fin = m[2] === '' ? taille - 1 : Math.min(Number(m[2]), taille - 1);
  if (!Number.isSafeInteger(debut) || debut >= taille || fin < debut) return 'invalide';
  return { debut, fin };
}

/** Un son ou une image se LIT dans la page (inline) ; le reste se télécharge. PUR. */
export const seLitDansLaPage = (typeMime: string): boolean => /^(audio|image|video)\//i.test(typeMime);

/** L'en-tête « Content-Disposition » : inline pour un son ou une image, pièce jointe sinon (nom nettoyé). PUR. */
export function dispositionPiece(typeMime: string, nomFichier?: string | null): string {
  const nom = (nomFichier ?? '').replace(/[\r\n"\\]/g, '_').trim();
  const sorte = seLitDansLaPage(typeMime) ? 'inline' : 'attachment';
  return nom === '' ? sorte : `${sorte}; filename="${nom}"`;
}
