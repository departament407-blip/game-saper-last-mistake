export type BiomeId = "forest" | "desert" | "sunflower" | "factory" | "sea";

export interface Biome {
  id: BiomeId;
  name: string;
  cssClass: string;
  backgroundAsset: string;
  destroyedBackgroundAsset: string;
}

export const BIOMES: Biome[] = [
  {
    id: "forest",
    name: "Лес",
    cssClass: "biome-forest",
    backgroundAsset: "/assets/biome_backgrounds/forest.png",
    destroyedBackgroundAsset: "/assets/biome_backgrounds/fallen/forest.png"
  },
  {
    id: "desert",
    name: "Пустыня",
    cssClass: "biome-desert",
    backgroundAsset: "/assets/biome_backgrounds/desert.png",
    destroyedBackgroundAsset: "/assets/biome_backgrounds/fallen/desert.png"
  },
  {
    id: "sunflower",
    name: "Подсолнуховое поле",
    cssClass: "biome-sunflower",
    backgroundAsset: "/assets/biome_backgrounds/sunflower.png",
    destroyedBackgroundAsset: "/assets/biome_backgrounds/fallen/sunflower.png"
  },
  {
    id: "factory",
    name: "Заброшенный завод",
    cssClass: "biome-factory",
    backgroundAsset: "/assets/biome_backgrounds/factory.png",
    destroyedBackgroundAsset: "/assets/biome_backgrounds/fallen/factory.png"
  },
  {
    id: "sea",
    name: "Море",
    cssClass: "biome-sea",
    backgroundAsset: "/assets/biome_backgrounds/sea.png",
    destroyedBackgroundAsset: "/assets/biome_backgrounds/fallen/sea.png"
  }
];

export function getBiome(id: string): Biome {
  return BIOMES.find((biome) => biome.id === id) ?? BIOMES[0];
}
