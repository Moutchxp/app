/**
 * ══ 🔴🔴 LOCATION — BIENS « RENTRÉS OCCUPÉS » EXISTANTS (Arno, 26/10/2026, migration 430). R4 : RIEN NE BASCULE D'OFFICE. ════════════════
 *
 * DRY-RUN PAR DÉFAUT — aucune écriture :
 *   · avec `--bien=<id>` : l'état du bien (réponse, entrée en gestion, annexes, baux, lignes de suivi) et ce que `--appliquer` ferait ;
 *   · toujours : la LISTE des candidats « rentré occupé » (bien en gestion, réponse non renseignée, bail en cours à l'entrée en gestion
 *     commencé au moins N jours avant — `--ecart=90` par défaut), pour qu'Arno décide au cas par cas. Aucun n'est modifié.
 * `--appliquer` (avec `--bien=<id> --date-mandat=AAAA-MM-JJ`, et `--bail=<id>` pour le bail du locataire en place) : le bien marqué
 * « rentré occupé », la date du mandat posée comme date d'effet corrigée de son entrée en gestion (la transition d'origine est gardée),
 * le bail marqué « locataire en place à la prise en gestion », et — 🔴 Arno (26/10/2026, décision D, 431) — avec `--ligne-suivi=<id>`, la
 * ligne de suivi « Bail » de ce bail CONVERTIE en « Mandat de gestion seul » (date du mandat, hors « Baux signés » et CA ; réversible dans
 * « Suivi du mois »). UNE transaction, journalisée ; rien n'est supprimé. Sans --ligne-suivi, les lignes de suivi ne sont pas touchées.
 * Rapport : `.captures/rentre-occupe/rapport-<date>.txt` (ou `--rapport=`).
 *
 * Lancer : npm run location:rentre-occupe -- --bien=123                                   → DRY-RUN
 *          npm run location:rentre-occupe -- --bien=123 --date-mandat=2026-10-15 --bail=456 --ligne-suivi=789 --appliquer
 */
import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree as fichierLance } from '../lib/scripts/pointEntree';
import { closePool } from '../lib/db/client';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import { appliquerCas, candidatsRentreOccupe, etatDuCas, rentreOccupeDisponible, type EtatCas } from '../lib/location/rentreOccupeRepo';
import { dateFr, ECART_CANDIDAT_JOURS, estCandidatRentreOccupe, MENTION_EN_PLACE, verifierRentreOccupe } from '../lib/location/rentreOccupe';

/** Sans la migration 430 : rien n'échoue, rien n'est lu ni écrit — le script le DIT. */
export const MOT_SANS_430 = 'Disponible après la mise à jour (migration 430 non appliquée) : rien n’a été lu ni écrit. Appliquez la mise à jour, puis relancez.';
const AUTEUR = { id: null, libelle: 'script location:rentre-occupe (décision d’Arno)' };
const entier = (v: string | null): number | null => (v !== null && /^[1-9]\d{0,15}$/.test(v) ? Number(v) : null);

/** L'état d'un bien, en lignes lisibles. PUR. */
export function decrireCas(e: EtatCas): string[] {
  const l = [`Bien ${e.lotId} — ${e.titre} — propriétaire ${e.proprietaire} — statut ${e.statut ?? '—'}`,
    `  loué à la prise en gestion : ${e.entreOccupe === null ? 'non renseigné' : e.entreOccupe ? 'oui (rentré occupé)' : 'non (rentré vide)'}`,
    `  entrée en gestion : ${e.entree === null ? 'aucune' : `${dateFr(e.entree.corrigeeLe ?? e.entree.effetLe)} (transition n° ${e.entree.transitionId}${e.entree.corrigeeLe ? `, corrigée — origine ${dateFr(e.entree.effetLe)}` : ''})`}`];
  for (const a of e.annexes) l.push(`  annexe ${a.lotId} : entrée ${a.effetLe === null ? 'aucune' : dateFr(a.effetLe)}`);
  for (const b of e.baux) {
    l.push(`  bail ${b.bailId} : ${b.occupants} — entrée ${b.entree === null ? '—' : dateFr(b.entree)}${b.sortie ? `, sortie ${dateFr(b.sortie)}` : ''}${b.enPlace ? ` — ${MENTION_EN_PLACE}` : ''}`);
    for (const a of b.activites) l.push(`    suivi n° ${a.id} : ${a.type} du ${dateFr(a.dateSignature)}, honoraires de location HT ${a.honoHt.toFixed(2)} €${a.type === 'bail' ? ' ← compté dans « Baux signés » (à corriger dans « Suivi du mois » si c’est le bail en place)' : ''}`);
  }
  return l;
}

export async function main(argvBrut: readonly string[] = process.argv.slice(2)): Promise<string[]> {
  const argv = argvBrut;
  const appliquer = argv.includes('--appliquer');
  const bien = entier(optionLigne(argv, 'bien'));
  const bail = entier(optionLigne(argv, 'bail'));
  const ligneSuivi = entier(optionLigne(argv, 'ligne-suivi'));
  const dateMandat = optionLigne(argv, 'date-mandat');
  const ecart = entier(optionLigne(argv, 'ecart')) ?? ECART_CANDIDAT_JOURS;
  const lignes: string[] = [`[location:rentre-occupe] ${appliquer ? 'APPLIQUER' : 'DRY-RUN (aucune écriture)'} — ${new Date().toISOString()}`];
  const dire = (x: string): void => { lignes.push(x); console.log(x); };
  console.log(lignes[0]);
  if (!(await rentreOccupeDisponible())) {
    dire(MOT_SANS_430);
  } else {
    if (bien !== null) {
      const avant = await etatDuCas(bien);
      if (avant === null) dire(`Bien ${bien} : inconnu.`);
      else {
        dire('── AVANT'); decrireCas(avant).forEach(dire);
        if (appliquer) {
          const d = verifierRentreOccupe({ entreOccupe: true, dateMandat }, true, new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }));
          if (!d.ok) dire(`Refusé : ${d.motif} (--date-mandat=AAAA-MM-JJ, à confirmer par Arno).`);
          else {
            const r = await appliquerCas({ lotId: bien, dateMandat: d.dateEffet ?? '', bailId: bail, ligneSuivi }, AUTEUR);
            if (r.etat !== 'ok') dire(`Refusé : ${r.etat === 'refus' ? r.motif : r.etat}. Rien n’a été écrit.`);
            else {
              dire(r.data.lignes.length === 0 ? 'Rien à faire : déjà dans cet état.' : `Écrit (une transaction, journalisée) :\n  ${r.data.lignes.join('\n  ')}`);
              const apres = await etatDuCas(bien);
              if (apres !== null) { dire('── APRÈS'); decrireCas(apres).forEach(dire); }
            }
          }
        } else {
          dire(`── CE QUE --appliquer FERAIT${dateMandat ? ` (date du mandat ${dateFr(dateMandat)})` : ' (donnez --date-mandat=AAAA-MM-JJ, à confirmer par Arno)'} :`);
          dire(`  bien ${bien} marqué « rentré occupé » ; entrée en gestion ${avant.entree === null ? '—' : dateFr(avant.entree.corrigeeLe ?? avant.entree.effetLe)} → date du mandat (correction, l’origine est gardée) ;`);
          dire(`  ${bail === null ? 'aucun bail marqué (donnez --bail=<id> pour le bail du locataire en place)' : `bail ${bail} marqué « ${MENTION_EN_PLACE} »`} ;`);
          dire(`  ${ligneSuivi === null ? 'lignes de suivi : non touchées (donnez --ligne-suivi=<id> pour convertir la ligne « Bail » du locataire en place)'
            : `ligne de suivi ${ligneSuivi} : « Bail » → « Mandat de gestion seul » daté du mandat (hors « Baux signés » et CA ; nature et date d’origine gardées)`}.`);
        }
      }
    }
    const candidats = (await candidatsRentreOccupe(ecart)).filter((c) => estCandidatRentreOccupe({ entreeGestion: c.entreeGestion, bailEntree: c.bailEntree }, ecart));
    dire(`── CANDIDATS « rentré occupé » (bail commencé au moins ${ecart} jours avant l’entrée en gestion) : ${candidats.length} — LISTE SEULE, rien n’est modifié`);
    for (const c of candidats) dire(`  bien ${c.lotId} — ${c.titre} — ${c.proprietaire} — entrée en gestion ${dateFr(c.entreeGestion)} — bail ${c.bailId} du ${dateFr(c.bailEntree)} (${c.occupants})`);
  }
  const chemin = cheminRapport({ nomScript: 'rentre-occupe', demande: optionLigne(argv, 'rapport') });
  writeFileSync(chemin, `${lignes.join('\n')}\n`);
  console.log(`Rapport : ${chemin}`);
  return lignes;
}

const estPointEntree = fichierLance(import.meta.url);
if (estPointEntree) void main().catch((e) => { console.error('[location:rentre-occupe] échec', e); process.exitCode = 1; }).finally(() => closePool());
