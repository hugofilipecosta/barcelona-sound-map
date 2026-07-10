export const venueRegistry = [
  venue("Jamboree", ["jamboree", "placa reial 17", "plaça reial 17"], "Gotic", 1),
  venue("Sala Apolo", ["sala apolo", "apolo", "nou de la rambla 113"], "Poble-sec", 2.2),
  venue("Razzmatazz", ["razzmatazz", "almogavers 122"], "Poblenou", 3.1),
  venue("Paral.lel 62", ["paral·lel 62", "parallel 62", "paral.lel 62"], "Poble-sec", 1.4),
  venue("Harlem Jazz Club", ["harlem jazz", "comtessa de sobradiel"], "Gotic", 1.1),
  venue("Palau de la Musica", ["palau de la musica", "palau de la música"], "Gotic", 0.5),
  venue("L'Auditori", ["auditori", "lepant 150"], "Eixample", 1.9),
  venue("Sidecar", ["sidecar", "placa reial 7", "plaça reial 7"], "Gotic", 1),
  venue("Moog", ["moog"], "El Raval", 1.1),
  venue("Laut", ["laut"], "Poble-sec", 1.8),
  venue("Upload", ["upload"], "Poble-sec", 2.4),
  venue("Heliogabal", ["heliogabal", "ramon y cajal 80"], "Gracia", 2.6),
  venue("La Nau", ["la nau"], "Poblenou", 3.4),
  venue("La Paloma", ["la paloma"], "El Raval", 0.8),
  venue("Tarantos", ["tarantos", "placa reial 17", "plaça reial 17"], "Gotic", 1),
  venue("MEAM", ["meam", "barra de ferro 5"], "Gotic", 1),
  venue("Poble Espanyol", ["poble espanyol", "francesc ferrer i guardia"], "All Barcelona", 2.4),
];

export function matchVenue(...values) {
  const haystack = values
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return venueRegistry.find((venueItem) =>
    venueItem.aliases.some((alias) => haystack.includes(alias)),
  );
}

function venue(name, aliases, neighborhood, distanceKm) {
  return {
    name,
    aliases: aliases.map((alias) =>
      alias
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    ),
    neighborhood,
    distanceKm,
  };
}
