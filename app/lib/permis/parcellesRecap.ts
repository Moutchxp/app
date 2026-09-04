/**
 * LOT 66 — LECTURE PURE de la table « Références cadastrales » d'un RÉCAPITULATIF de demande (télé-service, « Basé sur le cerfa
 * n° 13409 »). Ce document n'est PAS un AcroForm : `decisionParcelles` (bloc T2 + annexe 4) n'y trouve AUCUN champ. La liste des
 * parcelles n'existe QUE dans la couche TEXTE (pdfjs, comme le reste de la chaîne). On la lit SANS PLAFOND : le récap peut déclarer
 * plus de parcelles que Sitadel (plafonné à sec/num_cadastre1..3), et l'empreinte attendue est FAUSSE si on n'en lit qu'une partie.
 * Aucune base, aucune IA.
 *
 * Forme mesurée (dossier 7424) : « … Partielle  0   Z   1   600   Non  0   Z   2   420   Non  …  Situation juridique … » — colonnes
 * Préfixe · Section · Numéro · Surface(m²) · Observation · Partielle(Oui|Non). On ne lit QUE les colonnes utiles à l'IDENTITÉ de la
 * parcelle (préfixe/section/numéro + superficie déclarée) ; l'observation et « Partielle » sont ignorées. Le découpage se fait sur la
 * colonne « Partielle » (Oui|Non), qui termine CHAQUE ligne : le comptage des lignes est donc EXACT (N10-R). Une ligne dont on ne peut
 * pas lire section+numéro reste ABSENTE avec un motif dans `anomalies` — jamais un vide muet, jamais une valeur inventée.
 *
 * Préfixe NORMALISÉ à 3 chiffres (« 0 » → « 000 ») pour coïncider avec la clé (dossier, role, section, numero, prefixe) des parcelles
 * cadastrales déjà écrites par le CLI de rapprochement (préfixe « 000 ») : sans quoi `ecrireParcelles` (ON CONFLICT … DO NOTHING) ne
 * dédoublonne pas et on crée des doublons au lieu de compléter la liste.
 */
export interface ParcelleRecap { prefixe: string; section: string; numero: string; superficieM2: number | null }
export interface LectureRecapCerfa {
  parcelles: ParcelleRecap[];
  anomalies: string[];    // lignes de la table non lisibles (section/numéro), énoncées — jamais un silence (N10-R)
}

const RE_ENTETE = /r[ée]f[ée]rences?\s+cadastrales/gi;
// bornes de la table : la section suivante du récap (jamais un « Non » de « Situation juridique » compté comme une ligne).
const RE_FIN = /situation\s+juridique|nature\s+des?\s+travaux|superficie\s+(?:du\s+terrain|de\s+plancher|plancher)|destinations?\b/i;
// une LIGNE : préfixe(1-3 chiffres) section(1-3 lettres) numéro(1-4 chiffres + lettre?) [superficie(chiffres)]? [observation]? — la
//   superficie est OPTIONNELLE (une parcelle sans surface déclarée reste identifiable ; ne jamais la perdre pour l'empreinte).
const RE_LIGNE = /^(\d{1,3})\s+([A-Za-z]{1,3})\s+(\d{1,4}[A-Za-z]?)(?:\s+(\d{1,7}))?(?:\s+.*)?$/;

/** Clé de dédup section/numéro : majuscules + zéros de tête retirés (une même parcelle vue deux fois n'est comptée qu'une). */
const cleParcelle = (section: string, numero: string) => `${section.toUpperCase()}#${numero.replace(/^0+/, '') || '0'}`;

/** Lit toutes les tables « Références cadastrales » présentes dans le TEXTE fourni (un dossier peut concaténer plusieurs pièces). */
export function lireParcellesRecapCerfa(texte: string): LectureRecapCerfa {
  const t = (texte ?? '').replace(/\s+/g, ' ');
  const parcelles: ParcelleRecap[] = [];
  const anomalies: string[] = [];
  const vues = new Set<string>();
  RE_ENTETE.lastIndex = 0;
  let e: RegExpExecArray | null;
  while ((e = RE_ENTETE.exec(t)) !== null) {
    const apres = t.slice(e.index + e[0].length);
    const finRel = apres.search(RE_FIN);
    const bloc = finRel >= 0 ? apres.slice(0, finRel) : apres.slice(0, 1500); // borne dure si aucune section suivante repérée
    // retirer l'en-tête de colonnes : les lignes commencent APRÈS le 1er « Partielle » (intitulé de la dernière colonne).
    const hdr = bloc.search(/partielle/i);
    const corps = hdr >= 0 ? bloc.slice(hdr + 'partielle'.length) : bloc;
    // chaque ligne se termine par sa colonne « Partielle » (Oui|Non) → on découpe là-dessus ; le dernier fragment est le reliquat.
    const segments = corps.split(/\b(?:oui|non)\b/i);
    for (let k = 0; k < segments.length - 1; k++) {
      const seg = segments[k].trim();
      if (!seg) continue;
      const m = RE_LIGNE.exec(seg);
      if (!m) { anomalies.push(`ligne du récapitulatif illisible (section/numéro), ignorée — aucune valeur inventée : « ${seg.slice(0, 60)} »`); continue; }
      const section = m[2].toUpperCase();
      const numero = m[3].toUpperCase();
      const cle = cleParcelle(section, numero);
      if (vues.has(cle)) continue;
      vues.add(cle);
      const prefixe = (m[1].replace(/\D/g, '') || '0').padStart(3, '0').slice(-3);
      const s = m[4] !== undefined ? Number(m[4]) : NaN;
      parcelles.push({ prefixe, section, numero, superficieM2: Number.isFinite(s) ? s : null });
    }
  }
  return { parcelles, anomalies };
}
