/**
 * 🔴 Arno (05/11/2026) — « MAIL ENVOYÉ PAR … » dans les mails de l'écran Location préavis / sortie (accusé aux locataires, information
 * aux partenaires, récapitulatif de sortie) : après la formule de politesse, avant la signature Gmail. Prénom, NOM et adresse sont ceux
 * du COMPTE CONNECTÉ qui valide (session, lus côté serveur) — jamais une saisie. Ce qui manque sur le compte est simplement omis ;
 * sans prénom ni nom : « Mail envoyé par adresse » ; sans rien d'utilisable : pas de mention. MODULE PUR.
 */
export interface IdentiteEnvoi { prenom?: string | null; nomFamille?: string | null; email: string | null }

export function mentionEnvoyePar(i: IdentiteEnvoi): string | null {
  const prenom = (i.prenom ?? '').trim().replace(/\s+/g, ' ');
  const nom = (i.nomFamille ?? '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('fr-FR');
  const qui = [prenom, nom].filter((x) => x !== '').join(' ');
  const email = (i.email ?? '').trim();
  if (qui === '' && email === '') return null;
  if (qui === '') return `Mail envoyé par ${email}`;
  return email === '' ? `Mail envoyé par ${qui}` : `Mail envoyé par ${qui} (${email})`;
}
