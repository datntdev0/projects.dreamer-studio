import type { LibraryNovel } from '../../src/features/library/library.models';
import { NOVELS, makeChapters } from './library';

import type {
  AnalysisEntity,
  AnalysisFact,
  ChapterAnalysis,
  ChapterAnalysisCounts,
  ChapterAnalysisStatus,
  EntityType,
  ItemStatus,
  Ontology,
  OntologyProblem,
  OverlayEdit,
  ReviewEdit,
} from '@dreamer/shared/models/analysis';

export const DEFAULT_ONTOLOGY: Ontology = {
  name: 'novel-ontology',
  task: 'Extract the entities and predicates from the chapters.',
  rules: ['Extract only facts stated explicitly in the text.'],
  entityTypes: ['Character', 'Persona', 'Location', 'Organization', 'Artifact', 'Glossary'],
  entityTypeDescriptions: {},
  entityTypeExamples: {},
  entityTypeProperties: {
    Character: [{ name: 'name', required: true, multiple: false }],
    Persona: [
      { name: 'name', required: true, multiple: false },
      { name: 'alias', required: false, multiple: true },
      { name: 'title', required: false, multiple: true },
    ],
    Location: [{ name: 'name', required: true, multiple: false }],
    Organization: [{ name: 'name', required: true, multiple: false }],
    Artifact: [{ name: 'name', required: true, multiple: false }],
    Glossary: [{ name: 'name', required: true, multiple: false }],
  },
  predicates: [
    { name: 'parent_of', kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Character'] },
    { name: 'sibling_of', kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Character'] },
    { name: 'master_of', kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Character'] },
    { name: 'member_of', kind: 'relationship', subjectTypes: ['Character', 'Persona'], objectTypes: ['Organization'] },
    { name: 'leads', kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Organization'] },
    {
      name: 'located_in',
      kind: 'relationship',
      subjectTypes: ['Character', 'Persona', 'Organization', 'Location'],
      objectTypes: ['Location'],
    },
    {
      name: 'enemy_of',
      kind: 'relationship',
      subjectTypes: ['Character', 'Persona', 'Organization'],
      objectTypes: ['Character', 'Persona', 'Organization'],
    },
    {
      name: 'ally_of',
      kind: 'relationship',
      subjectTypes: ['Character', 'Persona', 'Organization'],
      objectTypes: ['Character', 'Persona', 'Organization'],
    },
    {
      name: 'lover_of',
      kind: 'relationship',
      subjectTypes: ['Character', 'Persona'],
      objectTypes: ['Character', 'Persona'],
    },
    { name: 'has_persona', kind: 'relationship', subjectTypes: ['Character'], objectTypes: ['Persona'] },
    {
      name: 'owns',
      kind: 'relationship',
      subjectTypes: ['Character', 'Persona', 'Organization'],
      objectTypes: ['Artifact', 'Glossary'],
    },
    { name: 'age', kind: 'scalar', subjectTypes: ['Character'] },
    { name: 'gender', kind: 'scalar', subjectTypes: ['Character'] },
    { name: 'cultivation rank', kind: 'scalar', subjectTypes: ['Character'] },
    { name: 'status', kind: 'scalar', subjectTypes: ['Character', 'Persona'] },
  ],
};

export const ONTOLOGY_PROBLEMS: OntologyProblem[] = [
  { line: 8, code: 'entity-type-unknown', params: { type: 'weapon', predicate: 'owns', key: 'object' } },
  { line: 17, code: 'property-not-multiple', params: { property: 'alias', type: 'Persona' } },
  { line: 23, code: 'type-list-invalid', params: { predicate: 'sworn to', key: 'object' } },
];

export type JadeRiverEdition = 'en' | 'zh';

export function jadeRiverNovel(edition: JadeRiverEdition = 'en'): LibraryNovel {
  return {
    ...NOVELS[6],
    id: 'n-jade-river',
    originalTitle: edition === 'zh' ? '玉河' : 'The Jade River',
    title: 'The Jade River',
    author: 'Mara Vale',
    description: 'A ferryman’s daughter follows a stolen seal into the rival courts of the Jade River.',
    descriptionVi: 'Con gái người lái đò lần theo một ấn tín bị đánh cắp vào những triều đình đối địch bên sông Ngọc.',
    language: edition,
    tags: ['Fantasy', 'Mystery'],
    chapterCount: 40,
    characterCount: '0.2M',
    analysedCount: 30,
    translatedCount: 0,
    taskStatus: 'completed',
    appTags: ['analysed'],
    source: 'the-jade-river.epub',
    folder: 'sources\\novels\\n-jade-river\\',
  };
}

export const JADE_RIVER_NOVEL: LibraryNovel = jadeRiverNovel('en');

export const UNANALYSED_NOVEL: LibraryNovel = NOVELS[6];

export const ANALYSIS_NOVELS: LibraryNovel[] = [JADE_RIVER_NOVEL, UNANALYSED_NOVEL];

export const ENTITY_SEEDS: {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  zh: string;
  zhAliases: string[];
}[] = [
  { id: 'lin-yue', type: 'Character', name: 'Lin Yue', aliases: ['Yue'], zh: '林月', zhAliases: ['月儿'] },
  { id: 'mei-ren', type: 'Character', name: 'Mei Ren', aliases: ['Mei'], zh: '梅仁', zhAliases: ['阿梅'] },
  { id: 'master-qiao', type: 'Character', name: 'Master Qiao', aliases: ['Qiao'], zh: '乔师父', zhAliases: ['乔'] },
  { id: 'shen-wu', type: 'Character', name: 'Shen Wu', aliases: [], zh: '沈武', zhAliases: [] },
  { id: 'lady-bai', type: 'Character', name: 'Lady Bai', aliases: [], zh: '白夫人', zhAliases: [] },
  { id: 'captain-wei', type: 'Character', name: 'Captain Wei', aliases: ['Wei'], zh: '魏队长', zhAliases: ['魏'] },
  { id: 'prince-jian', type: 'Character', name: 'Prince Jian', aliases: ['Jian'], zh: '简王爷', zhAliases: ['简'] },
  { id: 'old-fen', type: 'Character', name: 'Old Fen', aliases: [], zh: '芬老', zhAliases: [] },
  { id: 'nian', type: 'Character', name: 'Nian', aliases: [], zh: '年宁', zhAliases: [] },
  { id: 'tao', type: 'Character', name: 'Tao', aliases: [], zh: '陶然', zhAliases: [] },
  { id: 'zhao-lei', type: 'Character', name: 'Zhao Lei', aliases: [], zh: '赵雷', zhAliases: [] },
  { id: 'hu-dan', type: 'Character', name: 'Hu Dan', aliases: [], zh: '胡丹', zhAliases: [] },
  { id: 'sister-lian', type: 'Character', name: 'Sister Lian', aliases: ['Lian'], zh: '莲姐', zhAliases: ['阿莲'] },
  { id: 'elder-su', type: 'Character', name: 'Elder Su', aliases: [], zh: '苏长老', zhAliases: [] },
  { id: 'han-qi', type: 'Character', name: 'Han Qi', aliases: [], zh: '韩祁', zhAliases: [] },
  { id: 'yu-ning', type: 'Character', name: 'Yu Ning', aliases: [], zh: '余宁', zhAliases: [] },
  { id: 'river-ghost', type: 'Persona', name: 'River Ghost', aliases: ['the Ghost'], zh: '河鬼', zhAliases: ['鬼影'] },
  {
    id: 'jade-river-place',
    type: 'Location',
    name: 'Jade River',
    aliases: ['the river'],
    zh: '玉河',
    zhAliases: ['河'],
  },
  { id: 'east-ferry', type: 'Location', name: 'East Ferry', aliases: [], zh: '东渡', zhAliases: [] },
  { id: 'mistwatch', type: 'Location', name: 'Mistwatch', aliases: [], zh: '望雾', zhAliases: [] },
  { id: 'lotus-house', type: 'Location', name: 'Lotus House', aliases: [], zh: '莲花楼', zhAliases: [] },
  { id: 'white-crane-hall', type: 'Location', name: 'White Crane Hall', aliases: [], zh: '白鹤堂', zhAliases: [] },
  { id: 'moon-gate', type: 'Location', name: 'Moon Gate', aliases: [], zh: '月门', zhAliases: [] },
  { id: 'deep-archive', type: 'Location', name: 'Deep Archive', aliases: [], zh: '深藏阁', zhAliases: [] },
  { id: 'stone-market', type: 'Location', name: 'Stone Market', aliases: [], zh: '石市', zhAliases: [] },
  {
    id: 'river-wardens',
    type: 'Organization',
    name: 'River Wardens',
    aliases: ['Wardens'],
    zh: '护河卫',
    zhAliases: ['河卫'],
  },
  { id: 'white-crane-sect', type: 'Organization', name: 'White Crane Sect', aliases: [], zh: '白鹤门', zhAliases: [] },
  { id: 'ash-court', type: 'Organization', name: 'Ash Court', aliases: [], zh: '灰烬廷', zhAliases: [] },
  { id: 'ferry-guild', type: 'Organization', name: 'Ferry Guild', aliases: [], zh: '渡船行会', zhAliases: [] },
  { id: 'night-lanterns', type: 'Organization', name: 'Night Lanterns', aliases: [], zh: '夜灯会', zhAliases: [] },
  { id: 'jade-seal', type: 'Artifact', name: 'jade seal', aliases: ['seal'], zh: '玉印', zhAliases: ['印信'] },
  { id: 'moon-script', type: 'Glossary', name: 'moon script', aliases: [], zh: '月文', zhAliases: [] },
  { id: 'spirit-root', type: 'Glossary', name: 'spirit root', aliases: [], zh: '灵根', zhAliases: [] },
  { id: 'river-oath', type: 'Glossary', name: 'river oath', aliases: [], zh: '河誓', zhAliases: [] },
  {
    id: 'jade-river-term',
    type: 'Glossary',
    name: 'Jade River',
    aliases: ['jade current'],
    zh: '玉河',
    zhAliases: ['玉流'],
  },
];

const BY_ID = new Map(ENTITY_SEEDS.map((entity) => [entity.id, entity]));
const CHARACTERS = ENTITY_SEEDS.filter((entity) => entity.type === 'Character');
const LOCATIONS = ENTITY_SEEDS.filter((entity) => entity.type === 'Location');
const ORGANIZATIONS = ENTITY_SEEDS.filter((entity) => entity.type === 'Organization');
const TERMS = ENTITY_SEEDS.filter((entity) => entity.type === 'Glossary');

interface LinkSeed {
  subjectId: string;
  predicate: string;
  objectId: string;
  quote: string;
}

interface ScalarSeed {
  subjectId: string;
  predicate: string;
  quote: string;
}

interface Scene {
  title: string;
  paragraphs: string[];
  links: LinkSeed[];
  scalars: ScalarSeed[];
}

const OPENING_SCENES: Scene[] = [
  {
    title: 'The Ferry at Dawn',
    paragraphs: [
      'Mist lay low on the Jade River, turning the ferry ropes silver. Lin Yue counted the boats before the morning bell and found one missing.',
      'Old Fen waited on the East Ferry steps with a wet ledger under his coat. Old Fen was Lin Yue’s father. He would not say which boat had gone, though the empty berth told her enough.',
      'Mei Ren arrived carrying bread wrapped in cloth. Mei Ren promised to aid Lin Yue, even if the River Wardens closed every crossing.',
      'Lin Yue crossed into East Ferry before dusk. The tide had already pulled a trail of pale reeds away from the landing.',
      'Old Fen handed the jade seal to Lin Yue. Its carved face held a river mark older than any ferry license.',
      'Captain Wei searched the boats while his guards questioned the fishermen. Lin Yue hid the seal beneath a loose board.',
      'Lin Yue was seventeen that spring. She had spent nearly every one of those years on the water, yet had never seen the river this still.',
      'At the market bell, Mei Ren drew Captain Wei toward the northern quay. Old Fen watched without speaking.',
      'After nightfall, the missing boat drifted back empty. A single white feather clung to its oarlock.',
    ],
    links: [
      {
        subjectId: 'mei-ren',
        predicate: 'ally_of',
        objectId: 'lin-yue',
        quote: 'Mei Ren promised to aid Lin Yue, even if the River Wardens closed every crossing.',
      },
      {
        subjectId: 'lin-yue',
        predicate: 'located_in',
        objectId: 'east-ferry',
        quote: 'Lin Yue crossed into East Ferry before dusk.',
      },
      {
        subjectId: 'lin-yue',
        predicate: 'owns',
        objectId: 'jade-seal',
        quote: 'Old Fen handed the jade seal to Lin Yue.',
      },
      { subjectId: 'old-fen', predicate: 'parent_of', objectId: 'lin-yue', quote: 'Old Fen was Lin Yue’s father.' },
    ],
    scalars: [{ subjectId: 'lin-yue', predicate: 'age', quote: 'Lin Yue was seventeen that spring.' }],
  },
  {
    title: 'The White Crane Letter',
    paragraphs: [
      'Rain swept across White Crane Hall and soaked the letter in Lin Yue’s hand. The seal on its back was the same shape as the stolen mark.',
      'Master Qiao welcomed Lin Yue beneath the carved eaves. His voice was gentle, but he kept one hand on the door latch.',
      'Master Qiao taught Mei Ren to read the moon script. She sounded out each curve while the lamps burned down.',
      'Sister Lian belonged to the White Crane Sect. Mei Ren was Sister Lian’s younger sister. She recognized the handwriting and asked to see the page alone.',
      'Mei Ren carried the moon script through the rain. The paper stayed dry inside her sleeve.',
      'The hall smelled of pine smoke and old ink. Someone had scraped a name from the foot of the letter.',
      'Mei Ren could hold the breath rank for only a moment. Master Qiao told her that patience would matter more than speed.',
      'A bell rang twice above the courtyard. Sister Lian folded the letter before its final sentence could be read aloud.',
      'By evening, the road to East Ferry had disappeared beneath floodwater. They slept in the library among maps of vanished banks.',
    ],
    links: [
      {
        subjectId: 'master-qiao',
        predicate: 'master_of',
        objectId: 'mei-ren',
        quote: 'Master Qiao taught Mei Ren to read the moon script.',
      },
      {
        subjectId: 'sister-lian',
        predicate: 'member_of',
        objectId: 'white-crane-sect',
        quote: 'Sister Lian belonged to the White Crane Sect.',
      },
      {
        subjectId: 'mei-ren',
        predicate: 'owns',
        objectId: 'moon-script',
        quote: 'Mei Ren carried the moon script through the rain.',
      },
      {
        subjectId: 'mei-ren',
        predicate: 'sibling_of',
        objectId: 'sister-lian',
        quote: 'Mei Ren was Sister Lian’s younger sister.',
      },
    ],
    scalars: [
      {
        subjectId: 'mei-ren',
        predicate: 'cultivation rank',
        quote: 'Mei Ren could hold the breath rank for only a moment.',
      },
    ],
  },
  {
    title: 'The Ghost at Moon Gate',
    paragraphs: [
      'The Moon Gate opened only after the last watch bell. Lin Yue waited beneath its arch with the jade seal tucked in her sleeve.',
      'The River Ghost was Lin Yue in a borrowed mask. She had invented the name so the Ash Court would chase a rumor instead of a daughter.',
      'The River Ghost crossed into Moon Gate before dawn. No guard saw her slip between the lanterns.',
      'Shen Wu led the Ash Court from a room above the gate. He kept a list of every face admitted that night.',
      'Lady Bai vowed to oppose Shen Wu. Her warning reached Lin Yue in the form of a torn red ribbon.',
      'Below the arch, the old stones sweated with river mist. Lin Yue heard a boatman singing somewhere beyond the wall.',
      'She held her breath as a guard turned the corner. Lin Yue still loved Mei Ren. The mask smelled faintly of cedar and fresh paint.',
      'At sunrise, the gate was sealed again. Shen Wu found only a white feather on the threshold.',
      'Lin Yue walked away without looking back. For the first time, the River Ghost felt more real than her own name.',
    ],
    links: [
      {
        subjectId: 'lin-yue',
        predicate: 'has_persona',
        objectId: 'river-ghost',
        quote: 'The River Ghost was Lin Yue in a borrowed mask.',
      },
      {
        subjectId: 'river-ghost',
        predicate: 'located_in',
        objectId: 'moon-gate',
        quote: 'The River Ghost crossed into Moon Gate before dawn.',
      },
      {
        subjectId: 'shen-wu',
        predicate: 'leads',
        objectId: 'ash-court',
        quote: 'Shen Wu led the Ash Court from a room above the gate.',
      },
      { subjectId: 'lady-bai', predicate: 'enemy_of', objectId: 'shen-wu', quote: 'Lady Bai vowed to oppose Shen Wu.' },
      { subjectId: 'lin-yue', predicate: 'lover_of', objectId: 'mei-ren', quote: 'Lin Yue still loved Mei Ren.' },
    ],
    scalars: [{ subjectId: 'lin-yue', predicate: 'status', quote: 'Lin Yue walked away without looking back.' }],
  },
  {
    title: 'The Archive Below',
    paragraphs: [
      'Deep Archive stood under the old river wall. Its steps descended until the air tasted of wet stone.',
      'Lady Bai brought Lin Yue into Deep Archive through a locked service door. Behind them, the river pressed softly against the masonry.',
      'Prince Jian pledged service to the River Wardens. Prince Jian was a disciple of Master Qiao. His signature filled an entire line of the accession book.',
      'Lady Bai promised to aid Lin Yue. The promise was quiet enough that only the shelves could hear it.',
      'Lin Yue was eighteen by the time the flood reached the archive. She no longer looked for permission before opening a forbidden drawer.',
      'Inside lay a map of the Jade River and a second document that called its hidden channel the Jade River. The same name described a place and an old navigators’ term.',
      'Old Fen had marked a narrow path in charcoal. Lin Yue followed it with one finger, tracing a way beneath Moon Gate.',
      'A stone shifted somewhere in the dark. Prince Jian took the lamp while Lady Bai closed the book.',
      'They left before the water reached the bottom stair. On the surface, no one knew the archive had been opened.',
    ],
    links: [
      { subjectId: 'lady-bai', predicate: 'ally_of', objectId: 'lin-yue', quote: 'Lady Bai promised to aid Lin Yue.' },
      {
        subjectId: 'prince-jian',
        predicate: 'member_of',
        objectId: 'river-wardens',
        quote: 'Prince Jian pledged service to the River Wardens.',
      },
      {
        subjectId: 'lin-yue',
        predicate: 'located_in',
        objectId: 'deep-archive',
        quote: 'Lady Bai brought Lin Yue into Deep Archive through a locked service door.',
      },
      {
        subjectId: 'master-qiao',
        predicate: 'master_of',
        objectId: 'prince-jian',
        quote: 'Prince Jian was a disciple of Master Qiao.',
      },
    ],
    scalars: [
      {
        subjectId: 'lin-yue',
        predicate: 'age',
        quote: 'Lin Yue was eighteen by the time the flood reached the archive.',
      },
    ],
  },
];

const OPENING_ZH: { title: string; paragraphs: string[]; linkQuotes: string[]; scalarQuotes: string[] }[] = [
  {
    title: '黎明渡口',
    paragraphs: [
      '晨雾低垂在玉河上，把渡船的缆绳染成银色。林月在晨钟前清点船只，发现少了一艘。',
      '芬老站在东渡的台阶上，把湿透的账簿藏在外衣里。芬老是林月的父亲。他不肯说是哪艘船离开了，可空荡的泊位已经说明一切。',
      '梅仁带来用布包着的面包。梅仁答应帮助林月，哪怕护河卫封锁所有渡口。',
      '林月在黄昏前走进东渡。潮水已把一串浅色芦苇从码头卷走。',
      '芬老把玉印交给林月。印面刻着一道河纹，比任何渡船执照都古老。',
      '魏队长搜查船只，手下则盘问渔民。林月把印信藏在一块松动的木板下。',
      '那年春天，林月十七岁。她几乎一生都在水上度过，却从未见过这条河如此平静。',
      '集市钟声响起时，梅仁把魏队长引向北岸。芬老默默看着。',
      '入夜后，失踪的船空荡荡地漂了回来。一根白羽卡在桨架上。',
    ],
    linkQuotes: [
      '梅仁答应帮助林月，哪怕护河卫封锁所有渡口。',
      '林月在黄昏前走进东渡。',
      '芬老把玉印交给林月。',
      '芬老是林月的父亲。',
    ],
    scalarQuotes: ['那年春天，林月十七岁。'],
  },
  {
    title: '白鹤来信',
    paragraphs: [
      '雨扫过白鹤堂，淋湿了林月手中的信。信背的封印与失窃的印记形状相同。',
      '乔师父在雕花屋檐下迎接林月。他语气温和，一只手却始终按着门闩。',
      '乔师父教梅仁辨读月文。油灯渐暗，她仍逐笔念出那些弯曲的字迹。',
      '莲姐是白鹤门弟子。梅仁是莲姐的妹妹。她认出了笔迹，请求独自看那一页。',
      '梅仁冒雨带着月文前行。纸张藏在袖中，始终没有沾湿。',
      '堂内弥漫着松烟和旧墨的气味。有人刮掉了信末的一个名字。',
      '梅仁只能维持吐息境片刻。乔师父告诉她，耐心比速度更重要。',
      '院上方的钟响了两声。莲姐在末句念出之前折起了信。',
      '到了傍晚，通往东渡的路已淹没在洪水中。他们睡在藏书室里，身旁是消失河岸的旧地图。',
    ],
    linkQuotes: ['乔师父教梅仁辨读月文。', '莲姐是白鹤门弟子。', '梅仁冒雨带着月文前行。', '梅仁是莲姐的妹妹。'],
    scalarQuotes: ['梅仁只能维持吐息境片刻。'],
  },
  {
    title: '月门鬼影',
    paragraphs: [
      '月门只在最后一声更鼓后开启。林月站在门洞下等待，把玉印藏在袖中。',
      '河鬼就是戴着借来面具的林月。她编出这个名号，好让灰烬廷追逐传闻，而不是追查一个女儿。',
      '河鬼在黎明前穿过月门。守卫没看见她从灯笼之间溜过。',
      '沈武在门楼上的房间里统领灰烬廷。他记下了那夜每一个获准入内的人。',
      '白夫人发誓反对沈武。她的警告化作一条撕破的红绸，送到了林月手中。',
      '拱门下的旧石沁出河雾。林月听见墙外某处传来船夫的歌声。',
      '守卫转过拐角时，她屏住呼吸。林月依然爱着梅仁。面具带着淡淡的雪松和新漆气味。',
      '日出时，城门再次封闭。沈武只在门槛上找到一根白羽。',
      '林月头也不回地离开。河鬼第一次显得比她自己的名字还真实。',
    ],
    linkQuotes: [
      '河鬼就是戴着借来面具的林月。',
      '河鬼在黎明前穿过月门。',
      '沈武在门楼上的房间里统领灰烬廷。',
      '白夫人发誓反对沈武。',
      '林月依然爱着梅仁。',
    ],
    scalarQuotes: ['林月头也不回地离开。'],
  },
  {
    title: '地下藏阁',
    paragraphs: [
      '深藏阁坐落在旧河墙之下。石阶一路向下，直到空气里也有了湿石的味道。',
      '白夫人带林月从一扇锁着的侧门进入深藏阁。身后，河水轻轻拍打砖墙。',
      '简王爷宣誓效忠护河卫。简王爷是乔师父的弟子。他的签名占满了登记簿的一整行。',
      '白夫人答应帮助林月。那承诺轻得只有书架听得见。',
      '洪水涨到藏阁时，林月已经十八岁。她打开禁用的抽屉前，不再等谁的许可。',
      '里面有一张玉河地图，还有一份把暗渠也称作玉河的文书。同一个名字既指地点，也指古代领航人的术语。',
      '芬老用炭笔标出一条狭路。林月用手指沿着它，找到月门下方的通道。',
      '黑暗中传来石块挪动的声音。简王爷拿起灯，白夫人合上书。',
      '水漫到最下面的台阶前，他们离开了。地面上无人知道藏阁曾被打开。',
    ],
    linkQuotes: [
      '白夫人答应帮助林月。',
      '简王爷宣誓效忠护河卫。',
      '白夫人带林月从一扇锁着的侧门进入深藏阁。',
      '简王爷是乔师父的弟子。',
    ],
    scalarQuotes: ['洪水涨到藏阁时，林月已经十八岁。'],
  },
];

function openingScene(index: number, edition: JadeRiverEdition): Scene {
  const scene = OPENING_SCENES[index - 1];
  if (edition === 'en') return scene;
  const zh = OPENING_ZH[index - 1];
  return {
    title: zh.title,
    paragraphs: zh.paragraphs,
    links: scene.links.map((link, position) => ({ ...link, quote: zh.linkQuotes[position] })),
    scalars: scene.scalars.map((scalar, position) => ({ ...scalar, quote: zh.scalarQuotes[position] })),
  };
}

function nameOf(id: string, edition: JadeRiverEdition): string {
  const seed = BY_ID.get(id);
  return (edition === 'zh' ? seed?.zh : seed?.name) ?? id;
}

function genericQuote(subjectId: string, predicate: string, objectId: string, edition: JadeRiverEdition): string {
  const subject = nameOf(subjectId, edition);
  const object = nameOf(objectId, edition);
  if (edition === 'zh') {
    if (predicate === 'located_in') return `${subject}在黄昏前走进${object}。`;
    if (predicate === 'member_of') return `${subject}宣誓效忠${object}。`;
    if (predicate === 'owns') return `${subject}冒雨带着${object}前行。`;
    if (predicate === 'enemy_of') return `${subject}发誓反对${object}。`;
    return `${subject}答应帮助${object}。`;
  }
  if (predicate === 'located_in') return `${subject} crossed into ${object} before dusk.`;
  if (predicate === 'member_of') return `${subject} pledged service to ${object}.`;
  if (predicate === 'owns') return `${subject} carried ${object} through the rain.`;
  if (predicate === 'enemy_of') return `${subject} vowed to oppose ${object}.`;
  return `${subject} promised to aid ${object}.`;
}

function genericScene(index: number, edition: JadeRiverEdition): Scene {
  const lead = CHARACTERS[(index - 5) % CHARACTERS.length];
  const partner = CHARACTERS[(index * 3 + 1) % CHARACTERS.length];
  const rival = CHARACTERS[(index * 5 + 3) % CHARACTERS.length];
  const location = LOCATIONS[(index * 3) % LOCATIONS.length];
  const group = ORGANIZATIONS[(index * 2) % ORGANIZATIONS.length];
  const term = TERMS[index % TERMS.length];
  const relations: [string, string, string][] = [
    [lead.id, 'located_in', location.id],
    [partner.id, 'member_of', group.id],
    [lead.id, index % 2 === 0 ? 'ally_of' : 'enemy_of', rival.id],
    [partner.id, 'owns', term.id],
  ];
  const links = relations.map(([subjectId, predicate, objectId]) => ({
    subjectId,
    predicate,
    objectId,
    quote: genericQuote(subjectId, predicate, objectId, edition),
  }));
  const leadName = nameOf(lead.id, edition);
  const partnerName = nameOf(partner.id, edition);
  const rivalName = nameOf(rival.id, edition);
  if (edition === 'zh')
    return {
      title: `第${index}章：河畔长路`,
      paragraphs: [
        `河边的路向东弯去，${leadName}顺着晨潮前行。一只红鸢在浅滩上盘旋。`,
        `船夫说起玉河，可风一起，他的说法就变了。${partnerName}站在岸边听着。`,
        ...links.map((link) => `${link.quote}这个决定在渡河之后仍被人记起。`),
        `正午，${rivalName}发现芦苇旁有新的脚印。没人承认是自己留下的。`,
        `最后一艘船在灰色天空下离岸。${leadName}一直守望，直到灯光消失。`,
        '入夜后，旅人们找到了住处。紧闭的窗外，河水仍在流动。',
      ],
      links,
      scalars: [],
    };
  return {
    title: `Chapter ${index}: The River Road`,
    paragraphs: [
      `The river road bent east as ${lead.name} followed the morning tide. A red kite circled over the shallows.`,
      `A ferryman spoke of the Jade River, but his account changed whenever the wind rose. ${partner.name} listened from the bank.`,
      ...links.map((link) => `${link.quote} The decision would be remembered after the crossing.`),
      `At noon, ${rival.name} noticed fresh footprints near the reeds. No one admitted to leaving them.`,
      `The last boat departed under a sky the color of ash. ${lead.name} kept watch until its lamp vanished.`,
      `By night, the travelers had found shelter. The water kept moving beyond the shuttered windows.`,
    ],
    links,
    scalars: [],
  };
}

function countsFor(entities: AnalysisEntity[], facts: AnalysisFact[]): ChapterAnalysisCounts {
  const items: { status: ItemStatus }[] = [...entities, ...facts];
  return {
    entities: entities.length,
    facts: facts.length,
    verified: items.filter((item) => item.status === 'verified').length,
    failed: items.filter((item) => item.status === 'failed').length,
    accepted: items.filter((item) => item.status === 'accepted').length,
    rejected: items.filter((item) => item.status === 'rejected').length,
  };
}

function makeAnalysisChapter(index: number, edition: JadeRiverEdition): ChapterAnalysis {
  const scene = index <= 4 ? openingScene(index, edition) : genericScene(index, edition);
  const status: ChapterAnalysisStatus =
    index <= 25
      ? 'clean'
      : index <= 28
        ? 'has-issues'
        : index <= 30
          ? 'stale'
          : index <= 32
            ? 'failed'
            : 'not-analysed';
  const hasResult = status === 'clean' || status === 'has-issues' || status === 'stale';
  const ids = new Set<string>();
  if (hasResult) {
    for (const link of scene.links) {
      ids.add(link.subjectId);
      ids.add(link.objectId);
    }
    for (const scalar of scene.scalars) ids.add(scalar.subjectId);
  }
  if (index === 26) ids.add('ash-court-place');
  if (index === 27) {
    ids.add('invalid-crown');
    ids.add('elder-su');
  }
  if (index === 28) {
    ids.add('silent-oracle');
    ids.add('master-qiao');
  }
  if (index === 4) {
    ids.add('jade-river-place');
    ids.add('jade-river-term');
  }
  const entities: AnalysisEntity[] = [...ids].map((id) => {
    if (id === 'invalid-crown') {
      return {
        id,
        type: 'unknown',
        name: edition === 'zh' ? '青铜冠' : 'bronze crown',
        aliases: [],
        wordsFound: [edition === 'zh' ? '青铜冠' : 'bronze crown'],
        status: 'failed',
        reason: 'entity-not-in-ontology',
      };
    }
    if (id === 'silent-oracle') {
      return {
        id,
        type: 'Character',
        name: edition === 'zh' ? '无声先知' : 'Silent Oracle',
        aliases: [],
        wordsFound: [],
        status: 'failed',
        reason: 'words-not-found',
      };
    }
    if (id === 'ash-court-place') {
      const name = nameOf('ash-court', edition);
      return { id, type: 'Location', name, aliases: [], wordsFound: [name], status: 'verified' };
    }
    const seed = BY_ID.get(id)!;
    const name = nameOf(id, edition);
    const aliases = edition === 'zh' ? seed.zhAliases : seed.aliases;
    const extra = index === 28 && id === 'master-qiao' ? [nameOf('elder-su', edition)] : [];
    return {
      id: seed.id,
      type: seed.type,
      name,
      aliases: [...aliases, ...extra],
      wordsFound: [name],
      status: 'verified',
    };
  });
  const facts: AnalysisFact[] = hasResult
    ? [
        ...scene.links.map((link, position) => ({
          id: `c${index}-r${position + 1}`,
          kind: 'relationship' as const,
          predicate: link.predicate,
          subjectId: link.subjectId,
          objectId: link.objectId,
          quote: link.quote,
          status: 'verified' as const,
        })),
        ...scene.scalars.map((scalar, position) => ({
          id: `c${index}-s${position + 1}`,
          kind: 'scalar' as const,
          predicate: scalar.predicate,
          subjectId: scalar.subjectId,
          quote: scalar.quote,
          status: 'verified' as const,
        })),
      ]
    : [];
  if (index === 26) {
    facts.push({
      id: 'c26-missing-quote',
      kind: 'relationship',
      predicate: 'ally_of',
      subjectId: scene.links[0].subjectId,
      objectId: scene.links[2].objectId,
      quote:
        edition === 'zh'
          ? '一条银龙从河中升起，称他们为盟友。'
          : 'A silver dragon rose from the river and named them allies.',
      status: 'failed',
      reason: 'quote-not-found',
    });
    facts.push({
      id: 'c26-accepted-quote',
      kind: 'relationship',
      predicate: 'ally_of',
      subjectId: scene.links[1].subjectId,
      objectId: scene.links[0].subjectId,
      quote: edition === 'zh' ? '他们在流星下缔结盟约。' : 'They sealed their pact beneath a falling star.',
      status: 'failed',
      reason: 'quote-not-found',
    });
  }
  if (index === 27) {
    facts.push({
      id: 'c27-rejected-predicate',
      kind: 'relationship',
      predicate: 'sworn to',
      subjectId: scene.links[0].subjectId,
      objectId: scene.links[2].objectId,
      quote: null,
      status: 'failed',
      reason: 'predicate-not-in-ontology',
    });
  }
  if (index === 28) {
    facts.push({
      id: 'c28-invalid-rank',
      kind: 'scalar',
      predicate: 'cultivation rank',
      subjectId: scene.links[0].subjectId,
      quote:
        edition === 'zh'
          ? `${nameOf(scene.links[0].subjectId, edition)}称新境界为星君。`
          : `${nameOf(scene.links[0].subjectId, edition)} called the new rank star sovereign.`,
      status: 'failed',
      reason: 'quote-not-found',
    });
  }
  const paragraphs = [...scene.paragraphs];
  if (index === 26)
    paragraphs.push(
      edition === 'zh'
        ? `${nameOf('ash-court', edition)}矗立在对岸，城墙被旧烟熏得发黑。`
        : `The ${nameOf('ash-court', edition)} rose on the far bank, its walls black with old smoke.`,
    );
  if (index === 27)
    paragraphs.push(
      edition === 'zh'
        ? `${nameOf('elder-su', edition)}在藏经阁前清点卷轴。`
        : `${nameOf('elder-su', edition)} counted the scrolls outside the archive.`,
    );
  if (index === 28)
    paragraphs.push(
      edition === 'zh'
        ? `${nameOf('master-qiao', edition)}，弟子们称他为${nameOf('elder-su', edition)}，在门口等候。`
        : `${nameOf('master-qiao', edition)}, whom the novices called ${nameOf('elder-su', edition)}, waited at the gate.`,
    );
  if (index === 27)
    paragraphs.push(
      edition === 'zh'
        ? '一顶青铜冠锁在箱中，没人知道是谁放进去的。'
        : 'A bronze crown lay in a locked box, but no one knew who had placed it there.',
    );
  if (index === 28)
    paragraphs.push(
      edition === 'zh'
        ? `${nameOf(scene.links[0].subjectId, edition)}称新境界为星君。`
        : `${nameOf(scene.links[0].subjectId, edition)} called the new rank star sovereign.`,
    );
  const file = index.toString(16).padStart(64, '0');
  return {
    index,
    title: scene.title,
    file,
    ...(hasResult ? { resultFile: status === 'stale' ? `f${file.slice(1)}` : file } : {}),
    status,
    counts: countsFor(entities, facts),
    pending: false,
    ...(status === 'failed'
      ? {
          error: index === 31 ? 'LLM_TIMEOUT' : 'ANALYSIS_LLM_OUTPUT_INVALID',
        }
      : {}),
    paragraphs,
    entities,
    facts,
  };
}

export function jadeRiverChapters(edition: JadeRiverEdition = 'en'): ChapterAnalysis[] {
  return Array.from({ length: 40 }, (_, index) => makeAnalysisChapter(index + 1, edition));
}

export const JADE_RIVER_CHAPTERS: ChapterAnalysis[] = jadeRiverChapters('en');

export const UNANALYSED_CHAPTERS: ChapterAnalysis[] = makeChapters(UNANALYSED_NOVEL).map((chapter) => ({
  index: chapter.position,
  title: chapter.title,
  file: chapter.file,
  status: 'not-analysed',
  counts: countsFor([], []),
  pending: false,
  paragraphs: [],
  entities: [],
  facts: [],
}));

export const JADE_RIVER_PENDING = [26, 27, 28];

export const JADE_RIVER_REVIEW_EDITS: ReviewEdit[] = [
  { kind: 'review-reject', chapterIndex: 26, itemKind: 'fact', itemId: 'c26-accepted-quote' },
  { kind: 'review-reject', chapterIndex: 27, itemKind: 'fact', itemId: 'c27-rejected-predicate' },
  { kind: 'review-reject', chapterIndex: 28, itemKind: 'entity', itemId: 'silent-oracle' },
  { kind: 'review-reject', chapterIndex: 28, itemKind: 'fact', itemId: 'c28-invalid-rank' },
];

export function jadeRiverOverlay(edition: JadeRiverEdition = 'en'): OverlayEdit[] {
  return [
    { kind: 'entity-add-alias', entityId: 'lin-yue', alias: edition === 'zh' ? '小月' : 'Little Yue' },
    {
      kind: 'fact-add',
      chapterIndex: 4,
      fact: {
        id: 'c4-user-alliance',
        kind: 'relationship',
        predicate: 'ally_of',
        subjectId: 'lin-yue',
        objectId: 'lady-bai',
        quote: null,
        status: 'verified',
        addedByUser: true,
      },
    },
    { kind: 'entity-rename', entityId: 'removed-in-rerun', name: edition === 'zh' ? '旧名' : 'Old Name' },
  ];
}

export const JADE_RIVER_OVERLAY: OverlayEdit[] = jadeRiverOverlay('en');
