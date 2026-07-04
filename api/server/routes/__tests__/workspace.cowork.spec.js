jest.mock(
  '@librechat/data-schemas',
  () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  }),
  { virtual: true },
);
jest.mock(
  'librechat-data-provider',
  () => ({
    ContentTypes: { TEXT: 'text' },
    Constants: {},
    EndpointURLs: {},
    EModelEndpoint: { agents: 'agents' },
  }),
  { virtual: true },
);
jest.mock('~/server/middleware', () => ({
  configMiddleware: (req, res, next) => next(),
  buildEndpointOption: (req, res, next) => next(),
  moderateText: (req, res, next) => next(),
}));
jest.mock('~/server/middleware/requireJwtAuth', () => (req, res, next) => next());
jest.mock('~/server/services/Endpoints/agents', () => ({
  initializeClient: jest.fn(),
}));

const { coworkInternals } = require('../workspace');

const {
  createExhaustedCoworkDecision,
  createFallbackCoworkDecision,
  getCoworkThaiCharCount,
  getCoworkWordCount,
  isLowInformationCoworkItem,
  isOverloadedCoworkDecisionQuestion,
  isRepeatedCoworkQuestion,
  COWORK_ACTION_OFFER_PATTERN,
} = coworkInternals;

describe('getCoworkThaiCharCount', () => {
  it('counts only Thai characters', () => {
    expect(getCoworkThaiCharCount('ครัว')).toBe(4);
    expect(getCoworkThaiCharCount('abc 123')).toBe(0);
    expect(getCoworkThaiCharCount('ระบบ system ร้านค้า')).toBe(11);
  });
});

describe('isLowInformationCoworkItem', () => {
  it('accepts a normal Thai sentence without spaces or punctuation', () => {
    expect(isLowInformationCoworkItem('ต้องการรองรับการชำระเงินช่องทางไหนบ้าง')).toBe(false);
  });

  it('rejects short Thai fragments', () => {
    expect(isLowInformationCoworkItem('ครัว')).toBe(true);
  });

  it('rejects empty values', () => {
    expect(isLowInformationCoworkItem('')).toBe(true);
    expect(isLowInformationCoworkItem(undefined)).toBe(true);
  });

  it('accepts English text with enough words', () => {
    expect(isLowInformationCoworkItem('Which payment channels must be supported?')).toBe(false);
  });

  it('rejects generic filler without a specific anchor', () => {
    expect(isLowInformationCoworkItem('improve and make it better')).toBe(true);
  });
});

describe('getCoworkWordCount', () => {
  it('counts whitespace-separated words', () => {
    expect(getCoworkWordCount('one two three')).toBe(3);
    expect(getCoworkWordCount('')).toBe(0);
  });
});

describe('isRepeatedCoworkQuestion', () => {
  const asked = ['ผู้ใช้หลักของระบบนี้คือใคร?'];

  it('flags an identical question', () => {
    expect(isRepeatedCoworkQuestion('ผู้ใช้หลักของระบบนี้คือใคร?', asked)).toBe(true);
  });

  it('flags a containing variant', () => {
    expect(isRepeatedCoworkQuestion('ขอถามอีกครั้ง ผู้ใช้หลักของระบบนี้คือใคร?', asked)).toBe(true);
  });

  it('passes an unrelated question', () => {
    expect(isRepeatedCoworkQuestion('ต้องรองรับกี่ภาษา?', asked)).toBe(false);
  });
});

describe('isOverloadedCoworkDecisionQuestion', () => {
  it('passes a focused question', () => {
    expect(isOverloadedCoworkDecisionQuestion('Who is the primary user?')).toBe(false);
  });

  it('flags a question with too many clauses', () => {
    expect(
      isOverloadedCoworkDecisionQuestion('Do you want A, B, C, or D, and also E?'),
    ).toBe(true);
  });
});

describe('COWORK_ACTION_OFFER_PATTERN', () => {
  it.each([
    'ต้องการให้สร้างไฟล์โครงสร้างโปรเจกต์เริ่มต้นให้พร้อมรันไหม',
    'ให้ผมเขียนโค้ดตัวอย่างให้เลยไหม',
    'Do you want me to create the project files now?',
  ])('flags action offers: %s', (question) => {
    expect(COWORK_ACTION_OFFER_PATTERN.test(question)).toBe(true);
  });

  it.each([
    'ต้องการให้ระบบสร้างใบเสร็จอัตโนมัติไหม',
    'ผู้ใช้หลักของระบบนี้คือใคร?',
    'ต้องการรองรับการชำระเงินช่องทางไหนบ้าง',
  ])('passes requirement questions: %s', (question) => {
    expect(COWORK_ACTION_OFFER_PATTERN.test(question)).toBe(false);
  });
});

describe('createFallbackCoworkDecision', () => {
  it('returns the first unasked fallback question', () => {
    const decision = createFallbackCoworkDecision('ระบบร้านค้าออนไลน์', true, []);
    expect(decision.question).toBeTruthy();
    expect(decision.options.length).toBeGreaterThanOrEqual(2);
    expect(decision.allowCustomAnswer).toBe(true);
  });

  it('skips questions that were already asked', () => {
    const first = createFallbackCoworkDecision('ระบบร้านค้าออนไลน์', true, []);
    const second = createFallbackCoworkDecision('ระบบร้านค้าออนไลน์', true, [first.question]);
    expect(second.question).not.toBe(first.question);
  });

  it('returns the exhausted decision instead of repeating when all questions are used', () => {
    const askedQuestions = [];
    for (let i = 0; i < 4; i += 1) {
      const decision = createFallbackCoworkDecision('ระบบร้านค้าออนไลน์', true, askedQuestions);
      askedQuestions.push(decision.question);
    }
    const exhausted = createFallbackCoworkDecision('ระบบร้านค้าออนไลน์', true, askedQuestions);
    expect(exhausted.recommendedOptionId).toBe('start-plan');
    expect(askedQuestions).not.toContain(exhausted.question);
  });

  it.each([true, false])(
    'never offers to create files or code itself (isThai=%s)',
    (isThai) => {
      const askedQuestions = [];
      for (let i = 0; i < 5; i += 1) {
        const decision = createFallbackCoworkDecision('online store system', isThai, askedQuestions);
        expect(COWORK_ACTION_OFFER_PATTERN.test(decision.question)).toBe(false);
        expect(isLowInformationCoworkItem(decision.question)).toBe(false);
        askedQuestions.push(decision.question);
      }
    },
  );
});

describe('createExhaustedCoworkDecision', () => {
  it.each([true, false])('passes its own quality checks (isThai=%s)', (isThai) => {
    const decision = createExhaustedCoworkDecision('ระบบร้านค้าออนไลน์', isThai);
    expect(isLowInformationCoworkItem(decision.question)).toBe(false);
    expect(isLowInformationCoworkItem(decision.reason)).toBe(false);
    expect(isLowInformationCoworkItem(decision.impact)).toBe(false);
    expect(isOverloadedCoworkDecisionQuestion(decision.question)).toBe(false);
    for (const option of decision.options) {
      expect(option.label).toBeTruthy();
      expect(isLowInformationCoworkItem(option.description)).toBe(false);
    }
  });
});
