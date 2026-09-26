/**
 * MODULE « GESTION » — LOT DRIVE-2 : CE QUE LE TRI A BESOIN DE SAVOIR, LU EN BASE. IMPUR (SQL), LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UNE SEULE SOURCE DE VÉRITÉ. Le rapport à blanc (`gestion:tri:rapport`) et la copie réelle
 * (`gestion:drive:copier-pieces`) chargent leur contexte ICI, par la même fonction. Sans cela, le rapport dirait
 * « ce fichier ira là » et la copie le mettrait ailleurs — le pire des défauts possibles pour ce lot, puisque le
 * rapport est précisément ce qu'Arno relit AVANT d'autoriser la copie.
 *
 * 🔴 CE MODULE N'ÉCRIT RIEN, et ne sait pas écrire : aucun INSERT, aucun UPDATE.
 *
 * ⚠️ IL CHARGE TOUT EN MÉMOIRE — 26 000 pièces et leurs métadonnées, corps tronqués. Mesuré : quelques centaines de
 * mégaoctets. C'est assumé : la règle b (« hériter de son échange ») a besoin de voir TOUS les mails d'un fil avant
 * de décider, elle ne peut donc pas se calculer pièce par pièce en flux.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { nomBien, nomProprietaire } from './driveArbre';
import type { AnnuaireTri, LotTri, PieceATrier, ProprietaireTri } from './triPieces';

/**
 * 🔴 L'ADRESSE POSTALE DE L'AGENCE — celle qui figure dans la SIGNATURE de chaque mail sortant.
 *
 * MESURÉ le 26/09/2026 : sans cette exclusion, la règle c reconnaissait cette adresse dans le corps de tous nos
 * envois et y expédiait 1 853 pièces, toutes à tort. Une signature dit qui envoie, pas de quoi le mail parle.
 * Elle vit ici — et non en base — parce que la signature vient de Google, pas de `gestion_config`.
 */
export const ADRESSE_AGENCE_DEFAUT = '2 rue Mars et Roty';

/** Le corps est tronqué : une adresse citée l'est en tête, et 26 000 corps entiers ne tiennent pas en mémoire. */
export const CORPS_MAX = 4000;

/** Une pièce, augmentée de ce dont la COPIE a besoin en plus du tri. */
export interface PieceAvecTaille extends PieceATrier {
  taille: number;
  cleStockage: string | null;
  nomFichier: string;
  typeMime: string | null;
}

export interface LotAffiche extends LotTri { nomAffiche: string }
export interface ProprietaireAffiche extends ProprietaireTri { nomAffiche: string }

export interface ContexteTri {
  annuaire: AnnuaireTri;
  pieces: PieceAvecTaille[];
  /** Clé WIPPIMMO du lot → nom lisible du dossier. Sert aux chemins du rapport. */
  nomsBiens: Map<string, string>;
  nomsProprietaires: Map<string, string>;
}

/** Une colonne JSON de destinataires, lue sans jamais lever : une valeur abîmée ne doit pas arrêter 26 000 pièces. */
function adresses(brut: string | null): string[] {
  if (brut === null || brut.trim() === '') return [];
  try {
    const j = JSON.parse(brut) as unknown;
    return Array.isArray(j) ? j.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/** CHARGE TOUT ce que le tri demande. LECTURE SEULE. */
export async function chargerContexteTri(adresseAgence = ADRESSE_AGENCE_DEFAUT): Promise<ContexteTri> {
  const { rows: contacts } = await query<{ sujet: string; sujet_id: string; valeur: string }>(
    `SELECT sujet, sujet_id, valeur FROM gestion_annuaire_contact
      WHERE sorte = 'email' AND absent_le IS NULL`);

  const { rows: lots } = await query<{
    cle: string; prop: string | null; adresse: string | null; cp: string | null; commune: string | null;
    nature: string | null; type_bien: string | null;
  }>(`SELECT lo.wippimmo_id AS cle, pr.wippimmo_id AS prop, lo.adresse, lo.code_postal AS cp, lo.commune,
             lo.nature, lo.type_bien
        FROM gestion_annuaire_lot lo
        LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id`);

  const { rows: props } = await query<{ id: string; cle: string; nom_normalise: string; nom_complet: string }>(
    'SELECT id, wippimmo_id AS cle, nom_normalise, nom_complet FROM gestion_annuaire_proprietaire');

  const { rows: locs } = await query<{ id: string; nom_normalise: string }>(
    'SELECT id, nom_normalise FROM gestion_annuaire_locataire');

  const { rows: occs } = await query<{
    locataire_id: string; lot: string | null; prop: string | null; entree: string | null; sortie: string | null;
  }>(`SELECT o.locataire_id, lo.wippimmo_id AS lot, pr.wippimmo_id AS prop, o.entree::text, o.sortie::text
        FROM gestion_annuaire_occupation o
        LEFT JOIN gestion_annuaire_lot lo ON lo.id = o.lot_id
        LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id`);

  const { rows: cfg } = await query<{ adresse: string | null }>(
    'SELECT adresse_gestion AS adresse FROM gestion_config WHERE id = 1')
    .catch(() => ({ rows: [] as { adresse: string | null }[] }));

  const parLot = new Map<string, string[]>();
  const lotsAffiches: LotAffiche[] = lots.map((l) => {
    if (l.prop !== null) parLot.set(l.prop, [...(parLot.get(l.prop) ?? []), l.cle]);
    return {
      cle: l.cle, proprietaireCle: l.prop, adresse: l.adresse, codePostal: l.cp, commune: l.commune,
      nomAffiche: nomBien({
        wippimmoId: l.cle, proprietaireWippimmoId: l.prop, adresse: l.adresse, codePostal: l.cp,
        commune: l.commune, nature: l.nature, typeBien: l.type_bien,
      }),
    };
  });

  const propsAffiches: ProprietaireAffiche[] = props.map((p) => ({
    id: Number(p.id), cle: p.cle, nomNormalise: p.nom_normalise, lots: parLot.get(p.cle) ?? [],
    nomAffiche: nomProprietaire({ wippimmoId: p.cle, nomComplet: p.nom_complet }),
  }));

  const annuaire: AnnuaireTri = {
    adressesMaison: [cfg[0]?.adresse ?? 'gestion@criterimmo.fr'],
    adressesPostalesMaison: adresseAgence.trim() === '' ? [] : [adresseAgence],
    contacts: contacts.map((c) => ({
      email: c.valeur, role: c.sujet as 'proprietaire' | 'locataire', sujetId: Number(c.sujet_id),
    })),
    lots: lotsAffiches,
    proprietaires: propsAffiches,
    locataires: locs.map((l) => ({ id: Number(l.id), nomNormalise: l.nom_normalise })),
    occupations: occs.map((o) => ({
      locataireId: Number(o.locataire_id), lotCle: o.lot, proprietaireCle: o.prop,
      entree: o.entree, sortie: o.sortie,
    })),
  };

  const { rows } = await query<{
    piece_id: string; taille: string; cle_stockage: string | null; nom_fichier: string; type_mime: string | null;
    message_id: string; fil_id: string | null; recu_le: string; sens: string; de_adresse: string;
    dest_a: string | null; dest_cc: string | null; objet: string | null; corps: string | null;
    evenement_adresse: string | null;
  }>(
    `SELECT p.id AS piece_id, p.taille_octets::text AS taille, p.cle_stockage, p.nom_fichier, p.type_mime,
            m.id AS message_id, m.fil_id, m.recu_le::text, m.sens, m.de_adresse,
            m.dest_a::text, m.dest_cc::text, m.objet, left(coalesce(m.corps_texte, ''), $1) AS corps,
            ev.adresse_libre AS evenement_adresse
       FROM gestion_piece p
       JOIN gestion_message m ON m.id = p.message_id
       LEFT JOIN gestion_affectation af ON af.fil_id = m.fil_id AND af.detache_le IS NULL
       LEFT JOIN gestion_evenement ev ON ev.id = af.evenement_id
      ORDER BY p.id`, [CORPS_MAX]);

  const pieces: PieceAvecTaille[] = rows.map((r) => ({
    pieceId: Number(r.piece_id), messageId: Number(r.message_id),
    filId: r.fil_id === null ? null : Number(r.fil_id),
    date: r.recu_le, sens: r.sens === 'envoye' ? 'envoye' : 'recu',
    expediteur: r.de_adresse, destinataires: [...adresses(r.dest_a), ...adresses(r.dest_cc)],
    objet: r.objet ?? '', corps: r.corps ?? '', evenementAdresse: r.evenement_adresse,
    stockee: r.cle_stockage !== null,
    taille: Number(r.taille), cleStockage: r.cle_stockage, nomFichier: r.nom_fichier, typeMime: r.type_mime,
  }));

  return {
    annuaire, pieces,
    nomsBiens: new Map(lotsAffiches.map((l) => [l.cle, l.nomAffiche])),
    nomsProprietaires: new Map(propsAffiches.map((p) => [p.cle, p.nomAffiche])),
  };
}
