/* The cards the film shows, as the game draws them: Wikipedia's article, its picture, a rarity.
   Pictures: Wikimedia Commons thumbnails, or the game's own for its cards. */
import { Rarity } from '../brand/tokens';

export type RealCardData = { title: string; category: string; rarity: Rarity; image: string; atk: number; def: number; views: number; price: number };
const commons = (path: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/${path}`;
const site = (path: string) => `https://www.wiki-masters.com/cards/${path}`;

export const REAL: Record<string, RealCardData> = {
  flamingo: { title: 'Flamant rose', category: "espèce d'oiseaux du genre Phoenicopterus", rarity: 'C', image: commons('a/ae/Flamant_Rose_Villeneuve-l%C3%A8s-Maguelone.jpg/500px-Flamant_Rose_Villeneuve-l%C3%A8s-Maguelone.jpg'), atk: 1940, def: 2310, views: 912, price: 18 },
  fuji: { title: 'Mont Fuji', category: 'volcan au sud-ouest de Tokyo, au Japon', rarity: 'PC', image: commons('c/cd/Fuji_Kawaguchi_357.JPG/500px-Fuji_Kawaguchi_357.JPG'), atk: 3254, def: 4352, views: 3410, price: 64 },
  saturn: { title: 'Saturne (planète)', category: 'sixième planète du Système solaire', rarity: 'R', image: commons('c/c7/Saturn_during_Equinox.jpg/500px-Saturn_during_Equinox.jpg'), atk: 5090, def: 7780, views: 5820, price: 120 },
  crab: { title: 'Nébuleuse du Crabe', category: 'rémanent de supernova', rarity: 'SR', image: commons('0/00/Crab_Nebula.jpg/500px-Crab_Nebula.jpg'), atk: 6222, def: 5935, views: 3250, price: 210 },
  wall: { title: 'Grande Muraille', category: 'fortifications de la frontière nord de la Chine', rarity: 'L', image: site('grande-muraille.jpg'), atk: 8970, def: 6120, views: 142000, price: 900 },
  machu: { title: 'Machu Picchu', category: 'ancienne cité inca du XVe siècle, au Pérou', rarity: 'UR', image: commons('1/13/Before_Machu_Picchu.jpg/500px-Before_Machu_Picchu.jpg'), atk: 7470, def: 8120, views: 21400, price: 260 },
  lion: { title: 'Lion', category: 'espèce du genre Panthera', rarity: 'R', image: commons('6/6f/011_The_lion_king_Tryggve_in_the_Serengeti_National_Park_Photo_by_Giles_Laurent.jpg/500px-011_The_lion_king_Tryggve_in_the_Serengeti_National_Park_Photo_by_Giles_Laurent.jpg'), atk: 5310, def: 4480, views: 8820, price: 95 },
  colosseum: { title: 'Colisée', category: 'monument de la ville de Rome', rarity: 'SR', image: commons('d/de/Colosseo_2020.jpg/500px-Colosseo_2020.jpg'), atk: 6480, def: 7010, views: 6120, price: 180 },
  panda: { title: 'Panda géant', category: 'espèce de mammifères', rarity: 'PC', image: commons('5/56/Panda_at_the_Chengdu_Research_Base_of_Giant_Panda_Breeding%2C_Chengdu%2C_China_-_panoramio.jpg/500px-Panda_at_the_Chengdu_Research_Base_of_Giant_Panda_Breeding%2C_Chengdu%2C_China_-_panoramio.jpg'), atk: 2870, def: 3390, views: 4410, price: 40 },
  eiffel: { title: 'Tour Eiffel', category: 'tour de fer puddlé de 330 mètres, à Paris', rarity: 'UR', image: commons('a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/500px-Tour_Eiffel_Wikimedia_Commons.jpg'), atk: 7920, def: 7340, views: 38900, price: 340 },
  whale: { title: 'Baleine bleue', category: 'espèce de cétacés', rarity: 'R', image: commons('1/1c/Anim1754_-_Flickr_-_NOAA_Photo_Library.jpg/500px-Anim1754_-_Flickr_-_NOAA_Photo_Library.jpg'), atk: 4410, def: 6630, views: 2910, price: 88 },
  cat: { title: 'Chat', category: 'petit mammifère carnivore domestique', rarity: 'C', image: commons('2/2d/Exemple_de_races_de_chats_pr%C3%A9sentes_sur_Terre.jpg/500px-Exemple_de_races_de_chats_pr%C3%A9sentes_sur_Terre.jpg'), atk: 2210, def: 3120, views: 11240, price: 30 },
  canyon: { title: 'Grand Canyon', category: "canyon de l'Ouest des États-Unis", rarity: 'SR', image: commons('2/25/Grand_Canyon_North.jpg/500px-Grand_Canyon_North.jpg'), atk: 6010, def: 6580, views: 4720, price: 190 },
  bee: { title: 'Abeille', category: 'insecte pollinisateur', rarity: 'C', image: site('abeille.jpg'), atk: 2210, def: 3120, views: 8290, price: 22 },
  ada: { title: 'Ada Lovelace', category: 'mathématicienne britannique', rarity: 'R', image: site('ada-lovelace.png'), atk: 5090, def: 7780, views: 5820, price: 130 },
  // What the discard is for: cards nobody looks at.
  paperclip: { title: 'Trombone (papeterie)', category: 'petit objet qui maintient une liasse de feuilles', rarity: 'C', image: commons('d/d6/Bueroklammern.jpg/500px-Bueroklammern.jpg'), atk: 1120, def: 1480, views: 14, price: 2 },
  peg: { title: 'Pince à linge', category: 'objet', rarity: 'C', image: commons('f/fc/Klammern_%2838205708%29.jpeg/500px-Klammern_%2838205708%29.jpeg'), atk: 980, def: 1650, views: 9, price: 2 },
  cone: { title: 'Cône de signalisation', category: 'objet conique, souvent orange et blanc', rarity: 'C', image: commons('3/3d/Cones.jpg/500px-Cones.jpg'), atk: 1310, def: 990, views: 21, price: 3 },
  roundabout: { title: 'Carrefour giratoire', category: "carrefour à îlot central contourné par les usagers", rarity: 'PC', image: commons('d/d4/LUMC-rotonde.JPG/500px-LUMC-rotonde.JPG'), atk: 1870, def: 2140, views: 27, price: 4 },
  brick: { title: 'Brique (matériau)', category: 'matériau de construction', rarity: 'C', image: commons('4/4f/Colors_and_texture_of_a_brick_ground_artlibre_jnl.png/500px-Colors_and_texture_of_a_brick_ground_artlibre_jnl.png'), atk: 1540, def: 2010, views: 18, price: 2 },
  can: { title: 'Boîte de conserve', category: 'contenant métallique hermétique', rarity: 'C', image: commons('9/90/Tin_cans_%28Port_Lockroy%2C_Antarctica%29.jpg/500px-Tin_cans_%28Port_Lockroy%2C_Antarctica%29.jpg'), atk: 1210, def: 1330, views: 11, price: 2 },
  pylon: { title: 'Pylône électrique', category: "support d'une ligne électrique aérienne", rarity: 'PC', image: commons('1/1d/Pyl%C3%B4ne_%C3%A9lectrique_2.jpg/500px-Pyl%C3%B4ne_%C3%A9lectrique_2.jpg'), atk: 2030, def: 1760, views: 24, price: 4 },
};
