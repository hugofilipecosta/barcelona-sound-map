export const venueRegistry = [
  venue("Jamboree", ["jamboree", "placa reial 17", "plaça reial 17"], "Gotic", 1, 41.3802, 2.1745),
  venue("Sala Apolo", ["sala apolo", "apolo", "nou de la rambla 113"], "Poble-sec", 2.2, 41.3752, 2.167),
  venue("Razzmatazz", ["razzmatazz", "almogavers 122"], "Poblenou", 3.1, 41.4001, 2.1932),
  venue("Paral.lel 62", ["paral·lel 62", "parallel 62", "paral.lel 62"], "Poble-sec", 1.4, 41.3757, 2.1677),
  venue("Harlem Jazz Club", ["harlem jazz", "comtessa de sobradiel"], "Gotic", 1.1, 41.3809, 2.177),
  venue("Palau de la Musica", ["palau de la musica", "palau de la música"], "Gotic", 0.5, 41.3875, 2.1753),
  venue("L'Auditori", ["auditori", "lepant 150"], "Eixample", 1.9, 41.4038, 2.1885),
  venue("Sidecar", ["sidecar", "placa reial 7", "plaça reial 7"], "Gotic", 1, 41.3802, 2.1746),
  venue("Moog", ["moog"], "El Raval", 1.1, 41.3763, 2.1745),
  venue("Laut", ["laut"], "Poble-sec", 1.8, 41.3735, 2.162),
  venue("Upload", ["upload"], "Poble-sec", 2.4, 41.373, 2.16),
  venue("Heliogabal", ["heliogabal", "ramon y cajal 80"], "Gracia", 2.6, 41.4058, 2.158),
  venue("La Nau", ["la nau"], "Poblenou", 3.4, 41.401, 2.198),
  venue("La Paloma", ["la paloma"], "El Raval", 0.8, 41.3843, 2.1668),
  venue("Tarantos", ["tarantos", "placa reial 17", "plaça reial 17"], "Gotic", 1, 41.3802, 2.1745),
  venue("MEAM", ["meam", "barra de ferro 5"], "Gotic", 1, 41.3846, 2.1808),
  venue("Poble Espanyol", ["poble espanyol", "francesc ferrer i guardia"], "All Barcelona", 2.4, 41.3686, 2.1499),
];

export function matchVenue(...values) {
  const haystack = values
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  return venueRegistry.find((venueItem) =>
    venueItem.aliases.some((alias) => haystack.includes(alias)),
  );
}

function venue(name, aliases, neighborhood, distanceKm, lat, lon) {
  return {
    name,
    aliases: aliases.map((alias) =>
      alias
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase(),
    ),
    neighborhood,
    distanceKm,
    lat,
    lon,
  };
}
