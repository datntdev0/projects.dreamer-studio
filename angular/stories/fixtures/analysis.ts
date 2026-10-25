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
  entityTypes: ['character', 'persona', 'location', 'organization', 'glossary'],
  predicates: [
    { name: 'parent of', kind: 'relationship', subjectTypes: ['character'], objectTypes: ['character'] },
    { name: 'sibling of', kind: 'relationship', subjectTypes: ['character'], objectTypes: ['character'] },
    { name: 'master of', kind: 'relationship', subjectTypes: ['character'], objectTypes: ['character'] },
    { name: 'disciple of', kind: 'relationship', subjectTypes: ['character'], objectTypes: ['character'] },
    { name: 'member of', kind: 'relationship', subjectTypes: ['character', 'persona'], objectTypes: ['organization'] },
    { name: 'leader of', kind: 'relationship', subjectTypes: ['character'], objectTypes: ['organization'] },
    {
      name: 'located in',
      kind: 'relationship',
      subjectTypes: ['character', 'persona', 'organization', 'location'],
      objectTypes: ['location'],
    },
    {
      name: 'enemy of',
      kind: 'relationship',
      subjectTypes: ['character', 'persona', 'organization'],
      objectTypes: ['character', 'persona', 'organization'],
    },
    {
      name: 'ally of',
      kind: 'relationship',
      subjectTypes: ['character', 'persona', 'organization'],
      objectTypes: ['character', 'persona', 'organization'],
    },
    {
      name: 'loves',
      kind: 'relationship',
      subjectTypes: ['character', 'persona'],
      objectTypes: ['character', 'persona'],
    },
    { name: 'persona of', kind: 'relationship', subjectTypes: ['persona'], objectTypes: ['character'] },
    {
      name: 'owns',
      kind: 'relationship',
      subjectTypes: ['character', 'persona', 'organization'],
      objectTypes: ['glossary'],
    },
    {
      name: 'age',
      kind: 'scalar',
      subjectTypes: ['character'],
      allowedValues: Array.from({ length: 100 }, (_, age) => String(age + 1)),
    },
    {
      name: 'gender',
      kind: 'scalar',
      subjectTypes: ['character'],
      allowedValues: ['female', 'male', 'nonbinary', 'unknown'],
    },
    {
      name: 'cultivation rank',
      kind: 'scalar',
      subjectTypes: ['character'],
      allowedValues: ['mortal', 'breath', 'foundation', 'core', 'nascent'],
    },
    { name: 'status', kind: 'scalar', subjectTypes: ['character', 'persona'], allowedValues: ['alive', 'dead'] },
  ],
};

export const ONTOLOGY_PROBLEMS: OntologyProblem[] = [
  { line: 8, reason: 'Unknown entity type "artifact" in the owns predicate.' },
  { line: 17, reason: 'The cultivation rank predicate repeats the value "core".' },
  { line: 23, reason: 'The predicate "sworn to" has no object types.' },
];

export const JADE_RIVER_NOVEL: LibraryNovel = {
  ...NOVELS[6],
  id: 'n-jade-river',
  originalTitle: 'The Jade River',
  title: 'The Jade River',
  author: 'Mara Vale',
  description: 'A ferryman’s daughter follows a stolen seal into the rival courts of the Jade River.',
  descriptionVi: 'Con gái người lái đò lần theo một ấn tín bị đánh cắp vào những triều đình đối địch bên sông Ngọc.',
  language: 'en',
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

export const UNANALYSED_NOVEL: LibraryNovel = NOVELS[6];

export const ANALYSIS_NOVELS: LibraryNovel[] = [JADE_RIVER_NOVEL, UNANALYSED_NOVEL];

const ENTITY_SEEDS: { id: string; type: EntityType; name: string; aliases: string[] }[] = [
  { id: 'lin-yue', type: 'character', name: 'Lin Yue', aliases: ['Yue'] },
  { id: 'mei-ren', type: 'character', name: 'Mei Ren', aliases: ['Mei'] },
  { id: 'master-qiao', type: 'character', name: 'Master Qiao', aliases: ['Qiao'] },
  { id: 'shen-wu', type: 'character', name: 'Shen Wu', aliases: [] },
  { id: 'lady-bai', type: 'character', name: 'Lady Bai', aliases: [] },
  { id: 'captain-wei', type: 'character', name: 'Captain Wei', aliases: ['Wei'] },
  { id: 'prince-jian', type: 'character', name: 'Prince Jian', aliases: ['Jian'] },
  { id: 'old-fen', type: 'character', name: 'Old Fen', aliases: [] },
  { id: 'nian', type: 'character', name: 'Nian', aliases: [] },
  { id: 'tao', type: 'character', name: 'Tao', aliases: [] },
  { id: 'zhao-lei', type: 'character', name: 'Zhao Lei', aliases: [] },
  { id: 'hu-dan', type: 'character', name: 'Hu Dan', aliases: [] },
  { id: 'sister-lian', type: 'character', name: 'Sister Lian', aliases: ['Lian'] },
  { id: 'elder-su', type: 'character', name: 'Elder Su', aliases: [] },
  { id: 'han-qi', type: 'character', name: 'Han Qi', aliases: [] },
  { id: 'yu-ning', type: 'character', name: 'Yu Ning', aliases: [] },
  { id: 'river-ghost', type: 'persona', name: 'River Ghost', aliases: ['the Ghost'] },
  { id: 'jade-river-place', type: 'location', name: 'Jade River', aliases: ['the river'] },
  { id: 'east-ferry', type: 'location', name: 'East Ferry', aliases: [] },
  { id: 'mistwatch', type: 'location', name: 'Mistwatch', aliases: [] },
  { id: 'lotus-house', type: 'location', name: 'Lotus House', aliases: [] },
  { id: 'white-crane-hall', type: 'location', name: 'White Crane Hall', aliases: [] },
  { id: 'moon-gate', type: 'location', name: 'Moon Gate', aliases: [] },
  { id: 'deep-archive', type: 'location', name: 'Deep Archive', aliases: [] },
  { id: 'stone-market', type: 'location', name: 'Stone Market', aliases: [] },
  { id: 'river-wardens', type: 'organization', name: 'River Wardens', aliases: ['Wardens'] },
  { id: 'white-crane-sect', type: 'organization', name: 'White Crane Sect', aliases: [] },
  { id: 'ash-court', type: 'organization', name: 'Ash Court', aliases: [] },
  { id: 'ferry-guild', type: 'organization', name: 'Ferry Guild', aliases: [] },
  { id: 'night-lanterns', type: 'organization', name: 'Night Lanterns', aliases: [] },
  { id: 'jade-seal', type: 'glossary', name: 'jade seal', aliases: ['seal'] },
  { id: 'moon-script', type: 'glossary', name: 'moon script', aliases: [] },
  { id: 'spirit-root', type: 'glossary', name: 'spirit root', aliases: [] },
  { id: 'river-oath', type: 'glossary', name: 'river oath', aliases: [] },
  { id: 'jade-river-term', type: 'glossary', name: 'Jade River', aliases: ['jade current'] },
];

const BY_ID = new Map(ENTITY_SEEDS.map((entity) => [entity.id, entity]));
const CHARACTERS = ENTITY_SEEDS.filter((entity) => entity.type === 'character');
const LOCATIONS = ENTITY_SEEDS.filter((entity) => entity.type === 'location');
const ORGANIZATIONS = ENTITY_SEEDS.filter((entity) => entity.type === 'organization');
const TERMS = ENTITY_SEEDS.filter((entity) => entity.type === 'glossary');

interface LinkSeed {
  subjectId: string;
  predicate: string;
  objectId: string;
  quote: string;
}

interface ScalarSeed {
  subjectId: string;
  predicate: string;
  value: string;
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
        predicate: 'ally of',
        objectId: 'lin-yue',
        quote: 'Mei Ren promised to aid Lin Yue, even if the River Wardens closed every crossing.',
      },
      {
        subjectId: 'lin-yue',
        predicate: 'located in',
        objectId: 'east-ferry',
        quote: 'Lin Yue crossed into East Ferry before dusk.',
      },
      {
        subjectId: 'lin-yue',
        predicate: 'owns',
        objectId: 'jade-seal',
        quote: 'Old Fen handed the jade seal to Lin Yue.',
      },
      { subjectId: 'old-fen', predicate: 'parent of', objectId: 'lin-yue', quote: 'Old Fen was Lin Yue’s father.' },
    ],
    scalars: [{ subjectId: 'lin-yue', predicate: 'age', value: '17', quote: 'Lin Yue was seventeen that spring.' }],
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
        predicate: 'master of',
        objectId: 'mei-ren',
        quote: 'Master Qiao taught Mei Ren to read the moon script.',
      },
      {
        subjectId: 'sister-lian',
        predicate: 'member of',
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
        predicate: 'sibling of',
        objectId: 'sister-lian',
        quote: 'Mei Ren was Sister Lian’s younger sister.',
      },
    ],
    scalars: [
      {
        subjectId: 'mei-ren',
        predicate: 'cultivation rank',
        value: 'breath',
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
        subjectId: 'river-ghost',
        predicate: 'persona of',
        objectId: 'lin-yue',
        quote: 'The River Ghost was Lin Yue in a borrowed mask.',
      },
      {
        subjectId: 'river-ghost',
        predicate: 'located in',
        objectId: 'moon-gate',
        quote: 'The River Ghost crossed into Moon Gate before dawn.',
      },
      {
        subjectId: 'shen-wu',
        predicate: 'leader of',
        objectId: 'ash-court',
        quote: 'Shen Wu led the Ash Court from a room above the gate.',
      },
      { subjectId: 'lady-bai', predicate: 'enemy of', objectId: 'shen-wu', quote: 'Lady Bai vowed to oppose Shen Wu.' },
      { subjectId: 'lin-yue', predicate: 'loves', objectId: 'mei-ren', quote: 'Lin Yue still loved Mei Ren.' },
    ],
    scalars: [
      { subjectId: 'lin-yue', predicate: 'status', value: 'alive', quote: 'Lin Yue walked away without looking back.' },
    ],
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
      { subjectId: 'lady-bai', predicate: 'ally of', objectId: 'lin-yue', quote: 'Lady Bai promised to aid Lin Yue.' },
      {
        subjectId: 'prince-jian',
        predicate: 'member of',
        objectId: 'river-wardens',
        quote: 'Prince Jian pledged service to the River Wardens.',
      },
      {
        subjectId: 'lin-yue',
        predicate: 'located in',
        objectId: 'deep-archive',
        quote: 'Lady Bai brought Lin Yue into Deep Archive through a locked service door.',
      },
      {
        subjectId: 'prince-jian',
        predicate: 'disciple of',
        objectId: 'master-qiao',
        quote: 'Prince Jian was a disciple of Master Qiao.',
      },
    ],
    scalars: [
      {
        subjectId: 'lin-yue',
        predicate: 'age',
        value: '18',
        quote: 'Lin Yue was eighteen by the time the flood reached the archive.',
      },
    ],
  },
];

function nameOf(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

function genericQuote(subjectId: string, predicate: string, objectId: string): string {
  const subject = nameOf(subjectId);
  const object = nameOf(objectId);
  if (predicate === 'located in') return `${subject} crossed into ${object} before dusk.`;
  if (predicate === 'member of') return `${subject} pledged service to ${object}.`;
  if (predicate === 'owns') return `${subject} carried ${object} through the rain.`;
  if (predicate === 'enemy of') return `${subject} vowed to oppose ${object}.`;
  return `${subject} promised to aid ${object}.`;
}

function genericScene(index: number): Scene {
  const lead = CHARACTERS[(index - 5) % CHARACTERS.length];
  const partner = CHARACTERS[(index * 3 + 1) % CHARACTERS.length];
  const rival = CHARACTERS[(index * 5 + 3) % CHARACTERS.length];
  const location = LOCATIONS[(index * 3) % LOCATIONS.length];
  const group = ORGANIZATIONS[(index * 2) % ORGANIZATIONS.length];
  const term = TERMS[index % TERMS.length];
  const relations: [string, string, string][] = [
    [lead.id, 'located in', location.id],
    [partner.id, 'member of', group.id],
    [lead.id, index % 2 === 0 ? 'ally of' : 'enemy of', rival.id],
    [partner.id, 'owns', term.id],
  ];
  const links = relations.map(([subjectId, predicate, objectId]) => ({
    subjectId,
    predicate,
    objectId,
    quote: genericQuote(subjectId, predicate, objectId),
  }));
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

function makeAnalysisChapter(index: number): ChapterAnalysis {
  const scene = index <= 4 ? OPENING_SCENES[index - 1] : genericScene(index);
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
  if (index === 27) ids.add('invalid-crown');
  if (index === 28) ids.add('silent-oracle');
  if (index === 4) {
    ids.add('jade-river-place');
    ids.add('jade-river-term');
  }
  const entities: AnalysisEntity[] = [...ids].map((id) => {
    if (id === 'invalid-crown') {
      return {
        id,
        type: 'artifact',
        name: 'bronze crown',
        aliases: [],
        wordsFound: ['bronze crown'],
        status: 'failed',
        reason: 'type-not-in-ontology',
      };
    }
    if (id === 'silent-oracle') {
      return {
        id,
        type: 'character',
        name: 'Silent Oracle',
        aliases: [],
        wordsFound: [],
        status: 'failed',
        reason: 'words-not-found',
      };
    }
    const seed = BY_ID.get(id)!;
    return { ...seed, wordsFound: [seed.name], status: 'verified' };
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
          value: scalar.value,
          quote: scalar.quote,
          status: 'verified' as const,
        })),
      ]
    : [];
  if (index === 26) {
    facts.push({
      id: 'c26-missing-quote',
      kind: 'relationship',
      predicate: 'ally of',
      subjectId: scene.links[0].subjectId,
      objectId: scene.links[2].objectId,
      quote: 'A silver dragon rose from the river and named them allies.',
      status: 'failed',
      reason: 'quote-not-found',
    });
    facts.push({
      id: 'c26-accepted-quote',
      kind: 'relationship',
      predicate: 'ally of',
      subjectId: scene.links[1].subjectId,
      objectId: scene.links[0].subjectId,
      quote: 'They sealed their pact beneath a falling star.',
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
      value: 'star sovereign',
      quote: `${nameOf(scene.links[0].subjectId)} called the new rank star sovereign.`,
      status: 'failed',
      reason: 'value-not-allowed',
    });
  }
  const paragraphs = [...scene.paragraphs];
  if (index === 27) paragraphs.push('A bronze crown lay in a locked box, but no one knew who had placed it there.');
  if (index === 28) paragraphs.push(`${nameOf(scene.links[0].subjectId)} called the new rank star sovereign.`);
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
          error:
            index === 31
              ? 'The analysis process timed out during verification.'
              : 'The model returned an incomplete result file.',
        }
      : {}),
    paragraphs,
    entities,
    facts,
  };
}

export const JADE_RIVER_CHAPTERS: ChapterAnalysis[] = Array.from({ length: 40 }, (_, index) =>
  makeAnalysisChapter(index + 1),
);

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
  { kind: 'review-accept', chapterIndex: 26, itemKind: 'fact', itemId: 'c26-accepted-quote' },
  { kind: 'review-reject', chapterIndex: 27, itemKind: 'fact', itemId: 'c27-rejected-predicate' },
  { kind: 'review-accept', chapterIndex: 28, itemKind: 'entity', itemId: 'silent-oracle' },
  {
    kind: 'review-fix',
    chapterIndex: 28,
    itemKind: 'fact',
    itemId: 'c28-invalid-rank',
    fact: { value: 'core' },
  },
];

export const JADE_RIVER_OVERLAY: OverlayEdit[] = [
  { kind: 'entity-add-alias', entityId: 'lin-yue', alias: 'Little Yue' },
  {
    kind: 'fact-add',
    chapterIndex: 4,
    fact: {
      id: 'c4-user-alliance',
      kind: 'relationship',
      predicate: 'ally of',
      subjectId: 'lin-yue',
      objectId: 'lady-bai',
      quote: null,
      status: 'verified',
      addedByUser: true,
    },
  },
];
