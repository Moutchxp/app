/**
 * ══ 🔴 LECTURE DES DATES SANS FUSEAU — LOT PRÉPARATION-PORTABILITÉ (14/10/2026) ═══════════════════════════════════════
 *
 * Le pilote `pg` transforme une colonne `date` (OID 1082) et un `timestamp` sans fuseau (OID 1114, p. ex. le résultat
 * d'un `… AT TIME ZONE 'Europe/Paris'`) en `Date` JS à l'heure LOCALE DU PROCESSUS (node_modules/postgres-date/index.js,
 * `new Date(annee, mois, jour)`). Le même `2026-10-14` devenait donc 2026-10-13T22:00Z sur le Mac (Paris, été) et
 * 2026-10-14T00:00Z sur un serveur en UTC : deux résultats différents pour la même base.
 *
 * CE MODULE fixe l'interprétation à l'HEURE DE PARIS, quel que soit le fuseau de la machine. C'est EXACTEMENT ce que le
 * Mac faisait déjà (son fuseau local EST Paris) : aucun comportement ne change sur le Mac, il devient seulement le même
 * partout. (Le biais « veille » que cela produit sur certains affichages `toISOString().slice(0, 10)` d'une colonne
 * `date` est un défaut PRÉEXISTANT, consigné dans docs/RECON_PORTABILITE_SERVEUR.md — volontairement non corrigé ici.)
 *
 * Les valeurs hors du format simple (infinity, dates av. J.-C., chaîne inattendue) retombent sur l'analyseur d'origine.
 * Les `timestamptz` (OID 1184) portent leur décalage et ne dépendent d'aucun fuseau : non touchés.
 *
 * ⚠️ `types.setTypeParser` est GLOBAL au module `pg` : il vaut pour toutes les connexions du processus. Ce fichier est
 * importé par CHAQUE fabrique de pool (db/client, db/plafondAnalyse, analytics/pool, analytics/maintenance) pour qu'aucun
 * chemin d'entrée ne l'oublie ; l'installation est idempotente.
 */
import { types } from 'pg';
import { instantParis } from '../temps/paris';

const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;
const OID_DATE_TABLEAU = 1182;
const OID_TIMESTAMP_TABLEAU = 1115;

const RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?$/;

/** Analyse une date / un timestamp SANS fuseau comme une heure murale de Paris. `null` si le format n'est pas le format simple. PUR. */
export function analyserMuraleParis(s: string): Date | null {
  const m = RE.exec(s);
  if (m === null) return null;
  const ms = m[7] ? Math.floor(Number(m[7].padEnd(6, '0')) / 1000) : 0;
  return instantParis(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0), ms);
}

/** Tableau texte PostgreSQL à une dimension (`{2026-10-14,NULL,"2026-10-14 10:00:00"}`) → éléments, `null` pour NULL. PUR. */
export function elementsTableau(s: string): (string | null)[] | null {
  if (!s.startsWith('{') || !s.endsWith('}')) return null;
  const corps = s.slice(1, -1);
  if (corps === '') return [];
  if (corps.includes('{')) return null; // multidimensionnel : hors du cas simple
  return corps.split(',').map((e) => (e === 'NULL' ? null : e.replace(/^"(.*)"$/, '$1')));
}

let installe = false;

/** Installe les analyseurs (idempotent). */
export function installerTypesDate(): void {
  if (installe) return;
  installe = true;
  for (const oid of [OID_DATE, OID_TIMESTAMP]) {
    const origine = types.getTypeParser(oid, 'text') as (v: string) => unknown;
    types.setTypeParser(oid, (v: string) => analyserMuraleParis(v) ?? origine(v));
  }
  for (const oid of [OID_DATE_TABLEAU, OID_TIMESTAMP_TABLEAU]) {
    const origine = types.getTypeParser(oid, 'text') as (v: string) => unknown;
    types.setTypeParser(oid, (v: string) => {
      const elements = elementsTableau(v);
      if (elements === null) return origine(v);
      const dates = elements.map((e) => (e === null ? null : analyserMuraleParis(e)));
      return dates.some((d, i) => d === null && elements[i] !== null) ? origine(v) : dates;
    });
  }
}

installerTypesDate();
