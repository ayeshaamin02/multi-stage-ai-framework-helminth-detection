export const HELMINTH_SPECIES = [
  { id: 0, name: "Ascaris lumbricoides", note: "Giant roundworm, most common soil transmitted helminth worldwide" },
  { id: 1, name: "Capillaria philippinensis", note: "Intestinal capillariasis, causes chronic diarrhea and malabsorption" },
  { id: 2, name: "Enterobius vermicularis", note: "Pinworm, the most common helminth in temperate climates" },
  { id: 3, name: "Fasciolopsis buski", note: "Giant intestinal fluke, largest fluke infecting humans" },
  { id: 4, name: "Hookworm egg", note: "Ancylostoma / Necator, leading cause of iron deficiency anemia" },
  { id: 5, name: "Hymenolepis diminuta", note: "Rat tapeworm, uncommon in humans, usually asymptomatic" },
  { id: 6, name: "Hymenolepis nana", note: "Dwarf tapeworm, most common cestode in humans" },
  { id: 7, name: "Opisthorchis viverrine", note: "Liver fluke, linked to cholangiocarcinoma risk" },
  { id: 8, name: "Paragonimus spp", note: "Lung fluke, causes paragonimiasis, mimics tuberculosis" },
  { id: 9, name: "Taenia spp. egg", note: "Tapeworm, beef (T. saginata) or pork (T. solium) tapeworm" },
  { id: 10, name: "Trichuris trichiura", note: "Whipworm, infects the large intestine, common in tropics" },
] as const;

export type HelminthSpecies = (typeof HELMINTH_SPECIES)[number];
