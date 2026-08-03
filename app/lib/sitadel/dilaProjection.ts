/**
 * Projection du CONTEXTE DILA vers `mairie_contact` (chantier S29). Depuis `dila_import` (millésime le plus récent), on pose
 * le STANDARD de la mairie (`telephone_standard`) — et RIEN d'autre — via `ecrireContact` UNIQUEMENT.
 *
 * DÉCISION (B+C) : on ne touche STRICTEMENT que `telephone_standard`.
 *   • `source` reste 'annuaire' — PAS de bascule vers 'annuaire_dila' : `source` qualifie la provenance du DESTINATAIRE, pas
 *     d'un téléphone ; la DILA n'est pas le destinataire de ces communes (leur e-mail vient toujours de l'annuaire), et
 *     basculer figerait ~308 lignes hors de `doitRemplacerDepuisAnnuaire` pour un gain nul.
 *   • `protocole_verifie_le` N'EST PAS (re)daté : `toucheProtocole:false`. Ajouter un standard ne vérifie pas le protocole
 *     du service urbanisme (même règle que le groupe C de S20).
 *
 * FAIT DÉCISIF (recon S28) : la DILA n'apporte AUCUN courriel pour les communes en manque → ce chantier ne rend personne
 * adressable, il remplit du contexte. `telephone_standard` : 335/335 disponibles.
 *
 * NOTE & SITE — écartés : la note porte du travail humain (protocoles S26) et `ecrireContact` l'écrirait en REMPLACEMENT ;
 * le site n'a aucune colonne dans `mairie_contact` (exigerait une migration).
 *
 * GARDE « travail humain prime » : aucune ligne statut='confirme' ni source='saisie_manuelle'/'reponse_mairie' n'est
 * touchée. Grâce à S24, les champs NON fournis à `ecrireContact` sont conservés → SEUL `telephone_standard` bouge.
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
import { ecrireContact, lireContact, type ContactExistant, type Requete } from './mairieContact';

/** Adapte le `q` transactionnel (RequeteTx) à la signature `Requete` attendue par ecrireContact/lireContact (cf. route contact). */
const brancher = (tx: RequeteTx): Requete =>
  (<R = Record<string, unknown>>(t: string, p?: unknown[]) => tx(t, p) as unknown as Promise<{ rows: R[] }>);

/** Décision de projection pour UNE commune (pure, testable). */
export type DecisionProjection = 'sans_ligne' | 'protegee' | 'sans_valeur_dila' | 'deja_identique' | 'recoit_standard';

/**
 * Classe une commune : pas de ligne contact → 'sans_ligne' ; humain (confirme / saisie_manuelle / reponse_mairie) →
 * 'protegee' ; DILA sans standard → 'sans_valeur_dila' ; standard déjà identique → 'deja_identique' ; sinon 'recoit_standard'.
 */
export function decisionProjection(existant: ContactExistant | null, standardDila: string | null): DecisionProjection {
  if (existant === null) return 'sans_ligne';
  if (existant.statut === 'confirme' || existant.source === 'saisie_manuelle' || existant.source === 'reponse_mairie') return 'protegee';
  const std = (standardDila ?? '').trim();
  if (std === '') return 'sans_valeur_dila';
  if ((existant.telephoneStandard ?? '').trim() === std) return 'deja_identique';
  return 'recoit_standard';
}

export interface DetailGap {
  codeInsee: string;
  nom: string | null;
  canal: string | null;
  standardAvant: string | null;
  standardDila: string | null;
  courrielDila: string | null;   // attendu vide : la DILA n'apporte pas d'e-mail aux communes en manque
  decision: DecisionProjection;
}

export interface ResultatProjection {
  millesimeCode: string;
  dryRun: boolean;
  total: number;
  recoitStandard: string[];
  dejaIdentique: string[];
  protegees: string[];
  sansValeurDila: string[];
  sansLigne: string[];
  ecrites: number;               // ecrireContact ayant réellement écrit (change=true) — uniquement les recoit_standard
  gap: DetailGap[];              // détail des communes en manque
}

const SENTINELLE_DRYRUN = new Error('__DRY_RUN_ROLLBACK__');

/**
 * Projette le standard DILA. `dryRun` (défaut) exécute TOUT le chemin d'écriture puis ROLLBACK (rien n'est appliqué). Les
 * compteurs sont identiques à ceux d'une application réelle. `appliquer:true` COMMIT.
 */
export async function projeterContexteDila(opts: { appliquer?: boolean } = {}): Promise<ResultatProjection> {
  const appliquer = opts.appliquer === true;

  // Millésime le plus récent.
  const { rows: mr } = await query<{ id: number; code: string }>(
    `SELECT id, code FROM dila_millesime ORDER BY importe_le DESC, id DESC LIMIT 1`);
  if (mr.length === 0) throw new Error('aucun millésime DILA importé — lancer d’abord dila:ingest.');
  const millesime = mr[0];

  // Standards DILA du millésime (telephone = standard de la mairie ; courriel pour le contrôle des 22).
  const { rows: dila } = await query<{ code_insee: string; nom: string | null; telephone: string | null; courriel: string | null }>(
    `SELECT code_insee, nom, telephone, courriel FROM dila_import WHERE millesime_id = $1 AND code_insee IS NOT NULL ORDER BY code_insee`,
    [millesime.id]);

  // Ensemble des 22 communes « en manque » (canal 'inconnu' OU aucun e-mail ET aucune PRADA courriel) pour le détail.
  const { rows: gapRows } = await query<{ code_insee: string }>(
    `SELECT c.code_insee FROM commune c
       LEFT JOIN mairie_contact mc ON mc.code_insee = c.code_insee
       LEFT JOIN mairie_prada mp ON mp.code_insee = c.code_insee
      WHERE mc.canal = 'inconnu'
         OR (coalesce(btrim(mc.email),'') = '' AND coalesce(btrim(mp.courriel),'') = '')`);
  const gapSet = new Set(gapRows.map((r) => r.code_insee));

  const res: ResultatProjection = {
    millesimeCode: millesime.code, dryRun: !appliquer, total: dila.length,
    recoitStandard: [], dejaIdentique: [], protegees: [], sansValeurDila: [], sansLigne: [],
    ecrites: 0, gap: [],
  };

  const traiter = async (q: Requete): Promise<void> => {
    for (const d of dila) {
      const existant = await lireContact(q, d.code_insee);
      const standard = (d.telephone ?? '').trim() === '' ? null : (d.telephone ?? '').trim();
      const decision = decisionProjection(existant, standard);

      if (gapSet.has(d.code_insee)) {
        res.gap.push({
          codeInsee: d.code_insee, nom: d.nom, canal: existant?.canal ?? null,
          standardAvant: existant?.telephoneStandard ?? null, standardDila: standard,
          courrielDila: (d.courriel ?? '').trim() === '' ? null : (d.courriel ?? '').trim(), decision,
        });
      }

      if (decision === 'sans_ligne') { res.sansLigne.push(d.code_insee); continue; }
      if (decision === 'protegee') { res.protegees.push(d.code_insee); continue; }
      if (decision === 'sans_valeur_dila') { res.sansValeurDila.push(d.code_insee); continue; }
      if (decision === 'deja_identique') { res.dejaIdentique.push(d.code_insee); continue; } // rien à écrire (valeur identique)
      res.recoitStandard.push(d.code_insee);

      // ecrireContact ET RIEN D'AUTRE. On repasse email/canal/statut/source À L'IDENTIQUE (jamais modifiés) ; on ne fournit
      // PAS url/adresse/tel/note/responsable/emailType → S24 les conserve. toucheProtocole:false → ne date pas le protocole.
      // Résultat : SEUL telephone_standard change.
      const { change } = await ecrireContact(q, {
        codeInsee: d.code_insee,
        email: existant!.email,
        canal: existant!.canal,
        statut: existant!.statut,
        source: existant!.source,          // reste 'annuaire' (jamais basculé)
        telephoneStandard: standard,
        toucheProtocole: false,            // ajouter un standard ne vérifie pas le protocole urbanisme (cf. S20 groupe C)
        motif: `contexte DILA (standard mairie) — millésime ${millesime.code}`,
        auteur: null,
      });
      if (change) res.ecrites += 1;
    }
  };

  if (appliquer) {
    await withTransaction(async (tx) => { await traiter(brancher(tx)); });
  } else {
    // DRY-RUN : on exécute le chemin d'écriture puis on force le ROLLBACK par une sentinelle.
    try {
      await withTransaction(async (tx) => { await traiter(brancher(tx)); throw SENTINELLE_DRYRUN; });
    } catch (e) {
      if (e !== SENTINELLE_DRYRUN) throw e;
    }
  }

  return res;
}
