export type NameGender = 'male' | 'female' | 'neutral'

interface SyllableTable {
  starts: string[]
  mids: string[]
  ends: Record<NameGender, string[]>
}

interface SurnameTable {
  prefixes: string[]
  suffixes: string[]
}

const TABLES: Record<string, SyllableTable> = {
  elf: {
    starts: ['aer', 'cael', 'elan', 'fal', 'gal', 'ith', 'lir', 'mae', 'naer', 'ryl', 'syl', 'thal', 'vael', 'wyn', 'ara', 'ell', 'sil', 'var', 'zar', 'lia', 'aer', 'cael', 'elar', 'fae', 'gael', 'ilm', 'lyr', 'mael', 'nar', 'rael', 'sael', 'thal', 'vyn', 'wynd', 'ael', 'cil', 'dir', 'eld', 'fir', 'hal', 'iav', 'jal'],
    mids:   ['a', 'ae', 'el', 'ir', 'or', 'yl', 'an', 'en', 'ith', 'al', 'ael', 'iel', 'ior', 'ial', 'ean'],
    ends: {
      male:    ['las', 'dor', 'rion', 'thas', 'ven', 'rath', 'mir', 'dan', 'ias', 'thor', 'lorn', 'din', 'sar', 'val', 'ren', 'lis', 'nor', 'tal', 'vel', 'wyr'],
      female:  ['riel', 'wen', 'iel', 'niel', 'ra', 'liel', 'ria', 'nia', 'lia', 'aria', 'iel', 'wen', 'nai', 'leth', 'wyn', 'nys', 'rae', 'sel', 'thi', 'via'],
      neutral: ['ath', 'an', 'el', 'en', 'il', 'or', 'in', 'al', 'eth', 'ist', 'ael', 'ien', 'ior', 'ion'],
    },
  },
  dwarf: {
    starts: ['bor', 'dur', 'grim', 'khaz', 'thor', 'brum', 'dag', 'folk', 'grun', 'helf', 'krag', 'mor', 'orm', 'runn', 'stein', 'torg', 'dwal', 'bofr', 'brak', 'brom', 'dak', 'darg', 'dorn', 'drak', 'drun', 'durg', 'garm', 'gorn', 'gram', 'grak', 'grin', 'grub', 'harg', 'helm', 'kram', 'krin', 'marg', 'mork', 'rug', 'thork', 'thram', 'torg', 'ulf', 'ulm', 'varg', 'vorn', 'wulf'],
    mids:   ['a', 'o', 'u', 'al', 'in', 'or', 'um', 'ar', 'en', 'ir', 'on', 'ur', 'ag'],
    ends: {
      male:    ['in', 'ak', 'ur', 'ik', 'um', 'orn', 'und', 'gar', 'ri', 'li', 'nar', 'nor', 'din', 'gin', 'kin', 'lin', 'min', 'nin', 'pin', 'rin', 'sin', 'tin', 'vin', 'win'],
      female:  ['a', 'ia', 'da', 'ra', 'ina', 'ita', 'ena', 'bra', 'dra', 'gra', 'kra', 'mra', 'nra', 'rika', 'vika', 'rika'],
      neutral: ['in', 'an', 'en', 'or', 'ik', 'un', 'eln', 'ith', 'ald', 'eld', 'old'],
    },
  },
  orc: {
    starts: ['gar', 'groh', 'kaz', 'mog', 'gor', 'bru', 'drak', 'gruk', 'krak', 'lok', 'mur', 'naz', 'rag', 'skul', 'urg', 'zug', 'grul', 'brug', 'arg', 'bark', 'bog', 'bruk', 'dug', 'gash', 'ghor', 'ghuk', 'grak', 'grom', 'grub', 'grug', 'gruk', 'karg', 'korg', 'kruk', 'lurk', 'marg', 'mork', 'mug', 'nak', 'nok', 'thrag', 'thrak', 'thruk', 'trag', 'trak', 'varg', 'vrak', 'zag', 'zrak'],
    mids:   ['a', 'o', 'u', 'ag', 'og', 'ug', 'ah', 'ar', 'or', 'ur'],
    ends: {
      male:    ['ash', 'uk', 'gar', 'ug', 'ak', 'ong', 'ul', 'ag', 'urk', 'oth', 'arg', 'ark', 'arm', 'arn', 'arp', 'arr', 'art', 'arv', 'arw', 'arz'],
      female:  ['a', 'ra', 'sha', 'ka', 'ta', 'na', 'ga', 'la', 'ma', 'va', 'za', 'gra', 'ska', 'tha'],
      neutral: ['ak', 'uk', 'og', 'ul', 'an', 'ar', 'ath', 'ek', 'ik', 'ok'],
    },
  },
  halfling: {
    starts: ['bil', 'ros', 'pip', 'mer', 'sam', 'fod', 'ham', 'ned', 'olo', 'per', 'tod', 'wil', 'cor', 'rob', 'tim', 'ank', 'ban', 'bri', 'cal', 'dan', 'del', 'elm', 'fan', 'fer', 'fin', 'flo', 'gil', 'gor', 'gos', 'hig', 'hil', 'ing', 'kel', 'lar', 'lil', 'lin', 'lor', 'mel', 'mil', 'nal', 'nel', 'nil', 'nor', 'pat', 'pol', 'ral', 'ran', 'rin', 'ror'],
    mids:   ['bo', 'lo', 'do', 'ro', 'li', 'di', 'mi', 'bi', 'bri', 'bur', 'del', 'den', 'der', 'din', 'dor', 'fen', 'fin', 'ger', 'gin'],
    ends: {
      male:    ['bo', 'do', 'go', 'ro', 'wise', 'foot', 'buck', 'kin', 'ton', 'wick', 'den', 'ford', 'gar', 'ham', 'hill', 'ley', 'lock', 'moor', 'pool', 'brook'],
      female:  ['a', 'ia', 'ra', 'da', 'na', 'bella', 'ina', 'lie', 'lin', 'lyn', 'mae', 'may', 'mie', 'nia', 'nna', 'ola', 'ora', 'ria', 'rna', 'via'],
      neutral: ['er', 'on', 'in', 'ey', 'et', 'ley', 'el', 'en', 'ton', 'wick', 'ford', 'ham', 'lock'],
    },
  },
  gnome: {
    starts: ['fiz', 'nim', 'quib', 'bib', 'dim', 'flip', 'glix', 'kink', 'nix', 'pib', 'tib', 'wim', 'zib', 'snib', 'brim', 'blip', 'blix', 'briz', 'crix', 'dix', 'driz', 'flib', 'flin', 'frix', 'grib', 'grim', 'grix', 'krib', 'krix', 'lim', 'lix', 'mib', 'mix', 'nibbl', 'pix', 'priz', 'quix', 'rib', 'rix', 'skib', 'skim', 'skix', 'slib', 'slim', 'snix', 'spib', 'spix', 'spriz', 'stib'],
    mids:   ['ble', 'dle', 'zle', 'kle', 'gle', 'tle', 'fle', 'kle', 'mle', 'nle', 'ple', 'sle', 'vle'],
    ends: {
      male:    ['wick', 'bur', 'spark', 'kin', 'bit', 'tick', 'gig', 'bix', 'dix', 'fix', 'kix', 'mix', 'nix', 'pix', 'rix', 'six', 'tix', 'vix', 'wix', 'zix'],
      female:  ['a', 'ia', 'ina', 'ella', 'ita', 'ika', 'ila', 'ima', 'ina', 'ixa', 'iza', 'lea', 'lie', 'lin', 'lia', 'lina', 'nna', 'ola', 'rina', 'vina'],
      neutral: ['er', 'ey', 'et', 'in', 'kin', 'ix', 'ek', 'el', 'em', 'en', 'ez', 'ip', 'it', 'iz'],
    },
  },
  tiefling: {
    starts: ['az', 'cim', 'riv', 'xiv', 'ach', 'ari', 'bel', 'cas', 'dex', 'fex', 'gex', 'hex', 'kel', 'lex', 'mal', 'nyx', 'ryl', 'six', 'vix', 'zel', 'rix', 'aek', 'aev', 'aex', 'akh', 'ald', 'alg', 'alz', 'amr', 'ams', 'anx', 'arz', 'asr', 'avr', 'axm', 'bal', 'ban', 'bar', 'bat', 'bax', 'bel', 'ber', 'bez', 'bim', 'bix', 'biz', 'bor', 'box', 'boz'],
    mids:   ['ar', 'el', 'er', 'or', 'ix', 'ex', 'ax', 'im', 'al', 'an', 'en', 'in', 'ir', 'on', 'ox', 'ul', 'um', 'ur'],
    ends: {
      male:    ['us', 'on', 'ar', 'ek', 'os', 'ath', 'ax', 'ius', 'ix', 'ox', 'ux', 'ak', 'al', 'am', 'an', 'ap', 'aq', 'as', 'at', 'av', 'aw', 'ay', 'az'],
      female:  ['a', 'ia', 'ra', 'eth', 'ith', 'ix', 'ela', 'ora', 'ura', 'ara', 'ira', 'ona', 'una', 'ina', 'ana', 'enia', 'oria', 'oxia'],
      neutral: ['er', 'el', 'ex', 'eth', 'or', 'in', 'al', 'an', 'en', 'ix', 'on', 'ul', 'um', 'ur'],
    },
  },
  dragonborn: {
    starts: ['aar', 'ghesh', 'kren', 'rash', 'shez', 'akra', 'bala', 'dha', 'faer', 'ges', 'mehe', 'nad', 'shed', 'thorn', 'vrinn', 'zeph', 'yrj', 'aark', 'aerj', 'aesj', 'afj', 'agj', 'ahj', 'aij', 'ajj', 'akj', 'alj', 'amj', 'anj', 'aoj', 'apj', 'aqj', 'arj', 'asj', 'atj', 'auj', 'avj', 'awj', 'axj', 'ayj', 'azj', 'bhesh', 'chesh', 'dhesh', 'fhesh', 'ghash', 'ghish', 'ghosh', 'ghush'],
    mids:   ['ar', 'ash', 'esh', 'ir', 'or', 'ax', 'ex', 'an', 'en', 'in', 'on', 'un', 'al', 'el', 'il', 'ol', 'ul'],
    ends: {
      male:    ['thar', 'gar', 'esh', 'rix', 'var', 'ix', 'rax', 'daan', 'faan', 'gaan', 'haan', 'jaan', 'kaan', 'laan', 'maan', 'naan', 'paan', 'qaan', 'raan', 'saan', 'taan'],
      female:  ['a', 'ia', 'ra', 'ala', 'ara', 'esa', 'ixa', 'aza', 'eza', 'iza', 'oza', 'uza', 'arna', 'erna', 'irna', 'orna', 'urna'],
      neutral: ['ar', 'ash', 'or', 'en', 'el', 'ex', 'an', 'in', 'on', 'un', 'al', 'il', 'ol', 'ul'],
    },
  },
  human: {
    starts: ['ald', 'ber', 'cal', 'dal', 'fen', 'gar', 'har', 'jor', 'kar', 'lan', 'mar', 'nor', 'per', 'rad', 'sig', 'tor', 'ulf', 'var', 'wen', 'ash', 'bren', 'dun', 'eld', 'ger', 'helm', 'kas', 'leo', 'nath', 'orik', 'seth', 'aed', 'ain', 'ald', 'alex', 'alf', 'alg', 'alh', 'alj', 'alk', 'all', 'alm', 'aln', 'alo', 'alp', 'alq', 'alr', 'als', 'alt', 'alu', 'alv', 'alw', 'alx', 'aly', 'alz', 'bald', 'bart', 'bern', 'birn', 'bran', 'bren'],
    mids:   ['al', 'ar', 'en', 'er', 'in', 'or', 'un', 'ic', 'el', 'ot', 'an', 'eth', 'ild', 'olf', 'olf', 'olph', 'olv', 'ond', 'ric', 'ulf'],
    ends: {
      male:    ['ric', 'ard', 'bert', 'mund', 'win', 'olf', 'helm', 'bald', 'man', 'ton', 'row', 'and', 'ard', 'art', 'burn', 'dale', 'den', 'don', 'dor', 'ford', 'ham', 'land', 'ley', 'lock', 'mer', 'more', 'ner', 'ric', 'rick', 'son', 'ston', 'ton', 'well', 'win', 'wood'],
      female:  ['a', 'ia', 'ild', 'wyn', 'na', 'sa', 'ra', 'da', 'ela', 'ina', 'bel', 'bela', 'beth', 'ella', 'en', 'ene', 'ette', 'eva', 'ida', 'ine', 'isa', 'ise', 'ita', 'ive', 'lia', 'lin', 'lina', 'na', 'nia', 'nna', 'ola', 'ora', 'ria', 'rina'],
      neutral: ['en', 'on', 'in', 'an', 'ey', 'ton', 'ley', 'den', 'ham', 'ford', 'wood', 'brook', 'dale', 'field', 'gate', 'grove', 'haven', 'hill', 'lake', 'land', 'moor'],
    },
  },

  // ── PF2e Ancestries ──────────────────────────────────────────────────────────

  goblin: {
    starts: ['ret', 'chu', 'poo', 'zog', 'mog', 'gut', 'drub', 'gub', 'rib', 'snig', 'tok', 'yig', 'griz', 'krab', 'nug', 'plig', 'skrak', 'wog', 'bik', 'crik', 'flik', 'glig', 'hig', 'jik', 'kig', 'lik', 'mig', 'nik', 'pig', 'rig', 'sig', 'tig', 'vig', 'wig', 'zik', 'bog', 'cog', 'dog', 'fog', 'gog', 'hog', 'jog', 'kog', 'log', 'nog', 'rog', 'sog', 'vog'],
    mids:   ['a', 'u', 'ig', 'ug', 'ag', 'og', 'ik', 'uk', 'ok'],
    ends: {
      male:    ['g', 'k', 'z', 'uk', 'at', 'ot', 'ug', 'ax', 'ig', 'ik', 'iz', 'og', 'ok', 'oz', 'ug'],
      female:  ['a', 'i', 'eta', 'ita', 'la', 'na', 'ra', 'ga', 'ka', 'ma', 'pa', 'ta', 'va', 'za'],
      neutral: ['o', 'u', 'ig', 'ag', 'ik', 'ok', 'uk', 'og', 'eg', 'ug'],
    },
  },
  hobgoblin: {
    starts: ['azaer', 'gol', 'man', 'nest', 'vol', 'zan', 'darg', 'harg', 'karg', 'marg', 'sarg', 'targ', 'varg', 'brak', 'drak', 'grak', 'krak', 'prak', 'trak', 'vrak', 'zrak', 'borg', 'gorg', 'korg', 'morg', 'norg', 'rorg', 'tharg', 'thrak', 'throg', 'throm', 'thron', 'thror', 'thros', 'throt', 'throv', 'throw', 'throx', 'throy'],
    mids:   ['ar', 'or', 'an', 'ul', 'ag', 'ok', 'rag', 'rak', 'rok', 'rul'],
    ends: {
      male:    ['us', 'ug', 'ak', 'ok', 'ul', 'ag', 'an', 'ot', 'ath', 'ech', 'ich', 'och', 'uch', 'ark', 'ork', 'urk'],
      female:  ['a', 'ra', 'ura', 'ara', 'ira', 'ona', 'ana', 'ena', 'ina', 'una', 'atha', 'echa', 'icha', 'ocha', 'ucha'],
      neutral: ['ar', 'ul', 'an', 'ot', 'ok', 'ag', 'ak', 'al', 'am', 'ap', 'as', 'at', 'av', 'aw', 'ax'],
    },
  },
  leshy: {
    starts: ['bark', 'blos', 'bud', 'clover', 'dew', 'fern', 'frond', 'glade', 'heather', 'herb', 'ivy', 'knot', 'leaf', 'lichen', 'moss', 'mush', 'myc', 'nettle', 'petal', 'pine', 'reed', 'root', 'rush', 'seed', 'shrub', 'silt', 'spore', 'stem', 'thorn', 'vine', 'briar', 'briar', 'clove', 'frond', 'grove', 'heath', 'hull', 'kern', 'limb', 'loam', 'lobe', 'marsh', 'muld', 'pith', 'plum', 'pod', 'sap', 'turf', 'wort'],
    mids:   ['y', 'o', 'le', 'er', 'in', 'ly', 'ling', 'ling', 'ling'],
    ends: {
      male:    ['root', 'stem', 'bark', 'knot', 'spike', 'thorn', 'wood', 'bough', 'branch', 'cap', 'cone', 'core', 'hull', 'limb', 'lobe', 'pith', 'pod', 'sap', 'seed', 'shoot'],
      female:  ['petal', 'bloom', 'flower', 'leaf', 'blossom', 'dew', 'moss', 'bud', 'clover', 'fern', 'frond', 'heather', 'herb', 'ivy', 'lichen', 'nettle', 'reed', 'rose', 'vine', 'wort'],
      neutral: ['spore', 'frond', 'seed', 'growth', 'cap', 'vine', 'glade', 'grove', 'heath', 'marsh', 'moor', 'mold', 'silt', 'turf', 'weed'],
    },
  },
  catfolk: {
    starts: ['aly', 'ami', 'curr', 'fash', 'ferr', 'jess', 'kel', 'khaj', 'lei', 'mao', 'mir', 'mur', 'nia', 'ola', 'ori', 'pur', 'ris', 'rur', 'saf', 'shar', 'siv', 'sun', 'tae', 'taur', 'tur', 'uri', 'viss', 'wul', 'yar', 'zar', 'akin', 'bask', 'claw', 'dara', 'elan', 'fash', 'ghar', 'harr', 'ilas', 'jasp', 'khal', 'lash', 'miko', 'nara', 'olua', 'pash', 'quar', 'raya', 'suna'],
    mids:   ['a', 'ur', 'ir', 'ar', 'or', 'ul', 'an', 'el', 'in', 'on'],
    ends: {
      male:    ['k', 'n', 'ar', 'el', 'in', 'on', 'an', 'as', 'ath', 'ax', 'ir', 'is', 'or', 'os', 'ur', 'us'],
      female:  ['a', 'ra', 'la', 'na', 'ya', 'ia', 'ara', 'ela', 'ila', 'ola', 'ula', 'aya', 'iya', 'oya'],
      neutral: ['an', 'el', 'or', 'in', 'ul', 'en', 'al', 'em', 'ik', 'im', 'it', 'ix'],
    },
  },
  lizardfolk: {
    starts: ['arashk', 'ess', 'ix', 'kersh', 'keth', 'nass', 'rak', 'shesh', 'ssurk', 'teth', 'zeth', 'ash', 'iss', 'kess', 'razz', 'xiss', 'zarr', 'hess', 'khiss', 'liss', 'riss', 'sass', 'tass', 'vizz', 'zass', 'akhss', 'ekhs', 'ikhs', 'okhs', 'ukhs', 'arxs', 'erxs', 'irxs', 'orxs', 'urxs', 'assh', 'essh', 'issh', 'ossh', 'ussh', 'aszh', 'eshz', 'ishz', 'oshz', 'ushz'],
    mids:   ['a', 'iss', 'ess', 'arr', 'urr', 'ix', 'ikh', 'akh', 'ekh', 'okh'],
    ends: {
      male:    ['k', 'sh', 'rk', 'xk', 'thk', 'zk', 'sk', 'ks', 'ksh', 'xsh', 'zsh', 'kss', 'xss', 'zss'],
      female:  ['a', 'ka', 'sha', 'ra', 'ia', 'issa', 'essa', 'assa', 'ikha', 'akha'],
      neutral: ['arr', 'iss', 'ess', 'ix', 'urr', 'ass', 'ikh', 'akh', 'ekh', 'okh'],
    },
  },
  tengu: {
    starts: ['arik', 'jib', 'jin', 'kor', 'kyon', 'och', 'odu', 'ojak', 'ono', 'ugu', 'yam', 'caw', 'gav', 'ka', 'kaw', 'ken', 'ko', 'krak', 'krik', 'ku', 'krawk', 'min', 'nar', 'pik', 'qua', 'rav', 'ten', 'tor', 'wan', 'yin', 'zin', 'aka', 'ara', 'eki', 'emi', 'eri', 'ika', 'iki', 'iko', 'iku', 'imi', 'iri', 'iru', 'ita', 'ito', 'itu', 'iwa', 'iwo', 'iya'],
    mids:   ['a', 'o', 'u', 'i', 'ak', 'un', 'or', 'an', 'en', 'in', 'on'],
    ends: {
      male:    ['ni', 'ro', 'zo', 'shi', 'ku', 'no', 'ton', 'bushi', 'dori', 'gori', 'hori', 'jori', 'kori', 'mori', 'nori', 'ori', 'rori', 'sori', 'tori', 'wori'],
      female:  ['ko', 'su', 'ka', 'na', 'yo', 'mi', 'ha', 'hi', 'ho', 'hu', 'ma', 'me', 'mo', 'mu', 'ni', 'nu', 'ri', 'ru', 'sa', 'se', 'si', 'so'],
      neutral: ['ke', 're', 'ne', 'me', 'se', 'te', 'no', 'de', 'fe', 'ge', 'he', 'je', 'le', 'pe', 'we', 'ye', 'ze'],
    },
  },
  kitsune: {
    starts: ['chik', 'ham', 'hir', 'ichi', 'jush', 'kaem', 'kaik', 'nam', 'nin', 'osha', 'tsuk', 'uta', 'akir', 'chi', 'fum', 'har', 'jin', 'kaz', 'kit', 'ko', 'kun', 'kur', 'miz', 'mor', 'mur', 'nar', 'ren', 'rin', 'ryo', 'sat', 'shin', 'sho', 'tak', 'yosh', 'aki', 'asa', 'azu', 'fuka', 'hana', 'haru', 'hika', 'himo', 'hino', 'hiro', 'hisa', 'hito', 'hiya', 'hizo', 'hizu'],
    mids:   ['a', 'u', 'i', 'o', 'uki', 'ura', 'imi', 'ino', 'iro', 'iru', 'isa', 'ise', 'ishi', 'iso'],
    ends: {
      male:    ['ro', 'shi', 'to', 'ji', 'no', 'ki', 'mon', 'hiko', 'ichi', 'iro', 'ishi', 'ita', 'ito', 'iu', 'iwa', 'iya', 'izo', 'izu'],
      female:  ['mi', 'ko', 'na', 'ha', 'ri', 'hime', 'ka', 'ma', 'me', 'mo', 'mu', 'ni', 'nu', 'ra', 'ru', 'sa', 'se', 'si', 'so', 'su', 'ta', 'te'],
      neutral: ['ze', 'me', 'ne', 'be', 're', 'ke', 'se', 'de', 'fe', 'ge', 'he', 'je', 'le', 'pe', 'we', 'ye'],
    },
  },
  kobold: {
    starts: ['chet', 'dirp', 'drax', 'ek', 'galz', 'ips', 'jix', 'kax', 'lim', 'lizz', 'mezz', 'nix', 'pax', 'quix', 'rix', 'six', 'tix', 'vix', 'wix', 'dak', 'elk', 'fil', 'gik', 'hik', 'ik', 'kip', 'lik', 'mik', 'nik', 'pik', 'rik', 'sik', 'tik', 'bix', 'brik', 'chix', 'dikk', 'drik', 'ekk', 'frik', 'grik', 'hikk', 'jrikk', 'krikk', 'lrikk', 'mrikk', 'nrikk', 'prikk', 'qrikk'],
    mids:   ['ix', 'ax', 'ik', 'ip', 'it', 'il', 'ex', 'ek', 'el', 'em', 'en', 'ep'],
    ends: {
      male:    ['x', 'k', 'ik', 'ax', 'ip', 'rix', 'ix', 'ek', 'ok', 'uk', 'ak'],
      female:  ['a', 'ia', 'ika', 'ixa', 'itta', 'ikka', 'ixa', 'ika', 'illa', 'ima', 'ina', 'ipa', 'ira', 'isa', 'ita'],
      neutral: ['ix', 'ik', 'il', 'ip', 'it', 'iz', 'ex', 'ek', 'el', 'em', 'en', 'ep'],
    },
  },
  ratfolk: {
    starts: ['aggr', 'bakk', 'chik', 'chett', 'dek', 'fitch', 'fizel', 'gez', 'grix', 'hak', 'igg', 'jik', 'kizr', 'nizz', 'pix', 'reek', 'skizz', 'tek', 'vrizz', 'wick', 'zikz', 'chit', 'chez', 'hez', 'kez', 'lez', 'mez', 'nez', 'pez', 'rez', 'sez', 'chekk', 'chikk', 'chizz', 'chrizz', 'dekk', 'dikk', 'fizz', 'gezz', 'grizz', 'hezz', 'jezz', 'krizz', 'lezz', 'mezz'],
    mids:   ['ak', 'ik', 'uk', 'iz', 'ez', 'az', 'ek', 'ok', 'ux'],
    ends: {
      male:    ['ak', 'uk', 'ik', 'ix', 'izz', 'rak', 'zak', 'kak', 'nak', 'pak', 'rak', 'sak', 'tak', 'vak', 'wak'],
      female:  ['a', 'ia', 'ika', 'ikka', 'izza', 'ra', 'ka', 'la', 'ma', 'na', 'pa', 'ra', 'sa', 'ta', 'va'],
      neutral: ['ik', 'ak', 'iz', 'ez', 'uk', 'el', 'ek', 'ok', 'al', 'am', 'an', 'ap', 'ar', 'as', 'at'],
    },
  },
  fetchling: {
    starts: ['fex', 'hex', 'iyo', 'madd', 'oph', 'rael', 'sond', 'stil', 'tal', 'umbr', 'vrex', 'wex', 'xon', 'zond', 'ash', 'dim', 'dusk', 'fade', 'gloom', 'grey', 'mist', 'shade', 'shiv', 'sil', 'sliv', 'vel', 'void', 'wan', 'wisp', 'zil', 'aev', 'aex', 'afv', 'agv', 'ahv', 'aiv', 'ajv', 'akv', 'alv', 'amv', 'anv', 'aov', 'apv', 'aqv', 'arv', 'asv', 'atv', 'auv', 'avv'],
    mids:   ['an', 'el', 'en', 'or', 'ar', 'ix', 'ex', 'al', 'em', 'in', 'on', 'ul', 'um', 'ur'],
    ends: {
      male:    ['ex', 'on', 'en', 'al', 'ic', 'ax', 'ren', 'vel', 'del', 'fel', 'gel', 'hel', 'jel', 'kel', 'lel', 'mel', 'nel', 'pel', 'rel', 'sel', 'tel', 'vel', 'wel', 'xel'],
      female:  ['a', 'ia', 'ra', 'eli', 'oph', 'una', 'ana', 'ena', 'ina', 'ona', 'ela', 'ila', 'ola', 'ula', 'ava', 'eva', 'iva', 'ova', 'uva'],
      neutral: ['el', 'en', 'or', 'ic', 'ix', 'al', 'am', 'an', 'ap', 'ar', 'as', 'at', 'av', 'aw', 'ax'],
    },
  },
  gnoll: {
    starts: ['ehch', 'gan', 'gor', 'hak', 'hhar', 'ini', 'karr', 'keth', 'kral', 'krall', 'mar', 'nar', 'rakk', 'rakn', 'sar', 'thar', 'var', 'yar', 'bark', 'chor', 'gnar', 'gnash', 'gnaw', 'grib', 'hyak', 'kach', 'krag', 'snap', 'snar', 'brak', 'chak', 'drak', 'frak', 'grak', 'hrak', 'jrak', 'krak', 'lrak', 'mrak', 'nrak', 'prak', 'qrak', 'rrak', 'srak', 'trak', 'vrak', 'wrak'],
    mids:   ['ar', 'ak', 'ok', 'ek', 'ag', 'og', 'al', 'ol', 'ul', 'an'],
    ends: {
      male:    ['ak', 'ek', 'ok', 'ik', 'rak', 'kak', 'lak', 'mak', 'nak', 'pak', 'qak', 'rak', 'sak', 'tak', 'vak', 'wak'],
      female:  ['a', 'ra', 'ka', 'ira', 'ara', 'eka', 'aka', 'ika', 'oka', 'uka', 'ala', 'ela', 'ila', 'ola', 'ula'],
      neutral: ['ak', 'ek', 'ar', 'ok', 'al', 'an', 'am', 'ap', 'as', 'at', 'av', 'aw', 'ax', 'ay', 'az'],
    },
  },
  grippli: {
    starts: ['brek', 'chirp', 'crik', 'drib', 'flib', 'glip', 'grib', 'hop', 'jib', 'krek', 'llib', 'mrib', 'nib', 'plib', 'plip', 'quib', 'rrib', 'skit', 'skrib', 'trib', 'vrib', 'wrib', 'zib', 'blip', 'blib', 'brib', 'clop', 'clip', 'crip', 'drip', 'flip', 'frop', 'glop', 'glup', 'grop', 'krop', 'krup', 'lrib', 'mrop', 'nrop', 'prop', 'prup', 'qrop', 'qrup', 'rrop'],
    mids:   ['le', 'er', 'ok', 'ip', 'ib', 'ul', 'op', 'up', 'ap'],
    ends: {
      male:    ['op', 'ak', 'ib', 'uk', 'ot', 'ok', 'ix', 'ap', 'ep', 'ip', 'up', 'ab', 'eb', 'ob', 'ub'],
      female:  ['a', 'ia', 'ika', 'ita', 'iba', 'ula', 'opa', 'ipa', 'apa', 'epa', 'oba', 'eba', 'aba', 'upa', 'uba'],
      neutral: ['ib', 'ip', 'ok', 'ul', 'el', 'er', 'op', 'up', 'ap', 'ep', 'ab', 'eb', 'ob', 'ub'],
    },
  },
  nagaji: {
    starts: ['azud', 'ghal', 'keth', 'khai', 'nakt', 'raesh', 'sashr', 'seth', 'sheth', 'thas', 'vas', 'zass', 'nag', 'sath', 'ssas', 'zhar', 'nagr', 'niss', 'rasss', 'sass', 'siss', 'svar', 'thiss', 'vishh', 'asss', 'esss', 'isss', 'osss', 'usss', 'arsss', 'ersss', 'irsss', 'orsss', 'ursss', 'asssh', 'esssh', 'isssh', 'osssh', 'usssh', 'nasss', 'nesss', 'nisss', 'nosss', 'nusss'],
    mids:   ['a', 'ar', 'as', 'iss', 'eth', 'an', 'en', 'in', 'on', 'un', 'al', 'el', 'il', 'ol', 'ul'],
    ends: {
      male:    ['ak', 'ath', 'an', 'em', 'oth', 'ul', 'as', 'akh', 'ekh', 'ikh', 'okh', 'ukh', 'axs', 'exs', 'ixs', 'oxs', 'uxs'],
      female:  ['a', 'ra', 'li', 'tha', 'sha', 'na', 'ana', 'ela', 'ila', 'ola', 'ula', 'atha', 'etha', 'itha', 'otha', 'utha'],
      neutral: ['ath', 'an', 'as', 'eth', 'iss', 'al', 'am', 'ap', 'ar', 'at', 'av', 'aw', 'ax', 'ay', 'az'],
    },
  },
  sprite: {
    starts: ['blink', 'dart', 'dew', 'dust', 'flit', 'glit', 'glim', 'glow', 'lum', 'mote', 'nit', 'pix', 'priz', 'shim', 'shin', 'spar', 'spark', 'sprit', 'swift', 'twink', 'whim', 'wink', 'zest', 'zing', 'zip', 'bri', 'flick', 'glitt', 'bliss', 'briz', 'buzz', 'chime', 'driz', 'drizzle', 'fiz', 'fizz', 'flare', 'flash', 'fleck', 'flint', 'floss', 'flutter', 'gild', 'gilt', 'glad', 'glade', 'glam', 'glare', 'glass', 'gleam'],
    mids:   ['er', 'le', 'y', 'ling', 'el', 'ily', 'ly', 'ily', 'wing', 'bell'],
    ends: {
      male:    ['wing', 'tail', 'flap', 'dart', 'swift', 'glow', 'spark', 'bolt', 'flame', 'flash', 'light', 'mote', 'shine', 'star', 'wisp', 'zap'],
      female:  ['bell', 'song', 'dew', 'mist', 'haze', 'mote', 'bloom', 'bud', 'dust', 'glow', 'glint', 'gleam', 'light', 'mist', 'shimmer', 'twinkle'],
      neutral: ['light', 'wind', 'shine', 'flow', 'gleam', 'wisp', 'beam', 'blaze', 'bolt', 'breeze', 'drift', 'flame', 'flare', 'fleck', 'flint', 'glimmer'],
    },
  },
  strix: {
    starts: ['ahr', 'drax', 'dusk', 'grak', 'iron', 'krix', 'nrix', 'prax', 'rax', 'skral', 'storm', 'strik', 'thrax', 'vrix', 'wrax', 'xrix', 'zrax', 'brak', 'crak', 'drak', 'frak', 'gark', 'hark', 'kark', 'ahrk', 'arrk', 'bark', 'dark', 'fark', 'gark', 'hark', 'jark', 'kark', 'lark', 'mark', 'nark', 'park', 'qark', 'rark', 'sark', 'tark', 'vark', 'wark'],
    mids:   ['wind', 'feather', 'peak', 'soar', 'storm', 'claw', 'talon', 'wing', 'sky', 'gust'],
    ends: {
      male:    ['storm', 'claw', 'peak', 'strike', 'wind', 'blade', 'talon', 'dart', 'dive', 'gale', 'gust', 'plunge', 'soar', 'swoop', 'thrust'],
      female:  ['song', 'feather', 'dusk', 'dawn', 'wing', 'grace', 'gale', 'call', 'cry', 'glide', 'sweep', 'turn', 'watch'],
      neutral: ['gust', 'draft', 'glide', 'swoop', 'flight', 'soar', 'dive', 'air', 'breeze', 'drift', 'fall', 'flow', 'rush', 'sail', 'slip'],
    },
  },
}

const SURNAME_TABLES: Record<string, SurnameTable> = {
  elf: {
    prefixes: ['Aur', 'Cael', 'Dawn', 'Eld', 'Gal', 'Lith', 'Moon', 'Star', 'Syl', 'Wind', 'Wyn', 'Dusk', 'Vael', 'Mist', 'Arc', 'Azure', 'Bright', 'Crys', 'Dew', 'Dream', 'Eve', 'Far', 'Glen', 'Gold', 'Haze', 'High', 'Hollow', 'Ice', 'Jade'],
    suffixes: ['bloom', 'bow', 'dawn', 'dusk', 'leaf', 'light', 'moon', 'shade', 'song', 'whisper', 'wind', 'blossom', 'river', 'arrow', 'dream', 'eye', 'fall', 'flame', 'flow', 'glade', 'glimmer', 'glow', 'haven', 'heart', 'hill', 'hollow', 'lake', 'lance', 'lore', 'mantle'],
  },
  dwarf: {
    prefixes: ['Anvil', 'Axe', 'Coal', 'Fire', 'Forge', 'Gold', 'Iron', 'Rock', 'Stone', 'Storm', 'Thunder', 'Deep', 'Flint', 'Amber', 'Ash', 'Basalt', 'Boulder', 'Brass', 'Bronze', 'Chalk', 'Chert', 'Chip', 'Cobble', 'Copper', 'Crystal', 'Diamond', 'Ember', 'Flake', 'Fossil'],
    suffixes: ['beard', 'brow', 'fist', 'forge', 'hammer', 'helm', 'hide', 'mane', 'shield', 'skin', 'crest', 'mantle', 'anvil', 'arm', 'axe', 'back', 'belt', 'boot', 'brow', 'buckle', 'chain', 'chest', 'chin', 'cloak', 'crown', 'drum', 'foot', 'gauntlet', 'girdle'],
  },
  orc: {
    prefixes: ['Ash', 'Blood', 'Bone', 'Dark', 'Dusk', 'Iron', 'Skull', 'Scar', 'Shadow', 'War', 'Rage', 'Grim', 'Axe', 'Blade', 'Bolt', 'Brand', 'Break', 'Brute', 'Burn', 'Claw', 'Crash', 'Crush', 'Cut', 'Death', 'Doom', 'Dread', 'Drive', 'Drop'],
    suffixes: ['axe', 'blade', 'breaker', 'crusher', 'fang', 'jaw', 'smasher', 'tusk', 'gore', 'render', 'bane', 'bash', 'bite', 'brand', 'break', 'burn', 'clash', 'claw', 'cleave', 'crack', 'crash', 'crunch', 'cut', 'dash', 'deal', 'death', 'dice', 'doom'],
  },
  halfling: {
    prefixes: ['Bright', 'Burrow', 'Clover', 'Good', 'Green', 'Hill', 'Honey', 'Lucky', 'Merry', 'Sweet', 'Bram', 'Cozy', 'Apple', 'Barley', 'Berry', 'Blossom', 'Butter', 'Cheery', 'Clover', 'Cobble', 'Cream', 'Cricket', 'Daisy', 'Dapper', 'Dusk', 'Dusty', 'Fair'],
    suffixes: ['barrel', 'berry', 'bottom', 'brook', 'bush', 'feet', 'field', 'flower', 'hill', 'home', 'nook', 'door', 'apple', 'bank', 'barn', 'bend', 'bog', 'branch', 'brier', 'bump', 'burrow', 'bush', 'creek', 'dale', 'dell', 'den', 'dock', 'door', 'down', 'farm'],
  },
  gnome: {
    prefixes: ['Bright', 'Copper', 'Gear', 'Quick', 'Silver', 'Spark', 'Spring', 'Tick', 'Tink', 'Whirr', 'Fizz', 'Clank', 'Blink', 'Bolt', 'Brass', 'Bubble', 'Buzz', 'Chime', 'Click', 'Clink', 'Cog', 'Coil', 'Crack', 'Dial', 'Drip', 'Fiz', 'Flash', 'Flint'],
    suffixes: ['bolt', 'cog', 'fidget', 'gear', 'jack', 'nick', 'spring', 'tick', 'wick', 'wind', 'gadget', 'crank', 'axle', 'beam', 'bell', 'bit', 'bix', 'bolt', 'box', 'bump', 'buzz', 'cam', 'catch', 'chip', 'chute', 'clamp', 'clap', 'clasp', 'click'],
  },
  tiefling: {
    prefixes: ['Ash', 'Cinder', 'Ember', 'Night', 'Shadow', 'Sorrow', 'Spite', 'Vex', 'Void', 'Woe', 'Dusk', 'Ruin', 'Bane', 'Blaze', 'Blight', 'Blood', 'Brand', 'Burn', 'Char', 'Coal', 'Curse', 'Dark', 'Dread', 'Doom', 'Fall', 'Flame', 'Gloom', 'Grief'],
    suffixes: ['bane', 'born', 'burn', 'fall', 'flame', 'heart', 'mark', 'pyre', 'rose', 'thorn', 'brand', 'scar', 'ash', 'bind', 'blade', 'blaze', 'blight', 'blood', 'brand', 'break', 'burn', 'call', 'chain', 'char', 'chill', 'coal', 'coil', 'cold', 'curse', 'cut'],
  },
  dragonborn: {
    prefixes: ['Ash', 'Char', 'Cinder', 'Ember', 'Scale', 'Sear', 'Smoke', 'Storm', 'Thunder', 'Vex', 'Blaze', 'Gale', 'Acid', 'Arcane', 'Azure', 'Blaze', 'Brand', 'Brass', 'Bronze', 'Burn', 'Char', 'Chill', 'Coal', 'Cold', 'Copper', 'Crystal', 'Dark', 'Deep'],
    suffixes: ['claw', 'fang', 'fire', 'hide', 'maw', 'scale', 'smoke', 'storm', 'talon', 'wing', 'breath', 'roar', 'ash', 'back', 'bane', 'bite', 'blaze', 'blast', 'blood', 'blow', 'bolt', 'brand', 'burn', 'chill', 'coil', 'cold', 'crash', 'crush', 'cut'],
  },
  human: {
    prefixes: ['Ash', 'Black', 'Bold', 'Bright', 'Cold', 'Dark', 'Fair', 'Grey', 'Hard', 'High', 'North', 'Red', 'Stone', 'Swift', 'West', 'White', 'Wild', 'Amber', 'Bale', 'Bare', 'Barn', 'Beau', 'Beck', 'Birch', 'Blue', 'Brace', 'Burn', 'Clear', 'Cliff'],
    suffixes: ['brook', 'burn', 'dale', 'field', 'ford', 'grove', 'ham', 'haven', 'hill', 'holm', 'moor', 'pool', 'rock', 'thorn', 'vale', 'well', 'wood', 'acre', 'arch', 'bank', 'barn', 'bay', 'bend', 'berth', 'bog', 'borne', 'bottom', 'bourne', 'branch', 'brae'],
  },
  goblin: {
    prefixes: ['Bograt', 'Crabclaw', 'Dung', 'Gut', 'Licktoad', 'Muck', 'Rotten', 'Trash', 'Bigspit', 'Bonechew', 'Bugbite', 'Crunchbit', 'Dirtsniffer', 'Dungheap', 'Eyebite', 'Filchfinger', 'Gnawbone', 'Greasefist', 'Grime', 'Grubfoot', 'Lumpy', 'Muckraker', 'Mudpie', 'Nastytoe', 'Nibbleclaw', 'Nosepicker', 'Rottenbrain', 'Snotty', 'Stinky', 'Trashpile'],
    suffixes: ['eater', 'face', 'finger', 'foot', 'gut', 'hide', 'mouth', 'nose', 'pox', 'sniffer', 'toes', 'arm', 'back', 'belch', 'bit', 'bite', 'bone', 'brain', 'burp', 'butt', 'claw', 'ear', 'eye', 'fang', 'fart', 'gnaw', 'gum', 'hair', 'hand', 'head'],
  },
  hobgoblin: {
    prefixes: ['Battle', 'Blood', 'Blade', 'Conquest', 'Dread', 'Fire', 'Iron', 'Kill', 'Legion', 'March', 'Order', 'Raid', 'Ram', 'Rank', 'Siege', 'Steel', 'Storm', 'Strike', 'Swift', 'Sword', 'Axe', 'Banner', 'Bold', 'Brass', 'Chain', 'Charge', 'Command', 'Crush', 'Drill', 'Drive'],
    suffixes: ['blade', 'fist', 'march', 'ram', 'rank', 'strike', 'sword', 'brand', 'arm', 'axe', 'back', 'banner', 'belt', 'bolt', 'boot', 'bow', 'brand', 'break', 'charge', 'clash', 'claw', 'coat', 'crush', 'cut', 'dash', 'drive', 'drum', 'fall', 'fang', 'foot'],
  },
  leshy: {
    prefixes: ['Bark', 'Bloom', 'Blossom', 'Branch', 'Bud', 'Clover', 'Dew', 'Fern', 'Frond', 'Glade', 'Grove', 'Heather', 'Herb', 'Ivy', 'Knot', 'Leaf', 'Lichen', 'Loam', 'Moss', 'Mush', 'Nettle', 'Petal', 'Reed', 'Root', 'Rush', 'Seed', 'Shrub', 'Spore', 'Stem', 'Thorn'],
    suffixes: ['bark', 'bloom', 'blossom', 'bough', 'branch', 'bud', 'cap', 'clover', 'cone', 'core', 'dew', 'fern', 'flower', 'frond', 'glade', 'grove', 'growth', 'heath', 'herb', 'hull', 'ivy', 'knot', 'leaf', 'lichen', 'limb', 'lobe', 'loam', 'marsh', 'mold', 'moss'],
  },
  catfolk: {
    prefixes: ['Amber', 'Claw', 'Dusk', 'Far', 'Fleet', 'Gold', 'Grace', 'Hunt', 'Jade', 'Keen', 'Lithe', 'Mane', 'Night', 'Pad', 'Pounce', 'Pride', 'Prowl', 'Quick', 'Rust', 'Sand', 'Shadow', 'Sleek', 'Stalk', 'Stripe', 'Swift', 'Tail', 'Tawny', 'Track', 'Trek', 'Trot'],
    suffixes: ['claw', 'eye', 'fang', 'foot', 'grace', 'hunt', 'mane', 'paw', 'pride', 'prowl', 'purr', 'roar', 'shadow', 'spring', 'stalk', 'step', 'stride', 'stripe', 'swift', 'tail', 'track', 'tread', 'trot', 'tuff', 'tuft', 'turn', 'twist', 'walk', 'wander', 'watch'],
  },
  lizardfolk: {
    prefixes: ['Ash', 'Basking', 'Bog', 'Crag', 'Deep', 'Dusk', 'Ember', 'Fang', 'Glitter', 'Hiss', 'Iron', 'Jaw', 'Marsh', 'Mire', 'Murk', 'Pit', 'Reed', 'River', 'Rock', 'Scale', 'Sedge', 'Shade', 'Silt', 'Slick', 'Slide', 'Slither', 'Stone', 'Swamp', 'Tide', 'Venom'],
    suffixes: ['back', 'claw', 'fang', 'hide', 'jaw', 'maw', 'scale', 'skin', 'slip', 'tail', 'tooth', 'ash', 'basking', 'bog', 'coil', 'creek', 'crest', 'dart', 'deep', 'dive', 'drift', 'dusk', 'ember', 'fang', 'flash', 'flee', 'flow', 'foam', 'fork'],
  },
  tengu: {
    prefixes: ['Black', 'Bright', 'Dawn', 'Dusk', 'Far', 'Feather', 'Fleet', 'High', 'Iron', 'Keen', 'Midnight', 'Mist', 'Night', 'Quick', 'Raven', 'Sharp', 'Shrill', 'Sky', 'Storm', 'Sun', 'Swift', 'Thunder', 'Wide', 'Wind', 'Wing', 'Wise', 'Wit', 'Wonder'],
    suffixes: ['beak', 'call', 'caw', 'crest', 'cry', 'dive', 'eye', 'feather', 'flight', 'glide', 'glint', 'grace', 'keen', 'nest', 'perch', 'plume', 'raven', 'roost', 'shadow', 'sharp', 'shrill', 'sight', 'soar', 'song', 'streak', 'sweep', 'swift', 'talon', 'tide', 'turn'],
  },
  kitsune: {
    prefixes: ['Autumn', 'Bright', 'Cherry', 'Cloud', 'Crystal', 'Dawn', 'Dream', 'Dusk', 'Fire', 'Flame', 'Flower', 'Frost', 'Gold', 'Grace', 'Haze', 'Jade', 'Lotus', 'Maple', 'Mist', 'Moon', 'Night', 'Pearl', 'Pine', 'Rain', 'Rose', 'Sakura', 'Silk', 'Silver', 'Snow', 'Spring'],
    suffixes: ['blossom', 'dance', 'dream', 'dusk', 'fire', 'flame', 'flower', 'foam', 'frost', 'grace', 'haze', 'jade', 'leaf', 'light', 'lotus', 'mist', 'moon', 'petal', 'pine', 'rain', 'rose', 'sakura', 'shadow', 'shimmer', 'silk', 'silver', 'snow', 'song', 'spring', 'star'],
  },
  kobold: {
    prefixes: ['Bright', 'Claw', 'Cruel', 'Dark', 'Deep', 'Dig', 'Dread', 'Fire', 'Gold', 'Greedy', 'Grim', 'Hoard', 'Iron', 'Keen', 'Mine', 'Quick', 'Scale', 'Sharp', 'Shiny', 'Sly', 'Small', 'Smelt', 'Sneaky', 'Steal', 'Sly', 'Swift', 'Trick', 'Tunnel', 'Twitch', 'Wicked'],
    suffixes: ['claw', 'dig', 'fang', 'hoard', 'mine', 'scale', 'scratch', 'sharp', 'shiny', 'sly', 'steal', 'tail', 'tooth', 'trick', 'tunnel', 'bite', 'burrow', 'clutch', 'coil', 'cram', 'crawl', 'creep', 'dart', 'delve', 'dig', 'drip', 'dwell', 'gnaw', 'grab', 'grasp'],
  },
  ratfolk: {
    prefixes: ['Bright', 'Chew', 'Dark', 'Flee', 'Gnaw', 'Grey', 'Hoard', 'Keen', 'Nibble', 'Night', 'Quick', 'Scratch', 'Sharp', 'Shiny', 'Skulk', 'Sly', 'Sneak', 'Swift', 'Twitch', 'Whisker', 'Bite', 'Burrow', 'Cram', 'Crawl', 'Creep', 'Dart', 'Dash', 'Dig', 'Dodge'],
    suffixes: ['claw', 'fang', 'gnaw', 'nibble', 'scratch', 'scurry', 'squeak', 'tail', 'teeth', 'whisker', 'bite', 'burrow', 'chew', 'crawl', 'creep', 'dart', 'dash', 'dig', 'dodge', 'flee', 'foot', 'grab', 'grasp', 'hide', 'hole', 'horde', 'hoard', 'leap', 'lurk', 'nose'],
  },
  fetchling: {
    prefixes: ['Ash', 'Dark', 'Dim', 'Dusk', 'Fade', 'Ghost', 'Gloom', 'Grey', 'Mist', 'Night', 'Pale', 'Shadow', 'Shade', 'Silhouette', 'Slim', 'Sliver', 'Smoke', 'Still', 'Twilight', 'Umbra', 'Veil', 'Void', 'Wan', 'Wisp', 'Cinder', 'Cloud', 'Dull', 'Echo', 'Faint', 'Fog'],
    suffixes: ['ash', 'dark', 'dusk', 'fade', 'ghost', 'gloom', 'mist', 'night', 'pale', 'shade', 'shadow', 'smoke', 'still', 'twilight', 'veil', 'void', 'whisper', 'wisp', 'cloud', 'dim', 'echo', 'fog', 'form', 'grey', 'haze', 'hollow', 'hush', 'lull', 'murmur', 'murk'],
  },
  gnoll: {
    prefixes: ['Blood', 'Bone', 'Cackle', 'Carnage', 'Claw', 'Dark', 'Death', 'Doom', 'Dread', 'Dusk', 'Fang', 'Fear', 'Feral', 'Fierce', 'Frenzy', 'Fury', 'Ghost', 'Gnash', 'Gore', 'Grim', 'Growl', 'Howl', 'Hunt', 'Hunger', 'Hyena', 'Kill', 'Maul', 'Night', 'Pack'],
    suffixes: ['bite', 'claw', 'fang', 'gnash', 'growl', 'howl', 'hunt', 'jaw', 'maw', 'pack', 'pelt', 'prey', 'prowl', 'rend', 'roar', 'savage', 'snarl', 'snarl', 'snout', 'stalk', 'strip', 'tear', 'tooth', 'track', 'trail', 'trample', 'trot', 'tusk', 'yip', 'yowl'],
  },
  grippli: {
    prefixes: ['Bright', 'Croak', 'Deep', 'Dew', 'Frog', 'Green', 'Hatch', 'Hop', 'Jumpy', 'Keen', 'Leap', 'Marsh', 'Mire', 'Mud', 'Night', 'Pad', 'Pond', 'Pool', 'Quick', 'Rain', 'Reed', 'Ripple', 'River', 'Rush', 'Shallow', 'Skip', 'Slick', 'Slide', 'Slip', 'Splash'],
    suffixes: ['croak', 'dart', 'dive', 'drop', 'frog', 'glide', 'hop', 'jump', 'leap', 'leap', 'lick', 'mud', 'pad', 'plop', 'pond', 'pool', 'ripple', 'skip', 'slick', 'slide', 'slip', 'splash', 'spring', 'stick', 'strike', 'swim', 'tongue', 'wade', 'water', 'wriggle'],
  },
  nagaji: {
    prefixes: ['Ancient', 'Blood', 'Coil', 'Deep', 'Divine', 'Dream', 'Eternal', 'Fade', 'Fang', 'Fire', 'Gold', 'Grace', 'Hiss', 'Holy', 'Hunt', 'Iron', 'Jade', 'Lore', 'Mystic', 'Night', 'Old', 'Pit', 'Pith', 'Regal', 'Sacred', 'Scale', 'Serpent', 'Shadow', 'Silk', 'Slither'],
    suffixes: ['coil', 'fang', 'hiss', 'scale', 'serpent', 'slither', 'tail', 'tooth', 'venom', 'wrap', 'bend', 'bite', 'blood', 'charm', 'chill', 'clasp', 'cling', 'clutch', 'coil', 'dart', 'dive', 'dream', 'drift', 'drip', 'drop', 'fade', 'fang', 'flow', 'fold', 'fork'],
  },
  sprite: {
    prefixes: ['Bloom', 'Bliss', 'Bright', 'Chime', 'Dew', 'Dust', 'Fae', 'Flicker', 'Float', 'Flutter', 'Gild', 'Gleam', 'Glimmer', 'Glint', 'Glow', 'Gold', 'Grace', 'Haze', 'Joy', 'Light', 'Lilt', 'Lull', 'Luna', 'Mist', 'Mote', 'Petal', 'Pixie', 'Quick', 'Radiant', 'Shimmer'],
    suffixes: ['bell', 'bloom', 'bolt', 'breeze', 'dance', 'dart', 'dew', 'dream', 'drift', 'dust', 'fall', 'flare', 'flash', 'flicker', 'flit', 'float', 'flutter', 'gleam', 'glimmer', 'glint', 'glow', 'grace', 'haze', 'light', 'mist', 'mote', 'shimmer', 'shine', 'song', 'spark'],
  },
  strix: {
    prefixes: ['Black', 'Blade', 'Cold', 'Dark', 'Dawn', 'Dire', 'Doom', 'Dusk', 'Eye', 'Far', 'Fast', 'Fell', 'Fierce', 'Gale', 'Grim', 'High', 'Iron', 'Keen', 'Mountain', 'Night', 'Peak', 'Quick', 'Raven', 'Rock', 'Shadow', 'Sharp', 'Sky', 'Soar', 'Steel', 'Storm'],
    suffixes: ['blade', 'claw', 'cry', 'dive', 'eye', 'fall', 'feather', 'flight', 'gale', 'glide', 'gust', 'peak', 'plunge', 'quest', 'roost', 'rush', 'shadow', 'shriek', 'sky', 'slash', 'soar', 'storm', 'streak', 'strike', 'swoop', 'talon', 'thorn', 'thunder', 'wind', 'wing'],
  },
}

const RACE_KEYWORDS: [string, string][] = [
  // longer/more-specific keywords first to avoid prefix-matching shorter ones
  ['dragonborn', 'dragonborn'],
  ['hobgoblin',  'hobgoblin'],
  ['halfling',   'halfling'],
  ['lizardfolk', 'lizardfolk'],
  ['fetchling',  'fetchling'],
  ['grippli',    'grippli'],
  ['ratfolk',    'ratfolk'],
  ['tiefling',   'tiefling'],
  ['catfolk',    'catfolk'],
  ['kitsune',    'kitsune'],
  ['nagaji',     'nagaji'],
  ['kobold',     'kobold'],
  ['tengu',      'tengu'],
  ['sprite',     'sprite'],
  ['strix',      'strix'],
  ['gnoll',      'gnoll'],
  ['leshy',      'leshy'],
  ['eladrin',    'elf'],
  ['drow',       'elf'],
  ['amurrun',    'catfolk'],
  ['iruxi',      'lizardfolk'],
  ['ysoki',      'ratfolk'],
  ['cambion',    'tiefling'],
  ['draconic',   'dragonborn'],
  ['hobbit',     'halfling'],
  ['goblin',     'goblin'],
  ['gnome',      'gnome'],
  ['dwarf',      'dwarf'],
  ['dwarv',      'dwarf'],
  ['orc',        'orc'],
  ['elf',        'elf'],
  ['elv',        'elf'],
]

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function matchKey(race: string): string {
  const r = race.toLowerCase()
  for (const [keyword, key] of RACE_KEYWORDS) {
    if (r.includes(keyword)) return key
  }
  return 'human'
}

function buildFirstName(table: SyllableTable, gender: NameGender): string {
  const start = pick(table.starts)
  const mid = Math.random() > 0.55 ? pick(table.mids) : ''
  const end = pick(table.ends[gender])
  return cap(start + mid + end)
}

function buildSurname(table: SurnameTable): string {
  return pick(table.prefixes) + pick(table.suffixes)
}

export function generateFullName(gender: NameGender, race: string): { first: string; last: string } {
  const key = matchKey(race)
  return {
    first: buildFirstName(TABLES[key], gender),
    last:  buildSurname(SURNAME_TABLES[key]),
  }
}
