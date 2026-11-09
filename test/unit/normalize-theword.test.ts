import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { z } from 'zod/v4';
import { decodeOriginal, normalizeAll } from '../../scripts/normalize-theword.ts';
import { BOOKS } from '../../src/domain/books.ts';
import { KJV_LINES, lineIndex } from '../../src/domain/kjv.ts';
import { decodeModule } from '../../src/ingest/theword.ts';

const DIR = fileURLToPath(new URL('../../data/theword/', import.meta.url));

const manifest = z
  .object({
    modules: z.array(
      z.object({
        file: z.string(),
        sha256: z.string(),
        edits: z.array(z.string()),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync(`${DIR}MANIFEST.json`, 'utf8')));

const lines = (file: string): readonly string[] => {
  const entry = manifest.modules.find((m) => m.file === file);
  assert.ok(entry, file);
  const decoded = decodeModule(readFileSync(`${DIR}${file}`));
  assert.ok(decoded.ok, file);
  return decoded.value.lines;
};

const verse = (module: readonly string[], ref: string): string => {
  const m = /^(\S+) (\d+):(\d+)$/.exec(ref);
  const book = BOOKS.find((b) => b.id === m?.[1]);
  assert.ok(m && book, ref);
  const index = lineIndex(book, Number(m[2]), Number(m[3]));
  assert.notEqual(index, null, ref);
  return module[index ?? 0] ?? '';
};

void test('original windows-1251 and windows-1252 bytes decode to Cyrillic, umlauts and the ellipsis', () => {
  // "Бог" in windows-1251.
  assert.equal(decodeOriginal(Uint8Array.from([0xc1, 0xee, 0xe3]), 'windows-1251'), 'Бог');
  // "Hörner…" in windows-1252: 0xF6 = ö, 0x85 = U+2026.
  assert.equal(
    decodeOriginal(Uint8Array.from([0x48, 0xf6, 0x72, 0x6e, 0x65, 0x72, 0x85]), 'windows-1252'),
    'Hörner…',
  );
  // The rest of 0x80-0x9F follows windows-1252 too, not Latin-1; undefined bytes stay as they are.
  assert.equal(decodeOriginal(Uint8Array.from([0x80, 0x93, 0x94, 0x9f, 0x81]), 'windows-1252'), '€“”Ÿ\u0081');
  assert.equal(decodeOriginal(new TextEncoder().encode('\uFEFFid=b9'), 'utf-8'), 'id=b9');
});

void test('a fresh normalization reproduces the committed modules and the manifest checksums', () => {
  const outputs = normalizeAll();
  assert.deepEqual(
    outputs.map((o) => o.entry.sha256),
    manifest.modules.map((m) => m.sha256),
  );
  for (const o of outputs) {
    assert.deepEqual(readFileSync(`${DIR}${o.spec.file}`), Buffer.from(o.bytes), o.spec.file);
  }
});

void test('every normalized module has one line per KJV verse', () => {
  for (const { file } of manifest.modules) assert.equal(lines(file).length, KJV_LINES, file);
});

void test('every verse line has balanced, unnested <FI>…<Fi>', () => {
  for (const { file } of manifest.modules) {
    lines(file).forEach((line, i) => {
      let depth = 0;
      for (const [tag] of line.matchAll(/<F[Ii]>/g)) {
        depth += tag === '<FI>' ? 1 : -1;
        assert.ok(depth === 0 || depth === 1, `${file} line ${i + 1}`);
      }
      assert.equal(depth, 0, `${file} line ${i + 1}`);
    });
  }
});

void test('Ohienko has text for every KJV verse', () => {
  const empty = lines('ukrio.ont').flatMap((l, i) => (l.trim() === '' ? [i] : []));
  assert.deepEqual(empty, []);
});

void test('Ohienko lines hold the KJV verse, with Ohienko’s own number where it differs', () => {
  const ukr = lines('ukrio.ont');
  const starts: readonly (readonly [string, string])[] = [
    ['Gen 31:55', '(32:1) І встав Лаван рано вранці'],
    ['Gen 32:1', '(32:2) А Яків пішов на дорогу свою.'],
    ['Lev 6:1', '(5:20) І Господь промовляв до Мойсея'],
    ['Lev 6:8', '(6:1) І Господь промовляв до Мойсея'],
    ['Ps 3:1', 'Псалом Давидів, як він утікав був від перед Авесаломом, своїм сином. (3:2) Господи,'],
    ['Ps 3:2', '(3:3) Багато-хто кажуть про душу мою'],
    ['Ps 116:10', '(116:1) Я вірив, коли говорив'],
    ['Joel 2:28', '(3:1) І буде потому, виллю Я Духа Свого на кожне тіло'],
    ['Joel 3:1', '(4:1) Бо ось тими днями'],
    ['Joel 3:21', '(4:21) і помщу за їхню кров'],
    ['Hos 13:16', '(14:1) Завинить Самарія'],
    ['Mal 4:1', 'Бо ось наступає той день, що палає, як піч'],
    ['Acts 19:41', '(19:40) І, промовивши це, розпустив він громаду.'],
    ['2Cor 13:14', '(13:13) Благодать Господа нашого Ісуса Христа'],
    ['Rev 12:17', 'І змій розлютувався на жінку'],
    ['Rev 13:1', '(12:18) І я став на морському піску. (13:1) І я бачив звірину'],
  ];
  for (const [ref, start] of starts)
    assert.ok(verse(ukr, ref).startsWith(start), `${ref}: ${verse(ukr, ref)}`);
  assert.ok(verse(ukr, 'Rev 12:17').endsWith('мають свідоцтво Ісусове.'));
  assert.equal(verse(ukr, 'Joel 3:21').includes('Самарія'), false);
  assert.equal(
    verse(ukr, 'Ps 41:13'),
    '(41:14) Благословенний Господь, Бог ізраїлів, від віку й до віку! Амінь і амінь!',
  );
});

void test('RST Song 1, Ps 90 and Isa 3 are on the KJV verses', () => {
  const rst = lines('rst.ont');
  assert.equal(verse(rst, 'Song 1:1'), '');
  assert.ok(verse(rst, 'Song 1:2').startsWith('Да лобзает он меня'));
  assert.equal(verse(rst, 'Song 1:17'), 'кровли домов наших--кедры, потолки наши--кипарисы.');
  assert.equal(
    verse(rst, 'Ps 90:1'),
    '(89:1) Молитва Моисея, человека Божия. (89:2) Господи! Ты нам прибежище в род и род.',
  );
  assert.ok(verse(rst, 'Ps 90:6').startsWith('(89:6) утром цветет'));
  assert.equal(verse(rst, 'Isa 3:19'), 'серьги, и ожерелья, и опахала,');
  assert.ok(verse(rst, 'Isa 3:26').startsWith('И будут воздыхать'));
});

void test('Elberfelder brackets Mark 16:9-20 and John 7:53-8:11 verse by verse', () => {
  const elb = lines('gerelb.ont');
  for (const ref of ['Mark 16:9', 'Mark 16:20', 'John 7:53', 'John 8:1', 'John 8:11']) {
    assert.match(verse(elb, ref), /^<FI>[^<]*<Fi>(<CM>)?$/, ref);
  }
  assert.equal(verse(elb, 'John 8:12').includes('<FI>'), false);
});

void test('the KJV module is copied without edits', () => {
  assert.deepEqual(manifest.modules.find((m) => m.file === 'kjv.ont')?.edits, []);
});
