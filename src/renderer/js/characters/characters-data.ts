export type SSBUCharacters = typeof SSBU_CHARACTERS;
export type SSBUCharacterImages = typeof CHARACTER_IMAGES;
export type SSBUFolderAliases = typeof FOLDER_ALIASES;
export type ResolveSSBUFolderName = (folderName: string) => string;

const SSBU_CHARACTERS = {
  mario: { name: 'Mario', number: '01', series: 'Mario' },
  donkey: { name: 'Donkey Kong', number: '02', series: 'Donkey Kong' },
  link: { name: 'Link', number: '03', series: 'Zelda' },
  samus: { name: 'Samus', number: '04', series: 'Metroid' },
  samusd: { name: 'Dark Samus', number: '04ε', series: 'Metroid' },
  yoshi: { name: 'Yoshi', number: '05', series: 'Yoshi' },
  kirby: { name: 'Kirby', number: '06', series: 'Kirby' },
  fox: { name: 'Fox', number: '07', series: 'Star Fox' },
  pikachu: { name: 'Pikachu', number: '08', series: 'Pokémon' },

  luigi: { name: 'Luigi', number: '09', series: 'Mario' },
  ness: { name: 'Ness', number: '10', series: 'EarthBound' },
  captain: { name: 'Captain Falcon', number: '11', series: 'F-Zero' },
  purin: { name: 'Jigglypuff', number: '12', series: 'Pokémon' },
  peach: { name: 'Peach', number: '13', series: 'Mario' },
  daisy: { name: 'Daisy', number: '13ε', series: 'Mario' },
  koopa: { name: 'Bowser', number: '14', series: 'Mario' },
  ice_climber: { name: 'Ice Climbers', number: '15', series: 'Ice Climber' },
  sheik: { name: 'Sheik', number: '16', series: 'Zelda' },
  zelda: { name: 'Zelda', number: '17', series: 'Zelda' },
  mariod: { name: 'Dr. Mario', number: '18', series: 'Mario' },
  pichu: { name: 'Pichu', number: '19', series: 'Pokémon' },
  falco: { name: 'Falco', number: '20', series: 'Star Fox' },
  marth: { name: 'Marth', number: '21', series: 'Fire Emblem' },
  lucina: { name: 'Lucina', number: '21ε', series: 'Fire Emblem' },
  younglink: { name: 'Young Link', number: '22', series: 'Zelda' },
  ganon: { name: 'Ganondorf', number: '23', series: 'Zelda' },
  mewtwo: { name: 'Mewtwo', number: '24', series: 'Pokémon' },
  roy: { name: 'Roy', number: '25', series: 'Fire Emblem' },
  chrom: { name: 'Chrom', number: '25ε', series: 'Fire Emblem' },
  gamewatch: {
    name: 'Mr. Game & Watch',
    number: '26',
    series: 'Game & Watch',
  },

  metaknight: { name: 'Meta Knight', number: '27', series: 'Kirby' },
  pit: { name: 'Pit', number: '28', series: 'Kid Icarus' },
  pitb: { name: 'Dark Pit', number: '28ε', series: 'Kid Icarus' },
  szerosuit: { name: 'Zero Suit Samus', number: '29', series: 'Metroid' },
  wario: { name: 'Wario', number: '30', series: 'Wario' },
  snake: { name: 'Snake', number: '31', series: 'Metal Gear' },
  ike: { name: 'Ike', number: '32', series: 'Fire Emblem' },
  pzenigame: { name: 'Squirtle', number: '33-1', series: 'Pokémon' },
  pfushigisou: { name: 'Ivysaur', number: '33-2', series: 'Pokémon' },
  plizardon: { name: 'Charizard', number: '33-3', series: 'Pokémon' },
  ptrainer: { name: 'Pokémon Trainer', number: '33', series: 'Pokémon' },
  diddy: { name: 'Diddy Kong', number: '36', series: 'Donkey Kong' },
  lucas: { name: 'Lucas', number: '37', series: 'EarthBound' },
  sonic: { name: 'Sonic', number: '38', series: 'Sonic' },
  dedede: { name: 'King Dedede', number: '39', series: 'Kirby' },
  pikmin: { name: 'Olimar', number: '40', series: 'Pikmin' },
  lucario: { name: 'Lucario', number: '41', series: 'Pokémon' },
  robot: { name: 'R.O.B.', number: '42', series: 'R.O.B.' },
  toonlink: { name: 'Toon Link', number: '43', series: 'Zelda' },
  wolf: { name: 'Wolf', number: '44', series: 'Star Fox' },

  murabito: { name: 'Villager', number: '45', series: 'Animal Crossing' },
  rockman: { name: 'Mega Man', number: '46', series: 'Mega Man' },
  wiifit: { name: 'Wii Fit Trainer', number: '47', series: 'Wii Fit' },
  rosetta: { name: 'Rosalina & Luma', number: '48', series: 'Mario' },
  littlemac: { name: 'Little Mac', number: '49', series: 'Punch-Out!!' },
  gekkouga: { name: 'Greninja', number: '50', series: 'Pokémon' },
  miifighter: { name: 'Mii Brawler', number: '51', series: 'Mii' },
  miiswordsman: { name: 'Mii Swordfighter', number: '52', series: 'Mii' },
  miigunner: { name: 'Mii Gunner', number: '53', series: 'Mii' },
  palutena: { name: 'Palutena', number: '54', series: 'Kid Icarus' },
  pacman: { name: 'Pac-Man', number: '55', series: 'Pac-Man' },
  reflet: { name: 'Robin', number: '56', series: 'Fire Emblem' },
  shulk: { name: 'Shulk', number: '57', series: 'Xenoblade' },
  koopajr: { name: 'Bowser Jr.', number: '58', series: 'Mario' },
  duckhunt: { name: 'Duck Hunt', number: '59', series: 'Duck Hunt' },
  ryu: { name: 'Ryu', number: '60', series: 'Street Fighter' },
  ken: { name: 'Ken', number: '60ε', series: 'Street Fighter' },
  cloud: { name: 'Cloud', number: '61', series: 'Final Fantasy' },
  kamui: { name: 'Corrin', number: '62', series: 'Fire Emblem' },
  bayonetta: { name: 'Bayonetta', number: '63', series: 'Bayonetta' },

  inkling: { name: 'Inkling', number: '64', series: 'Splatoon' },
  ridley: { name: 'Ridley', number: '65', series: 'Metroid' },
  simon: { name: 'Simon', number: '66', series: 'Castlevania' },
  richter: { name: 'Richter', number: '66ε', series: 'Castlevania' },
  krool: { name: 'King K. Rool', number: '67', series: 'Donkey Kong' },
  shizue: { name: 'Isabelle', number: '68', series: 'Animal Crossing' },
  gaogaen: { name: 'Incineroar', number: '69', series: 'Pokémon' },
  packun: { name: 'Piranha Plant', number: '70', series: 'Mario' },
  jack: { name: 'Joker', number: '71', series: 'Persona' },
  brave: { name: 'Hero', number: '72', series: 'Dragon Quest' },
  buddy: { name: 'Banjo & Kazooie', number: '73', series: 'Banjo-Kazooie' },
  dolly: { name: 'Terry', number: '74', series: 'Fatal Fury' },
  master: { name: 'Byleth', number: '75', series: 'Fire Emblem' },
  tantan: { name: 'Min Min', number: '76', series: 'ARMS' },
  pickel: { name: 'Steve', number: '77', series: 'Minecraft' },
  edge: { name: 'Sephiroth', number: '78', series: 'Final Fantasy' },
  eflame: { name: 'Pyra', number: '79', series: 'Xenoblade' },
  elight: { name: 'Mythra', number: '79ε', series: 'Xenoblade' },
  demon: { name: 'Kazuya', number: '80', series: 'Tekken' },
  trail: { name: 'Sora', number: '81', series: 'Kingdom Hearts' },
};

const CHARACTER_IMAGES = {
  mario: 'https://www.smashbros.com/assets_v2/img/fighter/mario/main.png',
  donkey:
    'https://www.smashbros.com/assets_v2/img/fighter/donkey_kong/main.png',
  link: 'https://www.smashbros.com/assets_v2/img/fighter/link/main.png',
  samus: 'https://www.smashbros.com/assets_v2/img/fighter/samus/main.png',
  samusd: 'https://www.smashbros.com/assets_v2/img/fighter/dark_samus/main.png',
  yoshi: 'https://www.smashbros.com/assets_v2/img/fighter/yoshi/main.png',
  kirby: 'https://www.smashbros.com/assets_v2/img/fighter/kirby/main.png',
  fox: 'https://www.smashbros.com/assets_v2/img/fighter/fox/main.png',
  pikachu: 'https://www.smashbros.com/assets_v2/img/fighter/pikachu/main.png',

  luigi: 'https://www.smashbros.com/assets_v2/img/fighter/luigi/main.png',
  ness: 'https://www.smashbros.com/assets_v2/img/fighter/ness/main.png',
  captain:
    'https://www.smashbros.com/assets_v2/img/fighter/captain_falcon/main.png',
  purin: 'https://www.smashbros.com/assets_v2/img/fighter/jigglypuff/main.png',
  peach: 'https://www.smashbros.com/assets_v2/img/fighter/peach/main.png',
  daisy: 'https://www.smashbros.com/assets_v2/img/fighter/daisy/main.png',
  koopa: 'https://www.smashbros.com/assets_v2/img/fighter/bowser/main.png',
  ice_climber:
    'https://www.smashbros.com/assets_v2/img/fighter/ice_climbers/main.png',
  sheik: 'https://www.smashbros.com/assets_v2/img/fighter/sheik/main.png',
  zelda: 'https://www.smashbros.com/assets_v2/img/fighter/zelda/main.png',
  mariod: 'https://www.smashbros.com/assets_v2/img/fighter/dr_mario/main.png',
  pichu: 'https://www.smashbros.com/assets_v2/img/fighter/pichu/main.png',
  falco: 'https://www.smashbros.com/assets_v2/img/fighter/falco/main.png',
  marth: 'https://www.smashbros.com/assets_v2/img/fighter/marth/main.png',
  lucina: 'https://www.smashbros.com/assets_v2/img/fighter/lucina/main.png',
  younglink:
    'https://www.smashbros.com/assets_v2/img/fighter/young_link/main.png',
  ganon: 'https://www.smashbros.com/assets_v2/img/fighter/ganondorf/main.png',
  mewtwo: 'https://www.smashbros.com/assets_v2/img/fighter/mewtwo/main.png',
  roy: 'https://www.smashbros.com/assets_v2/img/fighter/roy/main.png',
  chrom: 'https://www.smashbros.com/assets_v2/img/fighter/chrom/main.png',
  gamewatch:
    'https://www.smashbros.com/assets_v2/img/fighter/mr_game_and_watch/main.png',

  metaknight:
    'https://www.smashbros.com/assets_v2/img/fighter/meta_knight/main.png',
  pit: 'https://www.smashbros.com/assets_v2/img/fighter/pit/main.png',
  pitb: 'https://www.smashbros.com/assets_v2/img/fighter/dark_pit/main.png',
  szerosuit:
    'https://www.smashbros.com/assets_v2/img/fighter/zero_suit_samus/main.png',
  wario: 'https://www.smashbros.com/assets_v2/img/fighter/wario/main.png',
  snake: 'https://www.smashbros.com/assets_v2/img/fighter/snake/main.png',
  ike: 'https://www.smashbros.com/assets_v2/img/fighter/ike/main.png',
  pzenigame:
    'https://www.smashbros.com/assets_v2/img/fighter/squirtle/main.png',
  pfushigisou:
    'https://www.smashbros.com/assets_v2/img/fighter/ivysaur/main.png',
  plizardon:
    'https://www.smashbros.com/assets_v2/img/fighter/charizard/main.png',
  ptrainer:
    'https://www.smashbros.com/assets_v2/img/fighter/pokemon_trainer/main.png',
  diddy: 'https://www.smashbros.com/assets_v2/img/fighter/diddy_kong/main.png',
  lucas: 'https://www.smashbros.com/assets_v2/img/fighter/lucas/main.png',
  sonic: 'https://www.smashbros.com/assets_v2/img/fighter/sonic/main.png',
  dedede:
    'https://www.smashbros.com/assets_v2/img/fighter/king_dedede/main.png',
  pikmin: 'https://www.smashbros.com/assets_v2/img/fighter/olimar/main.png',
  lucario: 'https://www.smashbros.com/assets_v2/img/fighter/lucario/main.png',
  robot: 'https://www.smashbros.com/assets_v2/img/fighter/robot/main.png',
  toonlink:
    'https://www.smashbros.com/assets_v2/img/fighter/toon_link/main.png',
  wolf: 'https://www.smashbros.com/assets_v2/img/fighter/wolf/main.png',

  murabito: 'https://www.smashbros.com/assets_v2/img/fighter/villager/main.png',
  rockman: 'https://www.smashbros.com/assets_v2/img/fighter/mega_man/main.png',
  wiifit:
    'https://www.smashbros.com/assets_v2/img/fighter/wii_fit_trainer/main.png',
  rosetta:
    'https://www.smashbros.com/assets_v2/img/fighter/rosalina_and_luma/main.png',
  littlemac:
    'https://www.smashbros.com/assets_v2/img/fighter/little_mac/main.png',
  gekkouga: 'https://www.smashbros.com/assets_v2/img/fighter/greninja/main.png',
  miifighter:
    'https://www.smashbros.com/assets_v2/img/fighter/mii_brawler/main.png',
  miiswordsman:
    'https://www.smashbros.com/assets_v2/img/fighter/mii_swordfighter/main.png',
  miigunner:
    'https://www.smashbros.com/assets_v2/img/fighter/mii_gunner/main.png',
  palutena: 'https://www.smashbros.com/assets_v2/img/fighter/palutena/main.png',
  pacman: 'https://www.smashbros.com/assets_v2/img/fighter/pac_man/main.png',
  reflet: 'https://www.smashbros.com/assets_v2/img/fighter/robin/main.png',
  shulk: 'https://www.smashbros.com/assets_v2/img/fighter/shulk/main.png',
  koopajr: 'https://www.smashbros.com/assets_v2/img/fighter/bowser_jr/main.png',
  duckhunt:
    'https://www.smashbros.com/assets_v2/img/fighter/duck_hunt/main.png',
  ryu: 'https://www.smashbros.com/assets_v2/img/fighter/ryu/main.png',
  ken: 'https://www.smashbros.com/assets_v2/img/fighter/ken/main.png',
  cloud: 'https://www.smashbros.com/assets_v2/img/fighter/cloud/main.png',
  kamui: 'https://www.smashbros.com/assets_v2/img/fighter/corrin/main.png',
  bayonetta:
    'https://www.smashbros.com/assets_v2/img/fighter/bayonetta/main.png',

  inkling: 'https://www.smashbros.com/assets_v2/img/fighter/inkling/main.png',
  ridley: 'https://www.smashbros.com/assets_v2/img/fighter/ridley/main.png',
  simon: 'https://www.smashbros.com/assets_v2/img/fighter/simon/main.png',
  richter: 'https://www.smashbros.com/assets_v2/img/fighter/richter/main.png',
  krool: 'https://www.smashbros.com/assets_v2/img/fighter/king_k_rool/main.png',
  shizue: 'https://www.smashbros.com/assets_v2/img/fighter/isabelle/main.png',
  gaogaen:
    'https://www.smashbros.com/assets_v2/img/fighter/incineroar/main.png',
  packun:
    'https://www.smashbros.com/assets_v2/img/fighter/piranha_plant/main.png',
  jack: 'https://www.smashbros.com/assets_v2/img/fighter/joker/main.png',
  brave: 'https://www.smashbros.com/assets_v2/img/fighter/dq_hero/main.png',
  buddy:
    'https://www.smashbros.com/assets_v2/img/fighter/banjo_and_kazooie/main.png',
  dolly: 'https://www.smashbros.com/assets_v2/img/fighter/terry/main.png',
  master: 'https://www.smashbros.com/assets_v2/img/fighter/byleth/main.png',
  tantan: 'https://www.smashbros.com/assets_v2/img/fighter/min_min/main.png',
  pickel: 'https://www.smashbros.com/assets_v2/img/fighter/steve/main.png',
  edge: 'https://www.smashbros.com/assets_v2/img/fighter/sephiroth/main.png',
  eflame: 'https://www.smashbros.com/assets_v2/img/fighter/pyra/main.png',
  elight: 'https://www.smashbros.com/assets_v2/img/fighter/mythra/main.png',
  demon: 'https://www.smashbros.com/assets_v2/img/fighter/kazuya/main.png',
  trail: 'https://www.smashbros.com/assets_v2/img/fighter/sora/main.png',
};

const FOLDER_ALIASES = {
  c_falcon: 'captain',
  poke_trainer: 'ptrainer',
  pokemon_trainer: 'ptrainer',
  zerosuit_samus: 'szerosuit',
  zss: 'szerosuit',
  ice_climbers: 'ice_climber',
  icies: 'ice_climber',
  popo: 'ice_climber',
  nana: 'ice_climber',
  gnw: 'gamewatch',
  game_watch: 'gamewatch',
  mr_game_and_watch: 'gamewatch',
  meta_knight: 'metaknight',
  mk: 'metaknight',
  dark_pit: 'pitb',
  dpit: 'pitb',
  darkpit: 'pitb',
  dark_samus: 'samusd',
  dsamus: 'samusd',
  darksamus: 'samusd',
  dr_mario: 'mariod',
  doc: 'mariod',
  drmario: 'mariod',
  young_link: 'younglink',
  ylink: 'younglink',
  toon_link: 'toonlink',
  tlink: 'toonlink',
  king_dedede: 'dedede',
  king_k_rool: 'krool',
  kkr: 'krool',
  rosalina: 'rosetta',
  rosalina_luma: 'rosetta',
  rosa: 'rosetta',
  bowser_jr: 'koopajr',
  bjr: 'koopajr',
  duck_hunt: 'duckhunt',
  banjo_kazooie: 'buddy',
  banjo: 'buddy',
  pyra_mythra: 'eflame',
  pythra: 'eflame',
  aegis: 'eflame',
  minmin: 'tantan',
  min_min: 'tantan',
  pkmn_trainer: 'ptrainer',
  charizard: 'plizardon',
  squirtle: 'pzenigame',
  ivysaur: 'pfushigisou',
  villager: 'murabito',
  megaman: 'rockman',
  mega_man: 'rockman',
  wii_fit: 'wiifit',
  wiifit_trainer: 'wiifit',
  little_mac: 'littlemac',
  greninja: 'gekkouga',
  mii_brawler: 'miifighter',
  mii_swordfighter: 'miiswordsman',
  mii_gunner: 'miigunner',
  pac_man: 'pacman',
  piranha_plant: 'packun',
  plant: 'packun',
  hero: 'brave',
  steve: 'pickel',
  sephiroth: 'edge',
  seph: 'edge',
  pyra: 'eflame',
  homura: 'eflame',
  mythra: 'elight',
  hikari: 'elight',
  kazuya: 'demon',
  sora: 'trail',
};

function resolveFolderName(folderName: string) {
  const normalized = folderName.toLowerCase().trim();

  if (FOLDER_ALIASES[normalized]) {
    return FOLDER_ALIASES[normalized];
  }

  return normalized;
}

if (typeof window !== 'undefined') {
  window.SSBU_CHARACTERS = SSBU_CHARACTERS;
  window.CHARACTER_IMAGES = CHARACTER_IMAGES;
  window.FOLDER_ALIASES = FOLDER_ALIASES;
  window.resolveFolderName = resolveFolderName;
}
