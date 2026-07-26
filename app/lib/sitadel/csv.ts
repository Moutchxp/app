/**
 * Parseur CSV EN FLUX (Sitadel : séparateur `;`, champs entre guillemets, `""` échappé, fins de ligne `\n`/`\r\n`).
 *
 * Automate à états caractère par caractère : robuste aux `;` et sauts de ligne À L'INTÉRIEUR d'un champ entre
 * guillemets, et aux guillemets doublés (un dossier réel contient p. ex. `LOT N LOTISSEMENT ""ROUTE DE JU`). N'accumule
 * JAMAIS le fichier entier : consomme une source `AsyncIterable<string>` (morceaux décodés) et émet les enregistrements
 * au fil de l'eau. PUR (aucun réseau, aucune base) → testable sur des chaînes fabriquées.
 */

/** Émet chaque enregistrement (tableau de champs) d'un flux de morceaux de texte CSV. */
export async function* enregistrementsBruts(
  source: AsyncIterable<string>,
  delimiteur = ';',
): AsyncGenerator<string[]> {
  let champ = '';
  let record: string[] = [];
  let enGuillemets = false;
  let champDebute = false; // un champ a commencé (pour distinguer "" vide d'une absence)

  for await (const morceau of source) {
    for (let i = 0; i < morceau.length; i++) {
      const c = morceau[i];
      if (enGuillemets) {
        if (c === '"') {
          // Guillemet dans une zone citée : soit `""` (échappe un "), soit fin de citation.
          if (i + 1 < morceau.length && morceau[i + 1] === '"') {
            champ += '"';
            i++;
          } else {
            enGuillemets = false;
          }
        } else {
          champ += c;
        }
        continue;
      }
      if (c === '"') {
        enGuillemets = true;
        champDebute = true;
      } else if (c === delimiteur) {
        record.push(champ);
        champ = '';
        champDebute = false;
      } else if (c === '\n') {
        record.push(champ);
        champ = '';
        // Ignore une ligne totalement vide (fin de fichier avec `\n` final).
        if (!(record.length === 1 && record[0] === '' && !champDebute)) yield record;
        record = [];
        champDebute = false;
      } else if (c === '\r') {
        // fin de ligne Windows : le `\n` suivant clôturera l'enregistrement.
      } else {
        champ += c;
        champDebute = true;
      }
    }
  }
  // Dernier enregistrement sans saut de ligne final.
  if (champDebute || champ !== '' || record.length > 0) {
    record.push(champ);
    if (!(record.length === 1 && record[0] === '')) yield record;
  }
}

/** Enveloppe : première ligne = en-tête, puis un objet `{ colonne: valeur }` par enregistrement. */
export async function* enregistrements(
  source: AsyncIterable<string>,
  delimiteur = ';',
): AsyncGenerator<Record<string, string>> {
  let entete: string[] | null = null;
  for await (const record of enregistrementsBruts(source, delimiteur)) {
    if (entete === null) {
      entete = record;
      continue;
    }
    const o: Record<string, string> = {};
    for (let i = 0; i < entete.length; i++) o[entete[i]] = record[i] ?? '';
    yield o;
  }
}
