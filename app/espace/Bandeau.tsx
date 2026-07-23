/**
 * Bandeau rouge de l'espace client — VIDE de tout ornement : ni sceau, ni marque, ni sous-ligne. Il ne porte QUE son titre,
 * en blanc sur le fond rouge. Titre en PROP (bandeau partagé : « Mon espace personnel » sur /espace, « Connexion » sur la
 * page de connexion). Fond/hauteur/marges cohérents avec le reste du segment (plus bas qu'avant, sans paraître écrasé).
 */
export function Bandeau({ titre }: { titre: string }) {
  return (
    <header className="bg-svv-red px-5 py-4">
      <p className="svv-verif-title text-lg font-extrabold tracking-wide text-white">{titre}</p>
    </header>
  );
}
