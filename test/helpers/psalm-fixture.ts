import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSchema, load } from '../../src/ingest/load.ts';

const RAW = fileURLToPath(new URL('../fixtures/raw/', import.meta.url));
const lines = (name: string): string[] => readFileSync(`${RAW}${name}`, 'utf8').split('\n');

/** Word lines of Psalm 3 verses 0 to 2 (English numbering), copied unchanged from TAHOT; verse 0 is the superscription. */
const PSALM_3: readonly string[] = [
  'Psa.3.0(3.1)#01=L\tמִזְמ֥וֹר\tmiz.Mor\ta psalm\t{H4210}\tHNcmsa\t\t\tH4210\t\t\t{H4210=מִזְמוֹר=melody}\t\t\t\t\t',
  'Psa.3.0(3.1)#02=L\tלְ/דָוִ֑ד\tle./da.Vid\tof/ David\tH9005/{H1732}\tHR/Npm\t\t\tH1732\t\t\tH9005=ל=to/{H1732=דָּוִד=David»David@Rut.4.17-Rev}\t\t\t\t\t',
  'Psa.3.0(3.1)#03=L\tבְּ֝/בָרְח֗/וֹ\tbe./va.re.Ch/o\twhen/ fled/ he\tH9003/{H1272}/H9043\tHR/Vqcc/Sp3ms\t\t\tH1272\t\t\tH9003=ב=in/{H1272=בָּרַח=to flee}/H9043=Ss3m=he\t\t\t\t\t',
  'Psa.3.0(3.1)#04=L\tמִ/פְּנֵ֤י\\׀\tmi./pe.Nei\tfrom/ before\tH9006/{H6440G}\\H9015\tHR/Ncmpc\t\t\tH6440G\t\t\tH9006=מ=from/{H6440G=פָּנֶה=: before»face:2_before;_to;_front}\\H9015=׀=separate\t\t\t\t\t',
  "Psa.3.0(3.1)#05=L\tאַבְשָׁל֬וֹם\t'av.sha.Lom\tAbsalom\t{H0053}\tHNpm\t\t\tH0053\t\t\t{H0053=אֲבִישָׁלוֹם=Absalom»Absalom@2Sa.3.3-Psa}\t\t\t\t\t",
  'Psa.3.0(3.1)#06=L\tבְּנֽ/וֹ\\׃\tbe.N/o\tson/ his\t{H1121A}/H9023\\H9016\tHNcmsc/Sp3ms\t\t\tH1121A\t\t\t{H1121A=בֵּן=: child»son:1_child;_son}/H9023=Ps3m=his\\H9016=׃=verseEnd\t\t\t\t\t',
  'Psa.3.1(3.2)#01=L\tיְ֭הוָה\tYah.weh\tO Yahweh\t{H3068G}\tHNpt\t\t\tH3068G\t\t\t{H3068G=יהוה=LORD»LORD@Gen.1.1-Heb}\t\t\t\t\t',
  'Psa.3.1(3.2)#02=L\tמָֽה\\־\tmah-\thow!\t{H4100}\\H9014\tHPi\t\t\tH4100\t\t\t{H4100=מָה=what?}\\H9014=־=link\t\t\t\t\t',
  'Psa.3.1(3.2)#03=L\tרַבּ֣וּ\tra.Bu\tthey are many\t{H7231}\tHVqp3cp\t\t\tH7231\t\t\t{H7231=רָבַב=to multiply}\t\t\t\t\t',
  'Psa.3.1(3.2)#04=L\tצָרָ֑/י\ttza.Ra/i\topponents/ my\t{H6862C}/H9020\tHNcmpc/Sp1bs\t\t\tH6862C\t\t\t{H6862C=צַר=enemy}/H9020=Ps1c=my\t\t\t\t\t',
  'Psa.3.1(3.2)#05=L\tרַ֝בִּ֗ים\tra.Bim\tmany [people]\t{H7227A}\tHAampa\t\t\tH7227A\t\t\t{H7227A=רַב=many}\t\t\t\t\t',
  'Psa.3.1(3.2)#06=L\tקָמִ֥ים\tka.Mim\t[are] rising up\t{H6965J}\tHVqrmpa\t\t\tH6965J\t\t\t{H6965J=קוּם=: attack»to arise:4_attack;_oppose}\t\t\t\t\t',
  "Psa.3.1(3.2)#07=L\tעָלָֽ/י\\׃\t'a.La/i\ton/ me\t{H5921A}/H9030\\H9016\tHR/Sp1bs\t\t\tH5921A\t\t\t{H5921A=עַל=upon}/H9030=Os1c=me\\H9016=׃=verseEnd\t\t\t\t\t",
  'Psa.3.2(3.3)#01=L\tרַבִּים֮\tra.Bim\tmany [people]\t{H7227A}\tHAampa\t\t\tH7227A\t\t\t{H7227A=רַב=many}\t\t\t\t\t',
  "Psa.3.2(3.3)#02=L\tאֹמְרִ֪ים\t'o.me.Rim\t[are] saying\t{H0559}\tHVqrmpa\t\t\tH0559\t\t\t{H0559=אָמַר=to say}\t\t\t\t\t",
  'Psa.3.2(3.3)#03=L\tלְ/נַ֫פְשִׁ֥/י\tle./Naf.Sh/i\tof/ self/ my\tH9005/{H5315G}/H9020\tHR/Ncfsc/Sp1bs\t\t\tH5315G\t\t\tH9005=ל=to/{H5315G=נֶ֫פֶשׁ=: soul»soul:1_soul;_heart}/H9020=Ps1c=my\t\t\t\t\t',
  "Psa.3.2(3.3)#04=L\tאֵ֤ין\t'ein\tthere not\t{H0369}\tHNcmsc\t\t\tH0369\t\t\t{H0369=אַ֫יִן=nothing}\t\t\t\t\t",
  "Psa.3.2(3.3)#05=L\tיְֽשׁוּעָ֓תָה\tye.shu.'A.tah\t[is] deliverance\t{H3444}\tHNcfsa\t\t\tH3444\t\t\t{H3444=יְשׁוּעָה=salvation}\t\t\t\t\t",
  'Psa.3.2(3.3)#06=L\tלּ֬/וֹ\tl/o\tfor/ him\tH9005/{H9033}\tHR/Sp3ms\t\t\tH9033\t\t\tH9005=ל=to/{H9033=Os3m=him}\t\t\t\t\t',
  'Psa.3.2(3.3)#07=L\tבֵֽ/אלֹהִ֬ים\tve./lo.Him\tin/ God\tH9003/{H0430G}\tHR/Ncmpa\t\t\tH0430G\t\t\tH9003=ב=in/{H0430G=אֱלֹהִים=God»LORD@Gen.1.1-Heb}\t\t\t\t\t',
  'Psa.3.2(3.3)#08=L\tסֶֽלָה\\׃\tSe.lah\tSelah\t{H5542}\\H9016\tHTj\t\t\tH5542\t\t\t{H5542=סֶ֫לָה=Selah»Selah@Psa.3.2-Hab}\\H9016=׃=verseEnd\t\t\t\t\t',
];

/** In-memory database holding only the Psalm 3 excerpt, whose chapter starts at verse 0. */
export const psalmDb = (): DatabaseSync => {
  const db = new DatabaseSync(':memory:');
  createSchema(db);
  const report = load(
    db,
    { tahot: [...PSALM_3], tbesh: lines('TBESH.txt'), tipnr: lines('TIPNR.txt') },
    { stepbible_commit: 'fixture' },
  );
  if (report.issues.length > 0)
    throw new Error(`psalm fixture has unparsable lines: ${report.issues.length}`);
  return db;
};
