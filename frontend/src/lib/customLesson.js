/** Öğretmenin kelime → cümle dersleri için senaryo topics yapısı */

export const LESSON_TYPE_WORD_BUILD = 'word_build';

export function defaultCustomLessonForm() {
  return {
    moduleId: '',
    title: '',
    words: ['', '', ''],
    teacherNote: '',
  };
}

export function parseWordsFromText(text) {
  return String(text || '')
    .split(/[,;\n]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export function buildWordBuildTopics(words, teacherNote = '') {
  const clean = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
  return {
    lesson_type: LESSON_TYPE_WORD_BUILD,
    words: clean,
    teacher_note: String(teacherNote || '').trim(),
  };
}

export function parseScenarioTopics(topics) {
  if (!topics) {
    return { lesson_type: 'default', words: [], teacher_note: '' };
  }
  if (typeof topics === 'object' && !Array.isArray(topics)) {
    if (topics.lesson_type === LESSON_TYPE_WORD_BUILD) {
      return {
        lesson_type: LESSON_TYPE_WORD_BUILD,
        words: topics.words || [],
        teacher_note: topics.teacher_note || '',
      };
    }
  }
  if (Array.isArray(topics)) {
    return { lesson_type: 'default', words: topics, teacher_note: '' };
  }
  return { lesson_type: 'default', words: [], teacher_note: '' };
}

export function isWordBuildLesson(topics) {
  return parseScenarioTopics(topics).lesson_type === LESSON_TYPE_WORD_BUILD;
}
