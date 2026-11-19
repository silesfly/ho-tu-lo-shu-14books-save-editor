'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const SRC_DIR = path.join(__dirname, '..', 'src');
const REAL_SAVES_DIR = '/tmp/htls_saves_ro';

let passed = 0;
let realSavesVerified = 0;

function ok(msg) {
  passed += 1;
  console.log('[PASS] ' + msg);
}

function skip(msg) {
  console.log('[SKIP] ' + msg);
}

function loadSandbox() {
  const ctx = {};
  ctx.global = ctx;
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.console = console;
  ctx.TextDecoder = TextDecoder;
  ctx.TextEncoder = TextEncoder;
  ctx.Uint8Array = Uint8Array;
  ctx.Uint8ClampedArray = Uint8ClampedArray;
  ctx.Int8Array = Int8Array;
  ctx.Int16Array = Int16Array;
  ctx.Int32Array = Int32Array;
  ctx.Uint16Array = Uint16Array;
  ctx.Uint32Array = Uint32Array;
  ctx.Float32Array = Float32Array;
  ctx.Float64Array = Float64Array;
  ctx.DataView = DataView;
  ctx.ArrayBuffer = ArrayBuffer;
  ctx.BigInt = BigInt;
  ctx.Map = Map;
  ctx.Set = Set;
  ctx.Object = Object;
  ctx.Array = Array;
  ctx.Function = Function;
  ctx.JSON = JSON;
  ctx.Math = Math;
  ctx.Date = Date;
  ctx.Number = Number;
  ctx.String = String;
  ctx.Boolean = Boolean;
  ctx.RegExp = RegExp;
  ctx.Error = Error;
  ctx.TypeError = TypeError;
  ctx.RangeError = RangeError;
  ctx.parseInt = parseInt;
  ctx.parseFloat = parseFloat;
  ctx.isNaN = isNaN;
  ctx.isFinite = isFinite;
  ctx.Promise = Promise;
  ctx.Symbol = Symbol;

  const files = ['ssts-lz4-msgpack.js', 'catalog-data.js', 'editor-core.js'];
  for (const f of files) {
    const full = path.join(SRC_DIR, f);
    assert.ok(fs.existsSync(full), 'missing source file: ' + full);
    const code = fs.readFileSync(full, 'utf8');
    vm.runInNewContext(code, ctx, { filename: f, timeout: 30000 });
  }
  return ctx;
}

function toU8(x) {
  if (x instanceof Uint8Array) return x;
  if (x && x.buffer && typeof x.byteLength === 'number') {
    return new Uint8Array(x.buffer, x.byteOffset || 0, x.byteLength);
  }
  throw new Error('cannot coerce to Uint8Array');
}

function decodeMagic(magic) {
  if (magic instanceof Uint8Array) return new TextDecoder().decode(magic);
  return String(magic || '');
}

function statValue(detail, statKey) {
  const s = (detail && detail.stats || []).find((x) => x.key === statKey);
  return s ? s.value : undefined;
}

const ctx = loadSandbox();
const SstsCodec = ctx.SstsCodec;
const SstsCatalog = ctx.SstsCatalog;
const SstsEditorCore = ctx.SstsEditorCore;

assert.ok(SstsCodec, 'SstsCodec not exposed');
assert.ok(SstsCatalog, 'SstsCatalog not exposed');
assert.ok(SstsEditorCore, 'SstsEditorCore not exposed');
ok('modules loaded from src/ into VM sandbox');

assert.equal(typeof SstsCodec.parseSave, 'function');
assert.equal(typeof SstsCodec.serializeSave, 'function');
assert.equal(typeof SstsCodec.getGameDataField, 'function');
assert.equal(typeof SstsCodec.getCharacterIds, 'function');
assert.equal(typeof SstsCodec.getWulinLogLines, 'function');
assert.equal(typeof SstsCodec.setWulinLogLines, 'function');
assert.equal(typeof SstsCodec.getFlagValue, 'function');
assert.equal(typeof SstsCodec.setFlagValue, 'function');
assert.equal(typeof SstsEditorCore.createSession, 'function');
assert.equal(typeof SstsEditorCore.createDemoSave, 'function');
assert.ok(Array.isArray(SstsEditorCore.PRESETS));
assert.equal(SstsEditorCore.EQUIP_SLOTS.length, 9);
ok('required 14books API surface present');

// Catalog keys & counts
const requiredCatalogKeys = [
  'stats', 'difficulties', 'equipSlots', 'talentTrees', 'codeAtlas',
  'normalInventory', 'equipment', 'skills', 'talents', 'nicknames',
  'areas', 'teleporters', 'npcNames', 'buffs', 'wulinTujian',
  'achievements', 'qzzlPasses'
];
for (const k of requiredCatalogKeys) {
  assert.ok(k in SstsCatalog, 'missing catalog key: ' + k);
}
assert.equal(Object.keys(SstsCatalog.stats).length, 48);
assert.equal(Object.keys(SstsCatalog.equipSlots).length, 9);
assert.equal(Object.keys(SstsCatalog.wulinTujian).length, 457);
ok('catalog schema keys & counts verified (48 stats, 9 equipSlots, 457 wulinTujian)');

// Catalog hygiene check (zero Hanzi, zero HTML/Unity tags, zero [object Object])
const CJK_RE = /[\u4E00-\u9FFF]/;
const TAG_RE = /<\/?[a-zA-Z][^>]*>/;
const catalogViolations = [];
function walkCatalog(node, labelPath) {
  if (node == null) return;
  const t = typeof node;
  if (t === 'string') {
    if (CJK_RE.test(node)) catalogViolations.push({ path: labelPath, reason: 'CJK', value: node });
    if (TAG_RE.test(node)) catalogViolations.push({ path: labelPath, reason: 'TAG', value: node });
    if (node.indexOf('[object Object]') >= 0) catalogViolations.push({ path: labelPath, reason: 'OBJ', value: node });
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) walkCatalog(node[i], labelPath + '[' + i + ']');
    return;
  }
  if (t === 'object') {
    for (const k of Object.keys(node)) walkCatalog(node[k], labelPath + '.' + k);
  }
}
walkCatalog(SstsCatalog, 'SstsCatalog');
assert.equal(catalogViolations.length, 0, 'catalog hygiene violations: ' + JSON.stringify(catalogViolations.slice(0, 10)));
ok('catalog has zero CJK/Hanzi, zero HTML/Unity tags, zero [object Object]');

// Demo save unit, WulinLog, Mod metadata, 9 equip slots, WulinTujian, Flag, string IDs
const demoU8 = toU8(SstsEditorCore.createDemoSave());
assert.ok(demoU8.length > 0);
const demoParsed = SstsCodec.parseSave(demoU8);
assert.equal(decodeMagic(demoParsed.magic), 'HELUO_1_1');
assert.equal(demoParsed.hasWulinLog, true);
assert.ok(SstsCodec.getWulinLogLines(demoParsed).length >= 2);
ok('demo save magic = HELUO_1_1 with SSTS-WULINLOG-V2 appendix');

const demoSession = SstsEditorCore.createSession(demoU8, 'demo.save');
const demoValid = demoSession.validate();
assert.equal(demoValid.ok, true, 'demo validate failed: ' + JSON.stringify(demoValid.errors));

const demoCharList = demoSession.getCharacterList();
const playerEntry = demoCharList.find((c) => c.isPlayer === true);
assert.ok(playerEntry, 'Player character missing');
const playerKey = playerEntry.id;
ok('demo save has Player character');

// Basics, string IDs, world settings, ModId/ModName, Money
demoSession.setCharacterBasics(playerKey, {
  surname: '남궁',
  givenName: '검객',
  level: 77,
  exp: 50000,
  nicknameId: 'n_demo_nick_01',
  currentNeiGongId: 'ng_non_numeric_id',
  currentQingGongId: 'qg_non_numeric_id',
});
demoSession.setWorldSettings({
  daysFromBeginning: 1234,
  unlockAllTeleporters: true,
  modId: 'SSTS_CUSTOM',
  modName: '십사천서-테스트',
});
demoSession.setCharacterStat(playerKey, 'Money', 4321);
const detailAfter = demoSession.getCharacterDetail(playerKey);
assert.equal(detailAfter.surname, '남궁');
assert.equal(detailAfter.givenName, '검객');
assert.equal(detailAfter.level, 77);
assert.equal(detailAfter.nicknameId, 'n_demo_nick_01');
assert.equal(detailAfter.currentNeiGongId, 'ng_non_numeric_id');
assert.equal(detailAfter.currentQingGongId, 'qg_non_numeric_id');
assert.equal(statValue(detailAfter, 'Money'), 4321);
ok('basics, string IDs, ModId/ModName, and Money updates work');

// 9 EquipType slots roundtrip
const equipIds = Object.keys(SstsCatalog.equipment).slice(0, 9);
assert.equal(equipIds.length, 9);
const expectedSlots = ['MajorWeapon', 'MinorWeapon', 'Cloth', 'Jewelry', 'Book', 'Fashion', 'Accessory', 'Cloak', 'Hat'];
assert.deepEqual(Array.from(SstsEditorCore.EQUIP_SLOTS), expectedSlots);
const startInvLen = demoSession.getCharacterDetail(playerKey).inventory.length;
for (let i = 0; i < 9; i++) {
  demoSession.addInventoryItem(playerKey, equipIds[i], 1);
  demoSession.setEquipSlot(playerKey, expectedSlots[i], startInvLen + i);
}
demoSession.setEquipSlot(playerKey, 'Cloak', null);
ok('all 9 EquipType slots equipped & Cloak unequipped cleanly');

// Inventory, skills, talents, Flag, WulinTujian, WulinLog edits
const normalAdd = Object.keys(SstsCatalog.normalInventory)[0];
const skillAdd = Object.keys(SstsCatalog.skills)[0];
const talentAdd = Object.keys(SstsCatalog.talents)[0];
const tujianKey = Object.keys(SstsCatalog.wulinTujian)[0];
demoSession.addInventoryItem(playerKey, normalAdd, 3);
demoSession.setSkillMastery(playerKey, skillAdd, { currentExp: 9999, maxExp: 9999, isExpert: true });
demoSession.setTalentNodes(playerKey, [talentAdd], 10);
demoSession.setFlag('custom_preserved_flag', 1);
demoSession.setFlag('test_flag_alpha', 42);
demoSession.setWulinTujianState(tujianKey, { met: true, unlocked: true });
demoSession.setWulinLog(['첫번째 일지', '두번째 일지', '십사천서 14권 테스트']);
ok('added items, skill mastery, talent node, flags, wulinTujian, wulinLog');

// Verify all 7 presets
const expectedPresets = [
  'rich_hero',
  'hero_max_stats',
  'hero_all_talents',
  'party_heal_cleanse',
  'unlock_teleporters',
  'hero_master_skills',
  'unlock_wulin_tujian',
];
const presetIds = new Set(SstsEditorCore.PRESETS.map((p) => p.id));
for (const p of expectedPresets) {
  assert.ok(presetIds.has(p), 'missing preset: ' + p);
  const fresh = SstsEditorCore.createSession(toU8(SstsEditorCore.createDemoSave()), 'preset-' + p + '.save');
  SstsEditorCore.applyPreset(fresh, p);
  const v = fresh.validate();
  assert.equal(v.ok, true, 'preset ' + p + ' invalid: ' + JSON.stringify(v.errors));
}
ok('all 7 presets apply cleanly on demo save');

// Serialize & reparse verification
const demoOutU8 = toU8(demoSession.syncHeaderAndSave());
const demoOutParsed = SstsCodec.parseSave(demoOutU8);
const demoOutSession = SstsEditorCore.createSession(demoOutU8, 'demo-out.save');
assert.equal(demoOutSession.validate().ok, true, 'reparsed demo invalid');

const outDetail = demoOutSession.getCharacterDetail(playerKey);
assert.equal(statValue(outDetail, 'Money'), 4321);
assert.equal(outDetail.level, 77);
assert.equal(outDetail.nicknameId, 'n_demo_nick_01');
assert.equal(outDetail.currentQingGongId, 'qg_non_numeric_id');
assert.equal(SstsCodec.getGameDataField(demoOutParsed, 'DaysFromBeginning'), 1234);
assert.equal(SstsCodec.getGameDataField(demoOutParsed, 'ModId'), 'SSTS_CUSTOM');
assert.equal(demoOutParsed.header.playerLevel, 77);
assert.equal(demoOutParsed.hasWulinLog, true);
assert.equal(demoOutSession.getWulinLog().lines[2], '십사천서 14권 테스트');
assert.equal(demoOutSession.getFlag('test_flag_alpha'), 42);
assert.equal(demoOutSession.getFlag('custom_preserved_flag'), 1);
assert.equal(demoOutSession.getFlag('wulin_met_' + tujianKey), 1);
assert.equal(demoOutSession.getFlag('wulin_unlock_' + tujianKey), 1);
assert.ok(outDetail.equip.Accessory && outDetail.equip.Accessory.ItemId === equipIds[6]);
assert.ok(outDetail.equip.Hat && outDetail.equip.Hat.ItemId === equipIds[8]);
assert.equal(outDetail.equip.Cloak, null);
ok('reparsed demo preserves edits, 9-slot equip, Flag, WulinTujian, WulinLog & header sync');

// Corrupt SSTS-WULINLOG-V2 footer rejection
const corruptFooter = new Uint8Array(demoOutU8);
const lp = corruptFooter.length - 20;
corruptFooter[lp] = 0xFF;
corruptFooter[lp + 1] = 0xFF;
corruptFooter[lp + 2] = 0xFF;
corruptFooter[lp + 3] = 0xFF;
assert.throws(() => SstsCodec.parseSave(corruptFooter), /appendix|length/i);
ok('corrupt SSTS-WULINLOG-V2 appendix length throws cleanly');

const invList = SstsCodec.getGameDataField(demoOutParsed, 'inventoryNoList');
assert.ok(Array.isArray(invList) && invList.length > 0, 'inventoryNoList empty');
assert.equal(new Set(invList).size, invList.length, 'inventoryNoList has duplicates');
ok('inventoryNoList is unique (size=' + invList.length + ')');

// i64 and f32 type preservation roundtrip
const demoSer = SstsCodec.parseSave(toU8(SstsCodec.serializeSave(demoParsed)));
assert.equal(typeof demoParsed.header.saveTime, 'bigint');
assert.equal(demoSer.header.saveTime, demoParsed.header.saveTime);
assert.equal(typeof demoParsed.header.playedTime, 'bigint');
assert.equal(demoSer.header.playedTime, demoParsed.header.playedTime);
const origRate = SstsCodec.getGameDataField(demoParsed, 'SkillExpDistributionRate');
const newRate = SstsCodec.getGameDataField(demoSer, 'SkillExpDistributionRate');
assert.equal(newRate, origRate);
ok('serializeSave preserves i64 and f32 field types and values');

// Real save sweep + synthetic SSTS-WULINLOG-V2 preservation on real save copy
if (!fs.existsSync(REAL_SAVES_DIR)) {
  skip('real saves not mounted');
} else {
  const entries = fs.readdirSync(REAL_SAVES_DIR).filter((n) => n.toLowerCase().endsWith('.save')).sort();
  if (entries.length === 0) {
    skip('no *.save files in ' + REAL_SAVES_DIR);
  } else {
    let firstHandled = false;
    for (const name of entries) {
      const p = path.join(REAL_SAVES_DIR, name);
      const bytes = new Uint8Array(fs.readFileSync(p));
      const sess = SstsEditorCore.createSession(bytes, name);
      const v = sess.validate();
      assert.equal(v.ok, true, 'real save invalid: ' + name + ' :: ' + JSON.stringify(v.errors));
      realSavesVerified += 1;

      if (!firstHandled) {
        firstHandled = true;
        const origParsed = SstsCodec.parseSave(bytes);
        const beforeIds = SstsCodec.getCharacterIds(origParsed).slice().sort();

        SstsEditorCore.applyPreset(sess, 'rich_hero');
        sess.setCharacterStat('Player', 'Money', 888777666);
        sess.setWulinLog(['실전 세이브 무림일지 기록 1']);

        const outBytes = toU8(sess.syncHeaderAndSave());
        const reparsed = SstsCodec.parseSave(outBytes);
        assert.equal(reparsed.hasWulinLog, true);
        assert.deepEqual(Array.from(SstsCodec.getWulinLogLines(reparsed)), ['실전 세이브 무림일지 기록 1']);
        const reparsedSess = SstsEditorCore.createSession(outBytes, name);
        assert.equal(reparsedSess.validate().ok, true, 'real save reparse invalid');
        assert.equal(statValue(reparsedSess.getCharacterDetail('Player'), 'Money'), 888777666);

        const afterIds = SstsCodec.getCharacterIds(reparsed).slice().sort();
        assert.deepEqual(afterIds, beforeIds, 'NPC IDs not preserved losslessly');
        ok('real save ' + name + ': rich_hero + Money + WulinLog persisted; NPC IDs preserved (' + afterIds.length + ')');
      } else {
        ok('real save validated: ' + name);
      }
    }
    assert.equal(realSavesVerified, entries.length);
    ok('real save sweep complete: ' + realSavesVerified + ' file(s) verified');
  }
}

console.log('[SUMMARY] passed=' + passed + ' realSavesVerified=' + realSavesVerified);
process.exit(0);
