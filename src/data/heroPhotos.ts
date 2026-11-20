export interface HeroPhoto {
  src: string;
  alt: string;
  label: string;
  credit: string;
  license: string;
  href: string;
  position: string;
}

// Wikimedia Commons photos, shown in greyscale. One is picked at random per visit.
export const heroPhotos: HeroPhoto[] = [
  {
    src: "/hero/concert-apolo.jpg",
    alt: "A band singing with arms raised on stage at Sala Apolo, Barcelona",
    label: "Sala Apolo",
    credit: "IM027",
    license: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:El_Pony_Pisador_-_Concert_Sala_apolo_2022.jpg",
    position: "50% 30%",
  },
  {
    src: "/hero/concert-primavera.jpg",
    alt: "A band on the main stage at Primavera Sound with the crowd's hands in the air",
    label: "Primavera Sound",
    credit: "Joaquimalbalate",
    license: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:Ant%C3%B2nia_Font_al_Primavera_Sound_2022.jpg",
    position: "50% 55%",
  },
  {
    src: "/hero/concert-razzmatazz.jpg",
    alt: "A singer with an arm raised under stage lights at Razzmatazz, Barcelona",
    label: "Razzmatazz",
    credit: "David Urrea",
    license: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:Arcade_Fire_at_Razzmatazz_Barcelona.jpg",
    position: "50% 42%",
  },
  {
    src: "/hero/concert-drums.jpg",
    alt: "A drummer mid-hit in front of a wall of stage lights at Razzmatazz",
    label: "Razzmatazz",
    credit: "Alterna2",
    license: "CC BY 2.0",
    href: "https://commons.wikimedia.org/wiki/File:Skunk_Anansie_-_Razzmatazz_-_Febrero_2011_03.jpg",
    position: "50% 40%",
  },
  {
    src: "/hero/store-revolver.jpg",
    alt: "The corner shopfront of Discos Revolver record store in Barcelona",
    label: "Discos Revolver",
    credit: "Kippelboy",
    license: "CC0",
    href: "https://commons.wikimedia.org/wiki/File:Discos_Revolver_Barcelona.jpg",
    position: "50% 35%",
  },
  {
    src: "/hero/store-crates.jpg",
    alt: "A hand flipping through a crate of vinyl records",
    label: "Digging the crates",
    credit: "Edu Grande",
    license: "CC0",
    href: "https://commons.wikimedia.org/wiki/File:Browsing_record_store_shelves_(Unsplash).jpg",
    position: "50% 55%",
  },
  {
    src: "/hero/bar-convent.jpg",
    alt: "Inside Bar del Convent in Barcelona, with a long counter and chalkboard menus",
    label: "Bar del Convent",
    credit: "Joe Mabel",
    license: "CC BY-SA 4.0",
    href: "https://commons.wikimedia.org/wiki/File:Barcelona_-_Bar_del_Convent_01.jpg",
    position: "50% 55%",
  },
  {
    src: "/hero/bar-vermuteria.jpg",
    alt: "People at the tables outside Vermuteria La Nova Primavera at night",
    label: "Vermuteria La Nova Primavera",
    credit: "Enric",
    license: "CC BY 4.0",
    href: "https://commons.wikimedia.org/wiki/File:122_Vermuteria_La_Nova_Primavera,_c._Ferran_Puig_7_(el_Prat_de_Llobregat).jpg",
    position: "50% 40%",
  },
  {
    src: "/hero/bar-mendizabal.jpg",
    alt: "Bar Mendizabal in El Raval, Barcelona, with a graffiti-covered corner above",
    label: "Bar Mendizabal, El Raval",
    credit: "@markheybo",
    license: "CC BY 2.0",
    href: "https://commons.wikimedia.org/wiki/File:Bar_Mendizabal,_Barcelona_(24065086382).jpg",
    position: "50% 45%",
  },
];

export function pickHeroPhoto(): HeroPhoto {
  return heroPhotos[Math.floor(Math.random() * heroPhotos.length)];
}
