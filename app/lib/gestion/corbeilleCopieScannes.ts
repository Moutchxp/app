import type { DepsGoogle } from './google';
import { basculerCorbeille } from './driveCorbeilleReel';
import { journaliserRefus } from './driveEcriture';
import { ASCENSION_MAX, verifierCorbeilleCopie } from './driveGardeFou';
import { inscrireMouvement } from './driveMouvementRepo';

/**
 * ══ 🔴🔴 LA CORBEILLE DES COPIES FAUTIVES DE LA COPIE DE « Documents clients scannés » (décision d'Arno du 19/10/2026) ══
 *
 * La copie du 18/10/2026 a laissé des copies NON conformes (« Copie de … », taille non prouvée) dans le dossier de copie
 * « Base de données locative / Import Documents clients scannés – copie du 18-10-2026 ». Arno a décidé qu'elles partent
 * à la CORBEILLE — réversible trente jours —, jamais en suppression définitive.
 *
 * 🔴 L'ORDRE, POUR CHAQUE IDENTIFIANT :
 *   ① la fiche ET toute la chaîne des parents sont RELUES CHEZ GOOGLE (`lire`, une lecture seule fournie par l'appelant) ;
 *   ② `verifierCorbeilleCopie` (driveGardeFou) juge : identifiant de la LISTE explicite, fichier, sous le dossier de
 *      copie, jamais sous « Documents clients scannés » ni « 00 Arrivée des mails ». Un refus est journalisé ;
 *   ③ l'écriture passe par `basculerCorbeille`, LA seule écriture de corbeille du dépôt (un `PATCH { trashed }`, rien
 *      d'autre) — pas de seconde implémentation ;
 *   ④ le geste est inscrit au journal des mouvements Drive (`gestion_drive_mouvement`), comme ceux de l'application :
 *      c'est ce qui permet de le retrouver et de l'annuler.
 */

export interface FicheDrive { id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean }

export interface IssueCorbeilleCopie {
  faits: { id: string; nom: string; mouvementId: number | null }[];
  refuses: { id: string; motif: string }[];
}

/** La chaîne des ancêtres, du parent direct vers le haut, relue chez Google. Une lecture qui échoue rend une chaîne vide. */
async function chaineDe(fiche: FicheDrive, lire: (id: string) => Promise<FicheDrive>): Promise<{ id: string; nom: string }[]> {
  const chaine: { id: string; nom: string }[] = [];
  let parent = fiche.parents?.[0];
  for (let n = 0; parent !== undefined && n < ASCENSION_MAX; n += 1) {
    const p = await lire(parent);
    chaine.push({ id: p.id, nom: p.name });
    parent = p.parents?.[0];
  }
  return parent === undefined ? chaine : [];
}

export async function mettreCopiesFautivesALaCorbeille(
  o: { ids: readonly string[]; racineCopieId: string; scannesId: string; interdits: ReadonlySet<string> },
  lire: (id: string) => Promise<FicheDrive>,
  ecriture: { jeton: string; deps: DepsGoogle; compteGoogle: string; auteurLibelle: string },
): Promise<IssueCorbeilleCopie> {
  const issue: IssueCorbeilleCopie = { faits: [], refuses: [] };
  const autorises = new Set(o.ids);
  for (const id of o.ids) {
    let fiche: FicheDrive;
    let chaine: { id: string; nom: string }[];
    try {
      fiche = await lire(id);
      chaine = await chaineDe(fiche, lire);
    } catch (e) {
      issue.refuses.push({ id, motif: `lecture impossible : ${(e as Error).message}` });
      continue;
    }
    if (fiche.trashed === true) { issue.refuses.push({ id, motif: 'déjà à la corbeille' }); continue; }
    const verdict = verifierCorbeilleCopie({ cibleId: id, cibleMime: fiche.mimeType, chaine },
      { autorises, racineCopieId: o.racineCopieId, scannesId: o.scannesId, interdits: o.interdits });
    if (!verdict.ok) {
      await journaliserRefus({ operation: 'corbeille_copie', parentDriveId: fiche.parents?.[0] ?? null, cibleDriveId: id, nom: fiche.name }, verdict);
      issue.refuses.push({ id, motif: verdict.motif });
      continue;
    }
    const r = await basculerCorbeille(ecriture.jeton, { id, versLaCorbeille: true }, ecriture.deps);
    if (!r.ok) { issue.refuses.push({ id, motif: r.motif }); continue; }
    if (!r.valeur.aLaCorbeille) { issue.refuses.push({ id, motif: 'Google n’a pas confirmé la mise à la corbeille' }); continue; }
    const mouvementId = await inscrireMouvement({
      action: 'corbeille', driveId: id, nom: fiche.name, estDossier: false,
      parentOrigine: fiche.parents?.[0] ?? '', parentCible: '', copieDriveId: null,
      auteurId: null, auteurLibelle: ecriture.auteurLibelle, compteGoogle: ecriture.compteGoogle,
    });
    issue.faits.push({ id, nom: fiche.name, mouvementId });
  }
  return issue;
}
