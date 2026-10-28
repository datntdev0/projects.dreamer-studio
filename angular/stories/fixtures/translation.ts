import type { GlossaryRow, GlossaryTermKind, TargetLanguage } from '@dreamer/shared/models/translation';
import { ENTITY_SEEDS, JADE_RIVER_CHAPTERS, jadeRiverChapters } from './analysis';

const VI_NAMES: Record<string, string> = {
  'Lin Yue': 'Lâm Nguyệt',
  Yue: 'Nguyệt',
  'Mei Ren': 'Mai Nhân',
  Mei: 'Mai',
  'Master Qiao': 'Kiều sư phụ',
  Qiao: 'sư phụ Kiều',
  'Shen Wu': 'Thẩm Vũ',
  'Lady Bai': 'Bạch phu nhân',
  'Captain Wei': 'Đội trưởng Ngụy',
  Wei: 'Ngụy',
  'Prince Jian': 'Kiến vương gia',
  Jian: 'Kiến',
  'Old Fen': 'Phân lão',
  Nian: 'Niên',
  Tao: 'Đào',
  'Zhao Lei': 'Triệu Lôi',
  'Hu Dan': 'Hồ Đan',
  'Sister Lian': 'Liên tỷ',
  Lian: 'Liên',
  'Elder Su': 'Tô trưởng lão',
  'Han Qi': 'Hàn Kỳ',
  'Yu Ning': 'Dư Ninh',
  'River Ghost': 'Hà Quỷ',
  'the Ghost': 'bóng ma',
  'Jade River': 'Ngọc Hà',
  'the river': 'sông',
  'East Ferry': 'Bến Đông',
  Mistwatch: 'Vọng Sương',
  'Lotus House': 'Liên Hoa Lâu',
  'White Crane Hall': 'Bạch Hạc Đường',
  'Moon Gate': 'Nguyệt Môn',
  'Deep Archive': 'Tàng Thư Các',
  'Stone Market': 'Chợ Đá',
  'River Wardens': 'Hộ Hà Vệ',
  Wardens: 'Hộ Vệ',
  'White Crane Sect': 'Bạch Hạc Môn',
  'Ash Court': 'Tẫn Triều',
  'Ferry Guild': 'Hội Lái Đò',
  'Night Lanterns': 'Dạ Đăng Hội',
  'jade seal': 'ngọc ấn',
  seal: 'ấn tín',
  'moon script': 'nguyệt văn',
  'spirit root': 'linh căn',
  'river oath': 'hà thệ',
  'jade current': 'dòng ngọc',
};

const TITLE_SEEDS: Record<string, { zh: string; en: string; vi: string }[]> = {
  'master-qiao': [{ zh: '师父', en: 'Master', vi: 'sư phụ' }],
  'prince-jian': [{ zh: '王爷', en: 'Prince', vi: 'vương gia' }],
  'lady-bai': [{ zh: '夫人', en: 'Lady', vi: 'phu nhân' }],
  'captain-wei': [{ zh: '队长', en: 'Captain', vi: 'đội trưởng' }],
  'elder-su': [{ zh: '长老', en: 'Elder', vi: 'trưởng lão' }],
};

const UNTRANSLATED: Record<TargetLanguage, Set<string>> = {
  en: new Set(['Yue', 'Qiao', 'Wei', 'Prince']),
  vi: new Set(['Yue', 'Mei', 'Qiao', 'Wei', 'Jian', 'Lian', 'Lady']),
};
const USER: Record<TargetLanguage, Set<string>> = {
  en: new Set(['Lin Yue', 'Jade River']),
  vi: new Set(['Lin Yue', 'Mei Ren', 'Master Qiao', 'Jade River', 'jade seal', 'Master']),
};

function seedRow(
  entity: (typeof ENTITY_SEEDS)[number],
  language: TargetLanguage,
  kind: GlossaryTermKind,
  source: string,
  label: string,
  translated: string,
): GlossaryRow {
  const translation = UNTRANSLATED[language].has(label) ? null : translated;
  const chapters = jadeRiverChapters('zh').filter((chapter) =>
    chapter.paragraphs.some((paragraph) => paragraph.includes(source)),
  );
  return {
    entityType: entity.type,
    entityName: entity.zh,
    term: kind === 'name' ? null : source,
    kind,
    translation,
    status: translation === null ? 'untranslated' : USER[language].has(label) ? 'user' : 'llm',
    chapters: chapters.length,
    chapterIndexes: chapters.map((chapter) => chapter.index),
  };
}

export function seedGlossaryRows(language: TargetLanguage): GlossaryRow[] {
  const localized = (name: string): string => (language === 'vi' ? viName(name) : name);
  return ENTITY_SEEDS.flatMap((entity): GlossaryRow[] => [
    seedRow(entity, language, 'name', entity.zh, entity.name, localized(entity.name)),
    ...entity.aliases.map((alias, index) =>
      seedRow(entity, language, 'alias', entity.zhAliases[index], alias, localized(alias)),
    ),
    ...(TITLE_SEEDS[entity.id] ?? []).map((title) =>
      seedRow(entity, language, 'title', title.zh, title.en, title[language]),
    ),
  ]);
}

export const DEFAULT_INSTRUCTIONS: Record<TargetLanguage, string> = {
  en: 'Translate the Chinese original into fluent literary English. Preserve each paragraph and the tone of dialogue. Keep glossary names and cultivation terms consistent; render forms of address according to each relationship.',
  vi: 'Dịch nguyên tác tiếng Trung sang tiếng Việt tự nhiên, giàu nhịp điệu văn học. Giữ nguyên số đoạn và sắc thái đối thoại. Dùng nhất quán tên và thuật ngữ tu luyện trong bảng thuật ngữ; chọn cách xưng hô phù hợp quan hệ nhân vật.',
};

const OPENING_VI: string[][] = [
  [
    'Sương mù phủ thấp trên Ngọc Hà, nhuộm những sợi dây neo thành màu bạc. Lâm Nguyệt đếm thuyền trước hồi chuông sớm và phát hiện thiếu mất một chiếc.',
    'Phân lão đứng chờ trên bậc Bến Đông, giấu cuốn sổ ướt dưới áo. Ông là cha của Lâm Nguyệt. Dù không nói chiếc thuyền nào đã đi, bến trống đã cho cô biết đủ.',
    'Mai Nhân mang tới ổ bánh mì bọc trong khăn. Cô hứa sẽ giúp Lâm Nguyệt, dù Hộ Hà Vệ phong tỏa mọi bến qua sông.',
    'Lâm Nguyệt sang Bến Đông trước hoàng hôn. Nước triều đã cuốn một vệt lau trắng khỏi bến.',
    'Phân lão trao ngọc ấn cho Lâm Nguyệt. Trên mặt ấn khắc dấu sông còn xưa hơn mọi giấy phép lái đò.',
    'Đội trưởng Ngụy lục soát thuyền trong khi lính của ông tra hỏi ngư dân. Lâm Nguyệt giấu ấn tín dưới một tấm ván lỏng.',
    'Mùa xuân ấy, Lâm Nguyệt mười bảy tuổi. Cô sống gần trọn những năm đó trên mặt nước, vậy mà chưa từng thấy dòng sông tĩnh lặng đến thế.',
    'Khi chuông chợ vang lên, Mai Nhân dẫn Đội trưởng Ngụy về phía bến bắc. Phân lão chỉ lặng im nhìn theo.',
    'Sau đêm, con thuyền mất tích trôi về mà không có người. Một chiếc lông trắng mắc nơi chốt mái chèo.',
  ],
  [
    'Mưa quét qua Bạch Hạc Đường, làm ướt lá thư trong tay Lâm Nguyệt. Dấu niêm phía sau có hình giống hệt dấu ấn bị đánh cắp.',
    'Kiều sư phụ đón Lâm Nguyệt dưới mái hiên chạm trổ. Giọng ông hiền hòa, nhưng một tay vẫn đặt trên then cửa.',
    'Kiều sư phụ dạy Mai Nhân đọc nguyệt văn. Cô đánh vần từng nét cong trong lúc đèn dần tàn.',
    'Liên tỷ thuộc Bạch Hạc Môn. Mai Nhân là em gái nàng. Nhận ra nét chữ, nàng xin được xem trang giấy một mình.',
    'Mai Nhân mang bản nguyệt văn băng qua cơn mưa. Tờ giấy vẫn khô trong tay áo cô.',
    'Trong sảnh thoảng mùi khói thông và mực cũ. Ai đó đã cạo mất một cái tên ở cuối thư.',
    'Mai Nhân chỉ giữ được cảnh giới luyện khí trong chốc lát. Kiều sư phụ bảo nàng rằng kiên nhẫn quan trọng hơn tốc độ.',
    'Chuông ngân hai tiếng trên sân. Liên tỷ gấp thư lại trước khi câu cuối được đọc thành lời.',
    'Đến chiều, con đường về Bến Đông đã chìm dưới nước lũ. Họ ngủ trong thư phòng giữa những tấm bản đồ bờ sông đã biến mất.',
  ],
  [
    'Nguyệt Môn chỉ mở sau tiếng chuông canh cuối. Lâm Nguyệt đợi dưới vòm cổng, giấu ngọc ấn trong tay áo.',
    'Hà Quỷ chính là Lâm Nguyệt sau chiếc mặt nạ mượn. Cô đặt ra cái tên ấy để Tẫn Triều đuổi theo lời đồn thay vì truy tìm một cô con gái.',
    'Hà Quỷ lẻn qua Nguyệt Môn trước bình minh. Không lính gác nào thấy cô luồn qua hàng đèn.',
    'Thẩm Vũ chỉ huy Tẫn Triều từ căn phòng trên cổng. Đêm ấy, hắn ghi lại mọi gương mặt được phép vào.',
    'Bạch phu nhân thề chống lại Thẩm Vũ. Lời cảnh báo của bà đến tay Lâm Nguyệt dưới hình một dải lụa đỏ rách.',
    'Dưới vòm cổng, đá cũ rịn hơi sông. Lâm Nguyệt nghe một người lái đò hát đâu đó ngoài bức tường.',
    'Cô nín thở khi lính gác rẽ qua góc đường. Lâm Nguyệt vẫn yêu Mai Nhân. Chiếc mặt nạ thoảng mùi gỗ tuyết tùng và sơn mới.',
    'Lúc mặt trời lên, cổng lại đóng kín. Thẩm Vũ chỉ tìm thấy một chiếc lông trắng trên ngưỡng cửa.',
    'Lâm Nguyệt bước đi không ngoái lại. Lần đầu tiên, Hà Quỷ dường như thật hơn chính cái tên của cô.',
  ],
  [
    'Tàng Thư Các nằm dưới bức tường sông cũ. Cầu thang dẫn xuống sâu đến mức không khí phảng phất vị đá ướt.',
    'Bạch phu nhân đưa Lâm Nguyệt vào Tàng Thư Các qua cửa phụ khóa kín. Phía sau họ, nước sông khẽ ép vào tường đá.',
    'Kiến vương gia tuyên thệ phục vụ Hộ Hà Vệ. Ngài là đệ tử của Kiều sư phụ. Chữ ký của ngài chiếm trọn một dòng trong sổ nhập môn.',
    'Bạch phu nhân hứa giúp Lâm Nguyệt. Lời hứa nhỏ đến mức chỉ những kệ sách nghe thấy.',
    'Khi lũ tràn tới thư các, Lâm Nguyệt đã mười tám tuổi. Cô không còn chờ ai cho phép trước khi mở ngăn kéo cấm.',
    'Bên trong là bản đồ Ngọc Hà và một văn bản khác gọi dòng chảy ngầm bằng đúng cái tên ấy. Một tên gọi vừa chỉ địa danh, vừa là thuật ngữ của người dẫn đường xưa.',
    'Phân lão đã đánh dấu một lối hẹp bằng than. Lâm Nguyệt lần ngón tay theo con đường chạy dưới Nguyệt Môn.',
    'Một phiến đá dịch chuyển đâu đó trong bóng tối. Kiến vương gia cầm đèn còn Bạch phu nhân khép sách.',
    'Họ rời đi trước khi nước chạm bậc thang cuối. Trên mặt đất, không ai biết thư các từng được mở.',
  ],
];

export function viName(name: string): string {
  return VI_NAMES[name] ?? name;
}

export function translatedName(sourceName: string, language: TargetLanguage): string {
  for (const entity of ENTITY_SEEDS) {
    if (entity.zh === sourceName) return language === 'vi' ? viName(entity.name) : entity.name;
    const index = entity.zhAliases.indexOf(sourceName);
    if (index >= 0) {
      const name = entity.aliases[index];
      return language === 'vi' ? viName(name) : name;
    }
    const title = TITLE_SEEDS[entity.id]?.find((item) => item.zh === sourceName);
    if (title) return title[language];
  }
  return sourceName;
}

function translateGeneric(index: number): string[] {
  const chapter = JADE_RIVER_CHAPTERS[index - 1];
  const source = chapter.paragraphs;
  const lead = source[0].match(/as (.*?) followed/)?.[1] ?? '';
  const partner = source[1].match(/\. (.*?) listened/)?.[1] ?? '';
  const rival = source[6].match(/At noon, (.*?) noticed/)?.[1] ?? '';
  const relation = (paragraph: string): string => {
    const sentence = paragraph.split('.')[0];
    const match = sentence.match(
      /^(.*?) (crossed into|pledged service to|carried|vowed to oppose|promised to aid) (.*?)(?: through the rain| before dusk)?$/,
    );
    if (!match) return 'Quyết định ấy được nhớ mãi sau chuyến qua sông.';
    const subject = viName(match[1]);
    const object = viName(match[3].replace(/ through the rain$| before dusk$/, ''));
    const action: Record<string, string> = {
      'crossed into': `đi vào ${object} trước hoàng hôn`,
      'pledged service to': `thề phục vụ ${object}`,
      carried: `mang ${object} băng qua cơn mưa`,
      'vowed to oppose': `thề chống lại ${object}`,
      'promised to aid': `hứa giúp ${object}`,
    };
    return `${subject} ${action[match[2]]}. Quyết định ấy còn được nhắc tới sau chuyến qua sông.`;
  };
  const paragraphs = [
    `Con đường ven sông uốn về phía đông khi ${viName(lead)} theo con nước sớm. Một con diều đỏ lượn trên bãi cạn.`,
    `Người lái đò kể về Ngọc Hà, nhưng cứ nổi gió là câu chuyện của ông lại đổi khác. ${viName(partner)} đứng bên bờ lắng nghe.`,
    ...source.slice(2, 6).map(relation),
    `Đến trưa, ${viName(rival)} thấy dấu chân mới gần đám lau. Không ai nhận đã để lại chúng.`,
    `Con thuyền cuối rời bến dưới bầu trời màu tro. ${viName(lead)} canh chừng cho tới khi ngọn đèn khuất hẳn.`,
    'Đêm xuống, đoàn người tìm được nơi trú. Ngoài những ô cửa đóng kín, dòng nước vẫn chảy.',
  ];
  if (index === 27)
    paragraphs.push('Một chiếc vương miện bằng đồng nằm trong hòm khóa, nhưng không ai biết ai đã đặt nó ở đó.');
  if (index === 28) paragraphs.push(`${viName(lead)} gọi cảnh giới mới là tinh quân.`);
  return paragraphs;
}

export function translatedScene(index: number, language: TargetLanguage): { title: string; paragraphs: string[] } {
  const chapter = JADE_RIVER_CHAPTERS[index - 1];
  if (!chapter) return { title: '', paragraphs: [] };
  if (language === 'en') return { title: chapter.title, paragraphs: [...chapter.paragraphs] };
  const titles = ['Bến đò lúc bình minh', 'Lá thư Bạch Hạc', 'Bóng ma ở Nguyệt Môn', 'Thư các dưới lòng đất'];
  return {
    title: titles[index - 1] ?? `Chương ${index}: Đường ven sông`,
    paragraphs: [...(OPENING_VI[index - 1] ?? translateGeneric(index))],
  };
}
