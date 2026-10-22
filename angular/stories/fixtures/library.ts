import type { LibraryChapter, LibraryNovel } from '../../src/features/library/library.models';

export function landscapeCover(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><rect width="30" height="40" fill="#233b4a"/><circle cx="21" cy="9" r="4" fill="#f2e3b3"/><path d="M0 30l8-10 6 7 5-5 11 11v7H0z" fill="#142630"/><path d="M0 34l10-7 9 6 11-4v11H0z" fill="#0b161c"/></svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const NOVELS: LibraryNovel[] = [
  {
    id: 'n-0006',
    originalTitle: '庆余年',
    title: 'Khánh Dư Niên',
    author: '猫腻',
    description: '范闲身世成谜，自澹州入京都，卷入庆国朝堂与江湖的风云。',
    descriptionVi: '范闲身世成谜，自澹州入京都，卷入庆国朝堂与江湖的风云。',
    language: 'zh',
    tags: ['历史', '权谋'],
    cover: landscapeCover(),
    chapterCount: 746,
    importedAt: '2026-10-06T14:05:00Z',
    updatedAt: '2026-10-06T14:22:00Z',
    lock: null,
    publication: 'completed',
    characterCount: '2.3M',
    analysedCount: 0,
    translatedCount: 0,
    taskStatus: 'paused',
    appTags: [],
    source: '庆余年.zip',
    folder: 'sources\\novels\\n-0006\\',
    coverPalette: 'art',
  },
  {
    id: 'n-0001',
    originalTitle: '凡人修仙传',
    title: 'Phàm Nhân Tu Tiên',
    author: '忘语',
    description:
      'A poor village boy enters a minor sect and climbs the path of cultivation with caution and a mysterious bottle.',
    descriptionVi:
      'Cậu bé nghèo vào một tông môn nhỏ, thận trọng bước trên con đường tu tiên cùng một chiếc bình bí ẩn.',
    language: 'zh',
    tags: ['仙侠', '修真 · Tu chân'],
    cover: null,
    chapterCount: 2446,
    importedAt: '2026-10-02T09:30:00Z',
    updatedAt: '2026-10-04T11:12:00Z',
    lock: null,
    publication: 'completed',
    characterCount: '6.9M',
    analysedCount: 1203,
    translatedCount: 37,
    taskStatus: 'running',
    appTags: [],
    source: '凡人修仙传.zip',
    folder: 'sources\\novels\\n-0001\\',
    coverPalette: 'green',
  },
  {
    id: 'n-0002',
    originalTitle: '斗破苍穹',
    title: 'Đấu Phá Thương Khung',
    author: '天蚕土豆',
    description: 'A fallen genius regains his power and fights his way to the top of the Dou Qi continent.',
    descriptionVi: 'Một thiên tài sa sút lấy lại sức mạnh và chiến đấu lên đỉnh đại lục Đấu Khí.',
    language: 'zh',
    tags: ['玄幻', '热血 · Nhiệt huyết'],
    cover: null,
    chapterCount: 1648,
    importedAt: '2026-09-30T20:15:00Z',
    updatedAt: '2026-10-03T18:40:00Z',
    lock: null,
    publication: 'completed',
    characterCount: '4.8M',
    analysedCount: 1648,
    translatedCount: 1648,
    taskStatus: 'completedEarly',
    appTags: ['analysed', 'translated'],
    source: '斗破苍穹.zip',
    folder: 'sources\\novels\\n-0002\\',
    coverPalette: 'gold',
  },
  {
    id: 'n-0004',
    originalTitle: '나 혼자만 레벨업',
    title: 'Solo Leveling',
    author: '추공',
    description: 'The weakest hunter gains a system that lets him level up alone.',
    descriptionVi: 'Thợ săn yếu nhất nhận được một hệ thống cho phép anh tự mình thăng cấp.',
    language: 'ko',
    tags: ['动作 · Hành động', 'Fantasy'],
    cover: null,
    chapterCount: 270,
    importedAt: '2026-09-28T21:00:00Z',
    updatedAt: '2026-10-01T16:25:00Z',
    lock: null,
    publication: 'completed',
    characterCount: '0.9M',
    analysedCount: 270,
    translatedCount: 168,
    taskStatus: 'paused',
    appTags: ['analysed'],
    source: 'solo-leveling.zip',
    folder: 'sources\\novels\\n-0004\\',
    coverPalette: 'jade',
  },
  {
    id: 'n-0003',
    originalTitle: '全职高手',
    title: 'Toàn Chức Cao Thủ',
    author: '蝴蝶蓝',
    description: 'A pro player dismissed from his team returns to the game and builds a new one from scratch.',
    descriptionVi: 'Một tuyển thủ bị loại khỏi đội trở lại game và dựng một đội mới từ con số không.',
    language: 'zh',
    tags: ['竞技', '都市 · Đô thị'],
    cover: null,
    chapterCount: 1728,
    importedAt: '2026-09-27T19:45:00Z',
    updatedAt: '2026-09-28T10:05:00Z',
    lock: null,
    publication: 'completed',
    characterCount: '5.1M',
    analysedCount: 0,
    translatedCount: 0,
    taskStatus: 'none',
    appTags: [],
    source: '全职高手.zip',
    folder: 'sources\\novels\\n-0003\\',
    coverPalette: 'slate',
  },
  {
    id: 'n-0005',
    originalTitle: '転生したらスライムだった件',
    title: 'Tensei Slime',
    author: '伏瀬',
    description: 'A man reincarnated as a slime builds a nation of monsters.',
    descriptionVi: 'Một người đàn ông chuyển sinh thành slime và xây dựng quốc gia của loài quái vật.',
    language: 'ja',
    tags: ['Isekai', '冒险 · Phiêu lưu'],
    cover: null,
    chapterCount: 304,
    importedAt: '2026-09-18T08:50:00Z',
    updatedAt: '2026-09-20T13:30:00Z',
    lock: null,
    publication: 'ongoing',
    characterCount: '1.2M',
    analysedCount: 36,
    translatedCount: 0,
    taskStatus: 'completed',
    appTags: [],
    source: 'tensei-slime.zip',
    folder: 'sources\\novels\\n-0005\\',
    coverPalette: 'rose',
  },
  {
    id: 'n-0007',
    originalTitle: 'Mother of Learning',
    title: 'Mother of Learning',
    author: 'nobody103',
    description: 'A young mage relives the same month over and over to stop an invasion.',
    descriptionVi: 'Một pháp sư trẻ sống lại cùng một tháng để ngăn chặn cuộc xâm lăng.',
    language: 'en',
    tags: ['Fantasy', '时间循环 · Vòng lặp thời gian'],
    cover: null,
    chapterCount: 108,
    importedAt: '2026-09-10T22:10:00Z',
    updatedAt: '2026-09-12T07:55:00Z',
    lock: null,
    publication: 'completed',
    characterCount: '1.6M',
    analysedCount: 0,
    translatedCount: 0,
    taskStatus: 'completed',
    appTags: [],
    source: 'mother-of-learning.zip',
    folder: 'sources\\novels\\n-0007\\',
    coverPalette: 'charcoal',
  },
];

export const NO_CHAPTERS_NOVEL: LibraryNovel = {
  ...NOVELS[0],
  id: 'n-empty',
  chapterCount: 0,
  source: 'empty-novel.zip',
  folder: 'sources\\novels\\n-empty\\',
};

export const PROTOTYPE_CHAPTER_LIMIT = 120;

export const SAMPLE_PARAGRAPHS: string[] = [
  '夜色落下来的时候，韩立才从柴房里走出来。白天劈好的柴整整齐齐码在墙根，他拍了拍手上的木屑。',
  '彩霞山的夜比青牛镇冷得多。他把粗布衣裳紧了紧，顺着后山那条少有人走的小径往上走。',
  '药园四周围着半人高的竹篱，篱笆上挂着几串风干的药草，在夜风里轻轻晃动。',
  '他并不是来偷药的。三天前，墨大夫让他喝下的那碗药汤，到现在还在小腹里隐隐发热。',
  '园子里的药草分成一畦一畦，大多数他叫不出名字。',
  '“练气之法，本就逆天而行。”白天墨大夫那句漫不经心的话，忽然又在耳边响起。',
  '就在这时，竹林深处传来一声极轻的咳嗽。',
  '韩立浑身一僵，整个人伏进了草畦之间。他屏住呼吸，听着那脚步声由远及近，又慢慢远去。',
  '他没有再多看一眼，循着原路退了出去。回到柴房躺下时，天边已经隐隐透出一线灰白。',
];

export const CHAPTER_PARAGRAPHS: Record<string, string[]> = {
  'n-0001-c0012': [
    '夜色落下来时，韩立才从柴房里走出来。白天劈好的柴整整齐齐码在墙根，他拍了拍手上的木屑，抬头望见山间最后一点暮色正被云影吞没。',
    '彩霞山的夜比青牛镇冷得多。他把粗布衣裳紧了紧，顺着后山那条少有人走的小径往上走，脚下碎石在鞋底轻轻作响。',
    '药园四周围着半人高的竹篱，篱笆上挂着几串风干的药草，在夜风里微微摇晃。远处的虫鸣断断续续，衬得园子愈发安静。',
    '他并不是来偷药的。三天前，墨大夫让他喝下的那碗药汤，到现在还在小腹里隐隐发热；那股热意每到夜深，便像细针一样游走。',
    '园子里的药草分成一畦一畦，大多数他叫不出名字。只有靠近水井的几株灵芝，他曾在墨大夫的书里见过，知道不能轻易碰触。',
    '“练气之法，本就逆天而行。”白天墨大夫那句漫不经心的话，忽然又在耳边响起。韩立站在篱笆外，没有立刻进去。',
    '就在这时，竹林深处传来一声极轻的咳嗽。他浑身一僵，整个人伏进了草畦之间，连呼吸也放得极缓。',
    '脚步声由远及近，又慢慢远去。月光从云缝里漏下一线，照见井边有人影一闪；韩立等了许久，才敢抬起头来。',
    '他没有再多看一眼，循着原路退了出去。回到柴房躺下时，天边已经隐隐透出一线灰白，而那碗药汤留下的热意仍没有散去。',
  ],
};

export function makeChapters(novel: LibraryNovel): LibraryChapter[] {
  const count: number = Math.min(novel.chapterCount, PROTOTYPE_CHAPTER_LIMIT);
  return Array.from({ length: count }, (_, index: number): LibraryChapter => {
    const n: number = index + 1;
    const paragraphCount: number =
      novel.id === 'n-0001' && n === 12 ? CHAPTER_PARAGRAPHS['n-0001-c0012'].length : n % 17 === 0 ? 1 : 4 + (n % 6);
    return {
      id: `${novel.id}-c${String(n).padStart(4, '0')}`,
      position: n,
      title:
        novel.language === 'zh'
          ? novel.id === 'n-0001' && n === 12
            ? '第十二章 夜探药园'
            : `第${n}章`
          : `Chapter ${n}`,
      chars: novel.id === 'n-0001' && n === 12 ? 3208 : n % 23 === 0 ? 0 : 1800 + ((n * 137) % 2600),
      paragraphCount: n % 23 === 0 ? 0 : paragraphCount,
    };
  });
}
