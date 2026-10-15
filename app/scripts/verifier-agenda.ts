/**
 * CLI `gestion:agenda:verifier` — LOT TACHES-AGENDA : L'AGENDA EST-IL AUTORISÉ, ET QUELS ÉVÉNEMENTS L'APPLICATION Y A-T-ELLE ?
 *
 * 🔴 STRICTEMENT EN LECTURE, ET SEULEMENT SUR NOS ÉVÉNEMENTS. Elle demande un jeton « agenda » au nom d'une adresse,
 * puis liste les événements qui portent la MARQUE de l'application (filtre obligatoire, imposé par le verrou
 * `fetchAgendaGarde`). Les autres rendez-vous de l'agenda ne sont ni lus, ni listés, ni comptés. Rien n'est créé,
 * modifié ni supprimé.
 *
 * Usage :
 *   npm run gestion:agenda:verifier -- a.jorel@sansvisavis.com
 */
import '../lib/chargerEnv';
import { estPointEntree } from '../lib/scripts/pointEntree';
import { jetonAgendaPour, oublierJetonsAgenda, SCOPE_AGENDA } from '../lib/gestion/agendaDelegue';
import { BASE_AGENDA, fetchAgendaGarde, FILTRE_MARQUE, motifGoogle } from '../lib/gestion/agendaGoogle';

const P = '[gestion:agenda:verifier]';

async function main(): Promise<void> {
  const adresse = process.argv.find((a) => a.includes('@'));
  if (adresse === undefined) {
    console.log(`${P} Donne une adresse : npm run gestion:agenda:verifier -- prenom.nom@sansvisavis.com`);
    return;
  }
  console.log(`${P} Portée demandée, et la seule : ${SCOPE_AGENDA}`);
  oublierJetonsAgenda();
  const j = await jetonAgendaPour(adresse, { fetch });
  if (!j.ok) { console.error(`${P} ❌ ${j.motif}`); process.exitCode = 1; return; }
  console.log(`${P} ① Jeton « agenda » obtenu AU NOM DE ${adresse} ✅`);
  const url = `${BASE_AGENDA}${encodeURIComponent(adresse)}/events?${FILTRE_MARQUE}&showDeleted=false&maxResults=250`;
  const res = await fetchAgendaGarde(fetch)(url, { headers: { Authorization: `Bearer ${j.jeton}` } });
  const corps = (await res.json().catch(() => null)) as { items?: { id: string; summary?: string; start?: { date?: string; dateTime?: string }; extendedProperties?: { private?: Record<string, string> } }[] } | null;
  if (res.status !== 200) { console.error(`${P} ❌ ${motifGoogle(res.status, corps)}`); process.exitCode = 1; return; }
  const items = corps?.items ?? [];
  console.log(`${P} ② Interface Agenda joignable ✅ — événements de l'APPLICATION dans cet agenda : ${items.length}`);
  for (const e of items) {
    console.log(`${P}    · tâche ${e.extendedProperties?.private?.svavTacheId ?? '?'} — ${e.start?.date ?? e.start?.dateTime ?? '?'} — ${e.summary ?? ''} (${e.id})`);
  }
  console.log(`${P} ✅ Vérification terminée. Lecture de NOS événements seulement ; rien n'a été écrit.`);
}

const lanceDirect = estPointEntree(import.meta.url);
if (lanceDirect) main().catch((e) => { console.error(e); process.exitCode = 1; });
