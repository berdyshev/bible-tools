import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanVerse, decodeModule, MODULE_RULES, type ModuleRules } from '../../src/ingest/theword.ts';

const LINES = 31_102;
const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);
const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** A module with `verses` verse lines (line n reads `v<n>`), a blank line and `meta`, all CRLF. */
const moduleText = (verses: number, meta: readonly string[]): string =>
  [...Array.from({ length: verses }, (_, i) => `v${i + 1}`), '', ...meta].join('\r\n');

const META = ['id=b9', 'lang=eng', 'short.title=KJV'];

void test('a module splits into 31 102 verse lines and its metadata', () => {
  const m = decodeModule(ascii(`${moduleText(LINES, META)}\r\n`), 'utf-8');
  assert.ok(m.ok);
  assert.equal(m.value.lines.length, LINES);
  assert.equal(m.value.lines[0], 'v1');
  assert.equal(m.value.lines.at(-1), 'v31102');
  assert.deepEqual(m.value.meta, { id: 'b9', lang: 'eng', 'short.title': 'KJV' });
});

void test('a module without a trailing newline decodes the same', () => {
  const m = decodeModule(ascii(moduleText(LINES, META)), 'utf-8');
  assert.ok(m.ok);
  assert.equal(m.value.meta['short.title'], 'KJV');
});

void test('empty verse lines stay as empty slots', () => {
  const text = moduleText(LINES, META).replace('\r\nv3\r\n', '\r\n\r\n');
  const m = decodeModule(ascii(text), 'utf-8');
  assert.ok(m.ok);
  assert.deepEqual(m.value.lines.slice(0, 4), ['v1', 'v2', '', 'v4']);
});

void test('a BOM is dropped and a lone CR becomes a space', () => {
  const m = decodeModule(ascii(`﻿${moduleText(LINES, META).replace('v2', 'a\rb')}`), 'utf-8');
  assert.ok(m.ok);
  assert.equal(m.value.lines[0], 'v1');
  assert.equal(m.value.lines[1], 'a b');
});

void test('windows-1251 and windows-1252 bytes decode to Cyrillic, umlauts and the ellipsis', () => {
  const rest = ascii(`\r\n${moduleText(LINES - 1, META)}`);
  // "Бог" in windows-1251.
  const ru = decodeModule(concat(Uint8Array.from([0xc1, 0xee, 0xe3]), rest), 'windows-1251');
  assert.ok(ru.ok);
  assert.equal(ru.value.lines[0], 'Бог');
  // "Hörner…" in windows-1252: 0xF6 = ö, 0x85 = U+2026.
  const de = decodeModule(
    concat(ascii('H'), Uint8Array.from([0xf6]), ascii('rner'), Uint8Array.from([0x85]), rest),
    'windows-1252',
  );
  assert.ok(de.ok);
  assert.equal(de.value.lines[0], 'Hörner…');
  // The rest of 0x80-0x9F follows windows-1252 too, not Latin-1; undefined bytes stay as they are.
  const c1 = decodeModule(concat(Uint8Array.from([0x80, 0x93, 0x94, 0x9f, 0x81]), rest), 'windows-1252');
  assert.ok(c1.ok);
  assert.equal(c1.value.lines[0], '€“”Ÿ\u0081');
});

void test('a module with the wrong number of verse lines is an error that counts them', () => {
  assert.deepEqual(decodeModule(ascii(moduleText(LINES - 1, META)), 'utf-8'), {
    ok: false,
    error: { kind: 'verse_count', expected: LINES, found: LINES - 1 },
  });
  assert.deepEqual(decodeModule(ascii(moduleText(LINES + 1, META)), 'utf-8'), {
    ok: false,
    error: { kind: 'verse_count', expected: LINES, found: LINES + 1 },
  });
  assert.deepEqual(decodeModule(ascii('v1\r\nv2'), 'utf-8'), {
    ok: false,
    error: { kind: 'verse_count', expected: LINES, found: 2 },
  });
});

void test('metadata continues a value after a trailing backslash, skips comments and keeps repeated keys', () => {
  // Literal metadata from kjv.ont (shortened).
  const meta = [
    'id=b9',
    'verse.rule="((?:^|.+?)(<W[GH]\\d+>\\ ?)+)" "<wt>$1"',
    'verse.rule="<wt>(.*?)" "<wt>"',
    '#version.1.3=[2Cor 12:9] added red word tags',
    "#version 2.3 [Jon] Fixed Strong's numbers",
    'about=This is the King James Version of the Holy Bible \\',
    '    (also known as the Authorized Version).  \\',
    '    This work is public domain.',
    'description=Russian Synodal Text 1876 ',
  ];
  const m = decodeModule(ascii(moduleText(LINES, meta)), 'utf-8');
  assert.ok(m.ok);
  assert.deepEqual(m.value.meta, {
    id: 'b9',
    'verse.rule': '"((?:^|.+?)(<W[GH]\\d+>\\ ?)+)" "<wt>$1"\n"<wt>(.*?)" "<wt>"',
    about:
      'This is the King James Version of the Holy Bible (also known as the Authorized Version). This work is public domain.',
    description: 'Russian Synodal Text 1876',
  });
});

const { kjv, darby, gerelb, rst, ukrio } = MODULE_RULES;
const text = (line: string, rules: ModuleRules): string => cleanVerse(line, rules).text;

void test('kjv: Strong tags and paragraph marks are dropped, added words bracketed', () => {
  assert.equal(
    text(
      'And the earth<WH776> was<WH1961> without form<WH8414>, and void<WH922>; and darkness<WH2822> <FI>was<Fi> upon the face<WH6440> of the deep<WH8415>. And the Spirit<WH7307> of God<WH430> moved<WH7363> upon<WH5921> the face<WH6440> of the waters<WH4325>.<CM>',
      kjv,
    ),
    'And the earth was without form, and void; and darkness [was] upon the face of the deep. And the Spirit of God moved upon the face of the waters.',
  );
  assert.equal(
    text(
      'Then<WG3767> said they<WG2036> unto<WG4314> him<WG846>, What<WG5101> shall we do<WG4160><XWG4160>, that<WG2443> we might work<WG2038> the works<WG2041> of God<WG2316>?',
      kjv,
    ),
    'Then said they unto him, What shall we do, that we might work the works of God?',
  );
});

void test('kjv: a note is inline after its anchor as ⸨…⸩', () => {
  assert.deepEqual(
    cleanVerse(
      'And God<WH430> saw<WH7200><WH853> the light<WH216>, that<WH3588> <FI>it was<Fi> good<WH2896>: and God<WH430> divided<WH914><WH996> the light<WH216> from<WH996> the darkness<WH2822>.<RF>the light from…: Heb. between the light and between the darkness<Rf>',
      kjv,
    ),
    {
      text: 'And God saw the light, that [it was] good: and God divided the light from the darkness. ⸨the light from…: Heb. between the light and between the darkness⸩',
      nativeRefs: [],
      startsWithRef: false,
    },
  );
  assert.equal(
    text(
      'The grace<WG5485> of the Lord<WG2962> Jesus<WG2424> Christ<WG5547>, and<WG2532> the love<WG26> of God<WG2316>, and<WG2532> the communion<WG2842> of the Holy<WG40> Ghost<WG4151>, <FI>be<Fi> with<WG3326> you<WG5216> all<WG3956>. Amen<WG281>. <RF>The second <i>epistle</i> to the Corinthians was written from Philippi, <i>a city</i> of Macedonia, by Titus and Lucas.<Rf><CM>',
      kjv,
    ),
    'The grace of the Lord Jesus Christ, and the love of God, and the communion of the Holy Ghost, [be] with you all. Amen. ⸨The second epistle to the Corinthians was written from Philippi, a city of Macedonia, by Titus and Lucas.⸩',
  );
});

void test('a note can be dropped by the rules', () => {
  assert.equal(
    text('the darkness<WH2822>.<RF>the light from…: Heb. between<Rf>', { ...kjv, notes: 'drop' }),
    'the darkness.',
  );
});

void test('kjv: red-letter and quotation tags keep their words, around and inside added words', () => {
  assert.equal(
    text(
      'And<WG1161> Jesus<WG2424> answering<WG611> said<WG2036> unto<WG4314> him<WG846>, <FR>Suffer<Fr><WG863><FR> <Fr><FI><FR>it to be so<Fr><Fi><FR> now<Fr><WG737><FR>: for<Fr><WG1063><FR> thus<Fr><WG3779><FR> it becometh<Fr><WG4241><WG2076><FR> us<Fr><WG2254><FR> to fulfil<Fr><WG4137><FR> all<Fr><WG3956><FR> righteousness.<Fr><WG1343> Then<WG5119> he suffered<WG863> him<WG846>.',
      kjv,
    ),
    'And Jesus answering said unto him, Suffer [it to be so] now: for thus it becometh us to fulfil all righteousness. Then he suffered him.',
  );
  assert.equal(
    text(
      '<FO>Behold<Fo><WG2400><FO>, a virgin<Fo><WG3933><FO> shall be with child<Fo><WG1722><WG1064><WG2192><FO>, and<Fo><WG2532><FO> shall bring forth<Fo><WG5088><FO> a son<Fo><WG5207><FO>, and<Fo><WG2532><FO> they shall call<Fo><WG2564><FO> his<Fo><WG846><FO> name<Fo><WG3686><FO> Emmanuel<Fo><WG1694><FO>,<Fo> which<WG3739> being interpreted<WG3177> is<WG2076>, God<WG2316> with<WG3326> us<WG2257>.<RF>they: or, his name shall be called<Rf>',
      kjv,
    ),
    'Behold, a virgin shall be with child, and shall bring forth a son, and they shall call his name Emmanuel, which being interpreted is, God with us. ⸨they: or, his name shall be called⸩',
  );
});

void test('a note anchored directly on a word gets a space before it', () => {
  assert.equal(text('Choose<WH6901> thee<RF>Choose: Heb. Take<Rf>', kjv), 'Choose thee ⸨Choose: Heb. Take⸩');
});

void test('html tags and line marks are dropped with their content kept', () => {
  assert.equal(text('a <b>bold</b> <font color=red>word</font><CL> <sup>1</sup>', ukrio), 'a bold word 1');
});

void test('darby: a nested bracket is flattened', () => {
  assert.equal(
    text(
      'for <FI>he<Fi> is bringing the matter to an end, and <FI>cutting <FI>it<Fi> short in righteousness; because<Fi> a cutting short of the matter will <FI>the<Fi> Lord accomplish upon the earth.',
      darby,
    ),
    'for [he] is bringing the matter to an end, and [cutting it short in righteousness; because] a cutting short of the matter will [the] Lord accomplish upon the earth.',
  );
});

void test('darby: a bracket crossing verse lines closes at the end of one line and opens at the start of the next', () => {
  assert.equal(
    text(
      'In these lay a multitude of sick, blind, lame, withered, <FI>awaiting the moving of the water.',
      darby,
    ),
    'In these lay a multitude of sick, blind, lame, withered, [awaiting the moving of the water.]',
  );
  assert.equal(
    text(
      'For an angel descended at a certain season in the pool and troubled the water. Whoever therefore first went in after the troubling of the water became well, whatever disease he laboured under.<Fi>',
      darby,
    ),
    '[For an angel descended at a certain season in the pool and troubled the water. Whoever therefore first went in after the troubling of the water became well, whatever disease he laboured under.]',
  );
});

void test('an unmatched close after a balanced pair flattens into one bracket from the line start', () => {
  assert.equal(text('a <FI>b<Fi> c<Fi> d', darby), '[a b c] d');
});

void test('darby: spaces inside a bracket and before punctuation after it are removed', () => {
  assert.equal(
    text(
      'And thou shalt make for the curtain five pillars of acacia<FI>  -wood<Fi> , and overlay them with gold; their hooks shall be of gold; and thou shalt cast five bases of copper for them.<CM>',
      darby,
    ),
    'And thou shalt make for the curtain five pillars of acacia[-wood], and overlay them with gold; their hooks shall be of gold; and thou shalt cast five bases of copper for them.',
  );
  assert.equal(text('so <FI> <Fi> be it', darby), 'so be it');
});

void test('darby: psalm title tags are dropped and the title kept', () => {
  assert.equal(
    text(
      '<FO><FO>A Psalm of David, when he fled from Absalom his son.<Fo><Fo> Jehovah, how many are they that trouble me, many they that rise up against me!',
      darby,
    ),
    'A Psalm of David, when he fled from Absalom his son. Jehovah, how many are they that trouble me, many they that rise up against me!',
  );
});

void test('darby: * and + markers are kept', () => {
  assert.equal(
    text(
      'But *I* say unto you, that every one that is lightly angry with his brother shall be subject to the judgment; but whosoever shall say to his brother, Raca, shall be subject to <FI>be called before<Fi> the sanhedrim; but whosoever shall say, Fool, shall be subject to the penalty of the hell of fire.',
      darby,
    ),
    'But *I* say unto you, that every one that is lightly angry with his brother shall be subject to the judgment; but whosoever shall say to his brother, Raca, shall be subject to [be called before] the sanhedrim; but whosoever shall say, Fool, shall be subject to the penalty of the hell of fire.',
  );
  assert.equal(
    text(
      'And he blessed him, and said, Blessed be Abram of the Most High *God, possessor of heavens and earth.',
      darby,
    ),
    'And he blessed him, and said, Blessed be Abram of the Most High *God, possessor of heavens and earth.',
  );
  assert.equal(
    text(
      'They sacrificed unto demons who are not +God; To gods whom they knew not, To new ones, who came newly up, Whom your fathers revered not.',
      darby,
    ),
    'They sacrificed unto demons who are not +God; To gods whom they knew not, To new ones, who came newly up, Whom your fathers revered not.',
  );
});

void test('stars and plus signs are kept as the module marks them', () => {
  assert.equal(text('a *b* +c', kjv), 'a *b* +c');
});

void test('gerelb: a leading <WTH> tag is a native ref at the line start', () => {
  assert.deepEqual(cleanVerse('<WTH5:20> Und Jehova redete zu Mose und sprach:', gerelb), {
    text: 'Und Jehova redete zu Mose und sprach:',
    nativeRefs: ['5:20'],
    startsWithRef: true,
  });
});

void test('gerelb: a leading and a mid-line <WTG> tag give two native refs', () => {
  assert.deepEqual(
    cleanVerse(
      '<WTG12:18> Und ich stand auf dem Sande des Meeres.<WTG13:1> Und ich sah aus dem Meere ein Tier aufsteigen, welches zehn Hörner und sieben Köpfe hatte, und auf seinen Hörnern zehn Diademe, und auf seinen Köpfen Namen der Lästerung.',
      gerelb,
    ),
    {
      text: 'Und ich stand auf dem Sande des Meeres. Und ich sah aus dem Meere ein Tier aufsteigen, welches zehn Hörner und sieben Köpfe hatte, und auf seinen Hörnern zehn Diademe, und auf seinen Köpfen Namen der Lästerung.',
      nativeRefs: ['12:18', '13:1'],
      startsWithRef: true,
    },
  );
});

void test('gerelb: a mid-line tag only does not start the line', () => {
  assert.deepEqual(
    cleanVerse(
      'sondern ich hoffe, dich bald zu sehen, und wir wollen mündlich miteinander reden.<WTG1:15> Friede dir! Es grüßen dich die Freunde. Grüße die Freunde mit Namen.<CM>',
      gerelb,
    ),
    {
      text: 'sondern ich hoffe, dich bald zu sehen, und wir wollen mündlich miteinander reden. Friede dir! Es grüßen dich die Freunde. Grüße die Freunde mit Namen.',
      nativeRefs: ['1:15'],
      startsWithRef: false,
    },
  );
});

void test('WT tags are dropped without a ref when the rules do not collect them', () => {
  assert.deepEqual(cleanVerse('<WTH5:20> Und Jehova', kjv), {
    text: 'Und Jehova',
    nativeRefs: [],
    startsWithRef: false,
  });
});

void test('gerelb: traditional-text brackets, including a lone open and a lone close', () => {
  assert.equal(
    text(
      'Ich aber sage euch, daß jeder, der seinem Bruder <FI>ohne Grund<Fi> zürnt, dem Gericht verfallen sein wird; wer aber irgend zu seinem Bruder sagt: Raka! dem Synedrium verfallen sein wird; wer aber irgend sagt: Du Narr! der Hölle des Feuers verfallen sein wird.',
      gerelb,
    ),
    'Ich aber sage euch, daß jeder, der seinem Bruder [ohne Grund] zürnt, dem Gericht verfallen sein wird; wer aber irgend zu seinem Bruder sagt: Raka! dem Synedrium verfallen sein wird; wer aber irgend sagt: Du Narr! der Hölle des Feuers verfallen sein wird.',
  );
  assert.equal(
    text(
      '<FI> Als er aber früh am ersten Wochentage auferstanden war, erschien er zuerst der Maria Magdalene, von welcher er sieben Dämonen ausgetrieben hatte.',
      gerelb,
    ),
    '[Als er aber früh am ersten Wochentage auferstanden war, erschien er zuerst der Maria Magdalene, von welcher er sieben Dämonen ausgetrieben hatte.]',
  );
  assert.equal(
    text('<FI> Und<Fi> ein jeder ging nach seinem Hause.<CM>', gerelb),
    '[Und] ein jeder ging nach seinem Hause.',
  );
  assert.equal(
    text('wo ihr Wurm nicht stirbt und das Feuer nicht erlischt<Fi> .', gerelb),
    '[wo ihr Wurm nicht stirbt und das Feuer nicht erlischt].',
  );
});

void test('gerelb: the trailing dash is stripped', () => {
  assert.equal(
    text(
      'Mann und Weib schuf er sie, und er segnete sie und gab ihnen den Namen Mensch, an dem Tage, da sie geschaffen wurden. -',
      gerelb,
    ),
    'Mann und Weib schuf er sie, und er segnete sie und gab ihnen den Namen Mensch, an dem Tage, da sie geschaffen wurden.',
  );
  assert.equal(text('wurden. -<CM>', gerelb), 'wurden.');
  assert.equal(text('- - -', darby), '- - -');
});

void test('rst: a leading (c:v) is a native ref removed from the text', () => {
  assert.deepEqual(cleanVerse('(13:2) И сказал Господь Моисею, говоря:', rst), {
    text: 'И сказал Господь Моисею, говоря:',
    nativeRefs: ['13:2'],
    startsWithRef: true,
  });
  assert.deepEqual(
    cleanVerse(
      '(14:24) Могущему же утвердить вас, по благовествованию моему и проповеди Иисуса Христа, по откровению тайны, о которой от вечных времен было умолчано,',
      rst,
    ).nativeRefs,
    ['14:24'],
  );
});

void test('rst: a title between a leading and a mid-line ref keeps its text', () => {
  assert.deepEqual(
    cleanVerse(
      '(11:1) ^^Начальнику хора. На восьмиструнном. Псалом Давида.^^ (11:2) Спаси, Господи, ибо не стало праведного, ибо нет верных между сынами человеческими.',
      rst,
    ),
    {
      text: 'Начальнику хора. На восьмиструнном. Псалом Давида. Спаси, Господи, ибо не стало праведного, ибо нет верных между сынами человеческими.',
      nativeRefs: ['11:1', '11:2'],
      startsWithRef: true,
    },
  );
  assert.deepEqual(
    cleanVerse(
      '(50:1) ^^Начальнику хора. Псалом Давида, (50:2) Когда приходил к нему пророк Нафан, после того, как Давид вошел к Вирсавии. (50:3) Помилуй меня, Боже, по великой милости Твоей, и по множеству щедрот Твоих изгладь беззакония мои.^^',
      rst,
    ).nativeRefs,
    ['50:1', '50:2', '50:3'],
  );
});

void test('rst: a mid-line ref after a title does not start the line', () => {
  assert.deepEqual(
    cleanVerse(
      '^^Псалом Давида, когда он бежал от Авессалома, сына своего.^^ (3:2) Господи! как умножились враги мои! Многие восстают на меня',
      rst,
    ),
    {
      text: 'Псалом Давида, когда он бежал от Авессалома, сына своего. Господи! как умножились враги мои! Многие восстают на меня',
      nativeRefs: ['3:2'],
      startsWithRef: false,
    },
  );
  assert.deepEqual(
    cleanVerse(
      "И сказал Ионафан Давиду: иди с миром; а в чем клялись мы оба именем Господа, говоря: 'Господь да будет между мною и между тобою и между семенем моим и семенем твоим', то да будет на веки. (20:43) И встал [Давид] и пошел, а Ионафан возвратился в город.",
      rst,
    ),
    {
      text: "И сказал Ионафан Давиду: иди с миром; а в чем клялись мы оба именем Господа, говоря: 'Господь да будет между мною и между тобою и между семенем моим и семенем твоим', то да будет на веки. И встал [Давид] и пошел, а Ионафан возвратился в город.",
      nativeRefs: ['20:43'],
      startsWithRef: false,
    },
  );
});

void test('rst: parentheses without chapter:verse are text, not refs', () => {
  const cases = [
    '(Между тем один скрытно сидел у нее в спальне.) И сказала ему: Самсон! Филистимляне [идут] на тебя. Он разорвал тетивы, как разрывают нитку из пакли, когда пережжет ее огонь. И не узнана сила его.',
    '(Миха) сказал: вы взяли богов моих, которых я сделал, и священника, и ушли; чего еще более? как же вы говорите: что тебе?',
    'И сказала ему жена его: ты все еще тверд в непорочности твоей! похули Бога и умри. (1)',
  ];
  for (const line of cases)
    assert.deepEqual(cleanVerse(line, rst), { text: line, nativeRefs: [], startsWithRef: false });
});

void test('rst: the module’s own brackets are kept as they are', () => {
  assert.equal(
    text('И назвал Бог сушу землею, а собрание вод назвал морями. И увидел Бог, что [это] хорошо.', rst),
    'И назвал Бог сушу землею, а собрание вод назвал морями. И увидел Бог, что [это] хорошо.',
  );
});

void test('ukrio: normalized (c:v) markers are native refs; carets are kept without the title rule', () => {
  assert.deepEqual(cleanVerse('(5:20) І Господь промовляв до Мойсея, говорячи:', ukrio), {
    text: 'І Господь промовляв до Мойсея, говорячи:',
    nativeRefs: ['5:20'],
    startsWithRef: true,
  });
  assert.equal(text('a ^^b^^', ukrio), 'a ^^b^^');
});

void test('paren refs are text when the rules do not collect them', () => {
  assert.deepEqual(cleanVerse('(13:2) And', kjv), {
    text: '(13:2) And',
    nativeRefs: [],
    startsWithRef: false,
  });
});

void test('an empty line cleans to empty text', () => {
  assert.deepEqual(cleanVerse('', ukrio), { text: '', nativeRefs: [], startsWithRef: false });
  assert.deepEqual(cleanVerse('<CM>', kjv), { text: '', nativeRefs: [], startsWithRef: false });
});

void test('an unclosed note keeps its text to the end of the line', () => {
  assert.equal(text('word.<RF>a note', kjv), 'word. ⸨a note⸩');
  assert.equal(text('word.<RF> <Rf>', kjv), 'word.');
});

void test('a stray < is kept as text', () => {
  assert.equal(text('a < b', ukrio), 'a < b');
});
