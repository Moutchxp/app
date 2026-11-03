// 🔴 MON ESPACE, LOT 9 (Arno, 02/11/2026) — « MES APPORTEURS » : lectures et écritures. L'annuaire est celui de la Location ; la création est
// `creerApporteur` et la modification `enregistrerFicheApporteur` (suiviRepo, telles quelles : règles interne / externe, collègue obligatoire,
// barème, journal, garde de version de la fiche). « Mon espace » ajoute : qui voit quoi, ZÉRO DOUBLON sur tout l'annuaire (homonyme, téléphone,
// e-mail) avant toute création, et qui peut modifier. Pas de `import 'server-only'` (même convention que les dépôts, lus par les épreuves).
import { query } from '../db/client';
import { apporteursUtilisesDisponible } from '../admin/schemaDroits';
import { ajouterBaremeApporteur, ajouterRemunerationCollegue, creerApporteur, enregistrerFicheApporteur, enregistrerRattachement, ficheIdentiteDisponible, interneDisponible, lireApporteurs,
  lireComptesInterface, nomPrenomDisponible, passageDisponible, toujoursDisponible } from '../location/suivi/suiviRepo';
import { aujourdhuiParis, collegueADate, droitRattachement, MOT_REMUNERATION_ADMIN } from '../location/suivi/suivi';
import type { Auteur } from '../gestion/gestes';
import { lireRetrocessions, lireVentes, transactionDisponible } from '../transaction/repo';
import { parApporteur } from '../transaction/modele';
import { estAdministrateur } from './compteRepo';
import { estAMoi } from './mesAffaires';
import { moiDansLesVentes } from './mesAffairesRepo';
import { doublonsApporteur, mesApporteursAnnuaire, messageDoublon, peutModifierApporteur, type Doublon, type MesApporteursLus, type SaisieApporteur } from './apporteurs';
export type { MesApporteursLus } from './apporteurs';

/** Les apporteurs que ce compte « utilise » (migration 450) ; sans elle : aucun. LECTURE SEULE. */
async function utilises(compteId: number): Promise<Set<number>> {
  if (!(await apporteursUtilisesDisponible())) return new Set();
  const { rows } = await query<{ a: string }>('SELECT apporteur_id AS a FROM mon_espace_apporteur WHERE compte_id = $1 AND retire_le IS NULL', [compteId]);
  return new Set(rows.map((r) => Number(r.a)));
}


/** « Mes apporteurs » : ceux que je vois, avec leurs chiffres sur mes ventes (`parApporteur`, comme le Suivi CA). LECTURE SEULE. */
export async function lireMesApporteurs(compteId: number): Promise<MesApporteursLus> {
  const jour = aujourdhuiParis();
  const administrateur = await estAdministrateur(compteId);
  const [annuaire, comptes, ventes, retros] = await Promise.all([lireApporteurs(), lireComptesInterface().catch(() => []),
    (await transactionDisponible()) ? lireVentes(null) : Promise.resolve([]), (await transactionDisponible()) ? lireRetrocessions(null).catch(() => []) : Promise.resolve([])]);
  const moi = await moiDansLesVentes(compteId, ventes);
  const miennes = ventes.filter((v) => estAMoi(v, moi));
  const ids = new Set(miennes.map((v) => v.id));
  const mesRetros = retros.filter((r) => (r.venteId !== null && ids.has(r.venteId)) || (r.venteId === null && moi.libelles.has(r.negociateur)));
  const lignes = parApporteur(mesRetros, miennes.filter((v) => v.statut === 'vendue'));
  const apporteurs = mesApporteursAnnuaire(annuaire, { compteId, administrateur, jour, utilises: await utilises(compteId), lignes,
    idsSurMesVentes: new Set(miennes.flatMap((v) => (v.dossier?.apporteurId == null ? [] : [v.dossier.apporteurId]))),
    nomsSurMesVentes: new Set([...miennes.flatMap((v) => (v.apporteur == null ? [] : [v.apporteur])), ...mesRetros.flatMap((r) => (r.apporteur == null ? [] : [r.apporteur]))]) });
  return { apporteurs, collegues: comptes.filter((c) => c.actif !== false).map((c) => ({ id: c.id, libelle: c.libelle })), titulaireId: compteId, administrateur,
    utiliserDisponible: await apporteursUtilisesDisponible(), identite: await ficheIdentiteDisponible(), nomPrenom: await nomPrenomDisponible(),
    // 🔴 D26 — les mises à jour de la base dont dépendent le rattachement, la rémunération du collègue et « Passer en interne » (comme la Location).
    avec419: await interneDisponible(), toujours: await toujoursDisponible(), passage: await passageDisponible() };
}

/** Les doublons d'une saisie, sur TOUT l'annuaire (côté serveur) : « Cet apporteur existe déjà, rattaché à … ». LECTURE SEULE. */
export async function doublonsDansLAnnuaire(s: SaisieApporteur): Promise<Doublon[]> {
  return doublonsApporteur(s, await lireApporteurs(), aujourdhuiParis());
}

// Une création à la fois (le serveur de l'application est un seul processus) : le contrôle des doublons et l'écriture ne se croisent jamais ;
// l'index unique du nom (migration 406) tient en plus la base elle-même.
let file: Promise<unknown> = Promise.resolve();
const unParUn = <T>(f: () => Promise<T>): Promise<T> => { const r = file.then(f, f); file = r.catch(() => undefined); return r; };

/**
 * Créer un apporteur depuis « Mon espace » : JAMAIS un doublon (homonyme, téléphone, e-mail : 409 avec les fiches existantes) ; un externe est
 * rattaché par défaut au titulaire ; puis `creerApporteur` de la Location, tel quel. L'apporteur créé est aussi « utilisé » par le titulaire (450).
 */
export async function creerApporteurMonEspace(compteId: number, brut: Record<string, unknown>, auteur: Auteur):
  Promise<{ ok: true; id: number; avertissement?: string } | { ok: false; statut: 409 | 422; motif: string; doublons?: Doublon[] }> {
  return unParUn(async () => {
    const interne = brut.interne === true;
    const nomComplet = String(brut.nom ?? '').trim();
    if (!interne) {
      const d = await doublonsDansLAnnuaire({ nom: nomComplet, prenom: '', telephone: String(brut.telephone ?? ''), email: String(brut.email ?? '') });
      if (d.length > 0) return { ok: false, statut: 409, motif: messageDoublon(d[0]), doublons: d } as const;
    }
    const saisie = interne ? brut : { ...brut, collegueId: brut.collegueId == null || brut.collegueId === '' ? compteId : brut.collegueId };
    try {
      const r = await creerApporteur({ ...saisie, depuis: aujourdhuiParis(), origine: 'mon-espace' }, auteur);
      if (r.etat !== 'ok' || r.data === undefined) {
        // Un refus de la Location parce que la fiche existe (le nom, relu en base sous transaction) reste un doublon : 409 avec la fiche.
        const d = interne ? [] : await doublonsDansLAnnuaire({ nom: nomComplet, prenom: '', telephone: String(brut.telephone ?? ''), email: String(brut.email ?? '') });
        if (d.length > 0) return { ok: false, statut: 409, motif: messageDoublon(d[0]), doublons: d } as const;
        return { ok: false, statut: 422, motif: 'motif' in r && typeof r.motif === 'string' ? r.motif : 'Création refusée.' } as const;
      }
      await utiliserApporteur(compteId, r.data.id, auteur);
      // 🔴 D26 (Arno, 03/11/2026) — le formulaire de création est celui de la fiche : civilité, nom / prénom, autres téléphones et e-mails, adresse,
      // notes s'enregistrent aussitôt, par la fonction de la Location (journal, garde de version) — l'apporteur, lui, est créé quoi qu'il arrive.
      if (!interne && brut.fiche != null && typeof brut.fiche === 'object') {
        const cree = (await lireApporteurs()).find((x) => x.id === r.data!.id);
        const f = await enregistrerFicheApporteur(r.data.id, { fiche: brut.fiche, version: cree?.version ?? null }, auteur);
        if (f.etat !== 'ok') return { ok: true, id: r.data.id, avertissement: `Apporteur créé ; le reste de sa fiche n’a pas été enregistré : ${'motif' in f ? f.motif : 'refus'}` } as const;
      }
      return { ok: true, id: r.data.id } as const;
    } catch (e) {
      if ((e as { code?: string }).code === '23505') {
        const d = await doublonsDansLAnnuaire({ nom: nomComplet, prenom: '', telephone: '', email: '' });
        return { ok: false, statut: 409, motif: d.length > 0 ? messageDoublon(d[0]) : 'Cet apporteur existe déjà.', doublons: d } as const;
      }
      throw e;
    }
  });
}

/** « L'utiliser » : l'apporteur entre dans MES apporteurs, sans changer son rattachement ni ses règles (450) ; deux clics : une seule ligne. */
export async function utiliserApporteur(compteId: number, apporteurId: number, auteur: Auteur): Promise<{ ok: true } | { ok: false; statut: 404 | 422; motif: string }> {
  if (!(await apporteursUtilisesDisponible())) return { ok: false, statut: 422, motif: 'Garder cet apporteur dans votre liste est disponible après la mise à jour de la base (migration 450). Choisissez-le dans le compromis : il y sera enregistré.' };
  const { rows } = await query<{ n: number }>('SELECT count(*)::int AS n FROM gestion_location_apporteur WHERE id = $1 AND archive_le IS NULL', [apporteurId]);
  if ((rows[0]?.n ?? 0) === 0) return { ok: false, statut: 404, motif: 'Apporteur inconnu.' };
  await query(`INSERT INTO mon_espace_apporteur (compte_id, apporteur_id, cree_par_libelle) VALUES ($1, $2, $3)
    ON CONFLICT (compte_id, apporteur_id) WHERE retire_le IS NULL DO NOTHING`, [compteId, apporteurId, auteur.libelle]);
  return { ok: true };
}

/** Modifier la fiche : son collègue de rattachement, l'apporteur interne lui-même, ou un administrateur (403 sinon) ; puis la fonction de la Location. */
export async function modifierFicheMonEspace(compteId: number, apporteurId: number, fiche: unknown, version: string | null, auteur: Auteur):
  Promise<{ ok: true; data: unknown } | { ok: false; statut: 403 | 404 | 409 | 422; motif: string }> {
  const a = (await lireApporteurs()).find((x) => x.id === apporteurId && !x.archive);
  if (a === undefined) return { ok: false, statut: 404, motif: 'Apporteur inconnu.' };
  if (!peutModifierApporteur(a, compteId, await estAdministrateur(compteId), aujourdhuiParis())) {
    return { ok: false, statut: 403, motif: 'Seuls son collègue de rattachement et les administrateurs modifient la fiche de cet apporteur.' };
  }
  const r = await enregistrerFicheApporteur(apporteurId, { fiche, version }, auteur);
  if (r.etat === 'ok') return { ok: true, data: r.data };
  return { ok: false, statut: r.etat === 'conflit' ? 409 : 422, motif: 'motif' in r && typeof r.motif === 'string' ? r.motif : 'Enregistrement refusé.' };
}

/**
 * 🔴 D26 (Arno, 03/11/2026) — LE RATTACHEMENT, LA RÉMUNÉRATION DU COLLÈGUE ET LE TAUX DEPUIS LA FICHE DE « MON ESPACE ». Mêmes droits que la Location,
 * où ces gestes sont réservés aux ADMINISTRATEURS (`ACTIONS_ADMIN` de la route du suivi) : jamais élargis ici. Puis les fonctions de la Location,
 * telles quelles (une transaction, journal). Garde de version du rattachement : `collegueAvant` (le collègue lu à l'ouverture de la fiche, null :
 * « à rattacher ») doit être celui d'aujourd'hui, sinon 409 — rien n'est écrit.
 */
export type GesteAnnuaire = 'rattachement' | 'bareme-apporteur' | 'remuneration-collegue';
export const MOT_RATTACHEMENT_ADMIN = 'Le collègue rattaché, sa rémunération et le taux d’un apporteur se modifient par un administrateur (comme dans la Location).';
export async function gesteAnnuaireMonEspace(compteId: number, apporteurId: number, geste: GesteAnnuaire, corps: Record<string, unknown>, auteur: Auteur):
  Promise<{ ok: true } | { ok: false; statut: 403 | 404 | 409 | 422; motif: string }> {
  const administrateur = await estAdministrateur(compteId);
  // 🔴 D32 (option B) — un collaborateur : seulement SE rattacher un apporteur « à rattacher » (`droitRattachement`, la règle de la Location) ; le reste : 403
  if (!administrateur && geste !== 'rattachement') return { ok: false, statut: 403, motif: geste === 'remuneration-collegue' || geste === 'bareme-apporteur' ? MOT_REMUNERATION_ADMIN : MOT_RATTACHEMENT_ADMIN };
  const a = (await lireApporteurs()).find((x) => x.id === apporteurId && !x.archive);
  if (a === undefined) return { ok: false, statut: 404, motif: 'Apporteur inconnu.' };
  const droit = geste === 'rattachement' ? droitRattachement({ administrateur, compteId, apporteur: a, brut: corps.rattachement }) : { ok: true as const, sansRemuneration: false };
  if (!droit.ok) return { ok: false, statut: 403, motif: droit.motif };
  if (geste === 'rattachement' && 'collegueAvant' in corps) {
    const actuel = collegueADate(a, aujourdhuiParis())?.collegueId ?? null;
    const lu = corps.collegueAvant == null ? null : Number(corps.collegueAvant);
    if (actuel !== lu) return { ok: false, statut: 409, motif: 'Le collègue rattaché de cet apporteur a changé depuis l’ouverture de la fiche : rechargez-la, puis recommencez.' };
  }
  const r = geste === 'rattachement' ? await (droit.sansRemuneration ? enregistrerRattachement(apporteurId, corps.rattachement, auteur, { sansRemuneration: true }) : enregistrerRattachement(apporteurId, corps.rattachement, auteur))
    : geste === 'bareme-apporteur' ? await ajouterBaremeApporteur(apporteurId, corps.bareme, auteur)
      : await ajouterRemunerationCollegue(apporteurId, corps.remuneration, auteur);
  if (r.etat === 'ok') return { ok: true };
  return { ok: false, statut: 422, motif: 'motif' in r && typeof r.motif === 'string' ? r.motif : 'Enregistrement refusé.' };
}
