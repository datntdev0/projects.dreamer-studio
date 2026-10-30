import type { NovelDetail } from '@dreamer/shared/models/novel';

export function novelDetail(): NovelDetail {
  return {
    id: 'novel',
    originalTitle: 'Original',
    title: 'Novel',
    author: 'Author',
    language: 'en',
    publication: 'ongoing',
    tags: [],
    chapterCount: 2,
    charCount: 20,
    importedAt: '',
    updatedAt: '',
    hasCover: false,
    translations: [],
    analysis: { analysed: 0, total: 2 },
    lock: null,
    description: '',
    chapters: [
      { position: 1, file: 'first', title: 'First', paragraphs: 1, chars: 10 },
      { position: 2, file: 'second', title: 'Second', paragraphs: 1, chars: 10 },
    ],
  };
}
