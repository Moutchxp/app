import '../lib/chargerEnv';
import { writeFileSync } from 'node:fs';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { cheminRapport, optionLigne } from '../lib/ops/rapportScript';
import type { ClotureOuverte, PasseReprise } from '../lib/gestion/repriseCloturesRepo';

/**
 * ══ 🔴🔴 REPRISE — « UN ÉVÉNEMENT À L'ÉTAPE “CLÔTURE” NE DOIT JAMAIS RESTER DANS LE BLOC “ÉVÉNEMENTS” » (Arno, 23/10/2026) ══
 *
 * Clôt proprement les événements restés à l'étape « Clôture » sans période fermée (la règle : `repriseCloturesRepo.ts`).
 *
 *   npm run gestion:reparer-clotures                       → À BLANC (par défaut) : rien n'est écrit, le rapport dit ce qui le serait
 *   npm run gestion:reparer-clotures -- --reel             → écrit, en UNE transaction (tout ou rien)
 *   … -- --avec-a-confirmer                                → traite aussi les Clôtures Monga « à confirmer » (sinon listées seulement)
 *   … -- --rapport=<fichier ou dossier>                    → où écrire le rapport (défaut : .captures/reparer-clotures-ouvertes/)
 *
 * Rejouable : un événement réparé est clos et ne ressort plus.
 */
const P = '[gestion:reparer-clotures]';
const NOM_SCRIPT = 'reparer-clotures-ouvertes';
const dateFr = (s: string): string => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}${s.length > 10 ? ` à ${s.slice(11, 16)}` : ''}`;
const MOT_ORIGINE: Record<ClotureOuverte['origine'], string> = {
  passage: 'passage à « Clôture »', confirmation: 'confirmation de la Clôture', modification: 'dernière modification',
};

export function texteRapportReprise(p: PasseReprise, o: { base: string }): string {
  const traitees = p.trouvees.filter((c) => c.certitude !== 'a_confirmer' || p.avecAConfirmer);
  const enAttente = p.trouvees.filter((c) => c.certitude === 'a_confirmer' && !p.avecAConfirmer);
  const ligne = (c: ClotureOuverte): string => {
    const issue = !p.reel ? 'serait clos' : p.reparees.includes(c.evenementId) ? 'CLOS' : 'non traité';
    return [
      `  · ${c.reference ?? `événement ${c.evenementId}`} — ${c.objet ?? '(sans intitulé)'}`,
      `      bien : ${c.bien ?? '(aucun bien déclaré)'}`,
      `      date retenue : ${dateFr(c.dateRetenue)} (${MOT_ORIGINE[c.origine]}) → clôture au ${dateFr(c.dateFinale)}`,
      ...c.ouverturesRamenees.map((o) => `      ouverture datée du ${dateFr(o)} (à la clôture ou après) → ramenée une seconde avant la clôture ; date d’origine gardée au journal`),
      `      auteur : ${c.auteur ?? '(inconnu)'} · carte n° ${c.carteId} (${c.source === 'monga' ? 'Monga' : 'manuelle'}${c.certitude === 'a_confirmer' ? ', à confirmer' : ''}) datée aujourd’hui du ${dateFr(c.dateActuelle)} — ${issue}`,
    ].join('\n');
  };
  return [
    `REPRISE DES CLÔTURES RESTÉES OUVERTES — ${p.reel ? 'RÉEL' : 'À BLANC (aucune écriture)'}`,
    `base : ${o.base}`,
    '',
    `événements à l’étape « Clôture » dont la période n’est pas fermée : ${p.trouvees.length}${p.reel ? ` · clos par cette passe : ${p.reparees.length}` : ''}`,
    '',
    'À CLORE (la carte Clôture est redatée ; aucune carte ajoutée ni supprimée) :',
    ...(traitees.length === 0 ? ['  (aucun)'] : traitees.map(ligne)),
    '',
    'CLÔTURES MONGA « À CONFIRMER » (listées seulement ; --avec-a-confirmer pour les confirmer et clore) :',
    ...(enAttente.length === 0 ? ['  (aucune)'] : enAttente.map(ligne)),
    '',
  ].join('\n');
}

async function principal(): Promise<void> {
  const argv = process.argv.slice(2);
  const reel = argv.includes('--reel');
  const avecAConfirmer = argv.includes('--avec-a-confirmer');
  const { passerReprise } = await import('../lib/gestion/repriseCloturesRepo');
  const { closePool } = await import('../lib/db/client');
  const base = (process.env.DATABASE_URL ?? '').split('/').pop()?.split('?')[0] ?? '?';
  try {
    const p = await passerReprise({ reel, avecAConfirmer });
    const texte = texteRapportReprise(p, { base });
    const chemin = cheminRapport({ nomScript: NOM_SCRIPT, demande: optionLigne(argv, 'rapport') });
    writeFileSync(chemin, texte, 'utf8');
    console.log(texte);
    console.log(`${P} rapport : ${chemin}`);
  } finally {
    await closePool();
  }
}

if (estPointEntree(import.meta.url)) {
  principal().catch((e: unknown) => { console.error(P, e); process.exit(1); });
}
