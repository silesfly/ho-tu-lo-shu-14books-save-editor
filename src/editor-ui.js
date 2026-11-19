'use strict';
(function () {
  const D = document;
  const $ = (id) => D.getElementById(id);
  const Core = window.SstsEditorCore;
  const Cat = window.SstsCatalog || {};
  const state = {
    session: null,
    fileName: '저장파일.save',
    cid: null,
    statGroup: '전체',
    tab: 'summary',
    picker: null,
    serverToken: '',
    serverSaves: [],
    nativeReady: false,
    dirty: false
  };

  const tabList = [
    ['summary', 'tab-btn-summary', 'panel-summary'],
    ['chara', 'tab-btn-chara', 'panel-chara'],
    ['skills', 'tab-btn-skills', 'panel-skills'],
    ['inventory', 'tab-btn-inventory', 'panel-inventory'],
    ['party', 'tab-btn-party', 'panel-party'],
    ['atlas', 'tab-btn-atlas', 'panel-atlas']
  ];

  function el(tag, text, cls) {
    const n = D.createElement(tag);
    if (text !== undefined && text !== null) n.textContent = String(text);
    if (cls) n.className = cls;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); return n; }
  function status(msg, bad) {
    const n = $('status-msg');
    if (!n) return;
    n.textContent = msg || '';
    n.className = bad ? 'error' : 'ok';
    n.dataset.kind = bad ? 'error' : 'success';
  }
  function setFile(name) {
    state.fileName = name || '저장파일.save';
    const b = $('file-badge');
    if (b) b.textContent = state.fileName;
    markDirty(false);
  }
  function markDirty(v) {
    state.dirty = !!v;
    const b = $('dirty-badge');
    if (b) {
      b.hidden = !state.dirty;
      b.dataset.dirty = state.dirty ? 'true' : 'false';
      b.textContent = state.dirty ? '미저장 변경' : '변경 없음';
    }
  }
  function opt(text, value, selected) {
    const o = el('option', text);
    o.value = value === undefined || value === null ? '' : String(value);
    o.selected = !!selected;
    return o;
  }
  function button(text, fn, cls) {
    const b = el('button', text, cls || '');
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function field(label, input) {
    const w = el('label', null, 'field');
    w.appendChild(el('span', label, 'field-label'));
    w.appendChild(input);
    return w;
  }
  function numInput(value, min, max, step) {
    const i = el('input');
    i.type = 'number';
    if (min !== undefined) i.min = String(min);
    if (max !== undefined) i.max = String(max);
    i.step = String(step || 1);
    i.value = value === undefined || value === null ? '' : String(value);
    return i;
  }
  function textInput(value, placeholder) {
    const i = el('input');
    i.type = 'text';
    i.value = value === undefined || value === null ? '' : String(value);
    if (placeholder) i.placeholder = placeholder;
    return i;
  }
  function selectInput(items, value, emptyText) {
    const s = el('select');
    if (emptyText !== undefined) s.appendChild(opt(emptyText, '', value === '' || value === null || value === undefined));
    (items || []).forEach((it) => {
      const id = it && (it.id !== undefined ? it.id : it.value);
      const name = it && (it.name !== undefined ? it.name : it.label);
      s.appendChild(opt(name !== undefined ? name : id, id, String(id) === String(value)));
    });
    return s;
  }
  function normalizeList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'object') {
      return Object.keys(v).map((k) => {
        const entry = v[k];
        if (entry && typeof entry === 'object') {
          const text = entry.name || entry.label || entry.id || k;
          return Object.assign({}, entry, { id: k, name: String(text), label: String(text) });
        }
        return { id: k, name: String(entry), label: String(entry) };
      });
    }
    return [];
  }
  function codeLabel(map, id) {
    if (!map) return id === null || id === undefined ? '' : String(id);
    if (Array.isArray(map)) {
      const f = map.find((x) => String(x.id !== undefined ? x.id : x.value) === String(id));
      return f ? (f.name || f.label || f.id) : String(id);
    }
    if (typeof map === 'object' && map[id] !== undefined) {
      const v = map[id];
      return typeof v === 'object' ? (v.name || v.label || id) : v;
    }
    return id === null || id === undefined ? '' : String(id);
  }
  function hasSession() {
    if (!state.session) {
      status('먼저 저장파일을 열어 주세요.', true);
      return false;
    }
    return true;
  }
  function refreshAll() {
    renderSummary();
    renderWulinLog();
    renderCharacters();
    renderCharacterDetail();
    renderSkillsTalents();
    renderInventory();
    renderParty();
    renderAtlas();
  }
  function applySession(session, name) {
    state.session = session;
    state.cid = null;
    const list = session.getCharacterList ? session.getCharacterList() : [];
    const player = list.find((x) => x.isPlayer) || list[0];
    state.cid = player ? player.id : null;
    setFile(name || state.fileName);
    const dl = $('btn-download-save');
    if (dl) dl.disabled = false;
    refreshAll();
    status('저장파일을 열었습니다.');
  }

  function u8ToB64(u8) {
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < u8.length; i += chunk) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
    }
    return btoa(s);
  }
  function b64ToU8(s) {
    const bin = atob(s || '');
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return u8;
  }
  function downloadU8(u8, name) {
    const blob = new Blob([u8], { type: 'application/octet-stream' });
    const a = el('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name || state.fileName || '저장파일.save';
    D.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 800);
  }
  function saveBytes() {
    if (!hasSession()) return null;
    const u8 = state.session.syncHeaderAndSave();
    markDirty(false);
    return u8;
  }
  function openBytes(u8, name) {
    if (!Core || !Core.createSession) {
      status('편집기 핵심 모듈을 찾지 못했습니다.', true);
      return false;
    }
    try {
      applySession(Core.createSession(u8, name), name);
      return true;
    } catch (e) {
      status('저장파일을 여는 중 오류가 발생했습니다.', true);
      return false;
    }
  }

  function setupTabs() {
    const tabs = tabList.map((x) => $(x[1])).filter(Boolean);
    tabs.forEach((btn, idx) => {
      btn.addEventListener('click', () => activateTab(tabList[idx][0]));
      btn.addEventListener('keydown', (ev) => {
        let next = -1;
        if (ev.key === 'ArrowRight') next = (idx + 1) % tabs.length;
        else if (ev.key === 'ArrowLeft') next = (idx + tabs.length - 1) % tabs.length;
        else if (ev.key === 'Home') next = 0;
        else if (ev.key === 'End') next = tabs.length - 1;
        if (next >= 0) {
          ev.preventDefault();
          activateTab(tabList[next][0]);
          tabs[next].focus();
        }
      });
    });
    activateTab('summary');
  }
  function activateTab(name) {
    const found = tabList.find((x) => x[0] === name) || tabList[0];
    state.tab = found[0];
    tabList.forEach((x) => {
      const b = $(x[1]);
      const p = $(x[2]);
      const on = x[0] === found[0];
      if (b) {
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        b.className = on ? 'tab-btn active' : 'tab-btn';
      }
      if (p) {
        p.hidden = !on;
        p.classList.toggle('active', on);
      }
    });
  }

  function renderSummary() {
    const cards = clear($('summary-cards'));
    const grid = clear($('preset-grid'));
    const form = clear($('world-form'));
    if (!cards || !grid || !form) return;
    const s = state.session;
    if (!s) {
      cards.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      grid.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      form.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      return;
    }
    const gf = (s._gameFields ? s._gameFields() : s.gameFields) || {};
    let ver = '';
    if (s.parsed && s.parsed.magic) {
      ver = s.parsed.magic instanceof Uint8Array
        ? new TextDecoder().decode(s.parsed.magic)
        : String(s.parsed.magic);
    }
    const logInfo = s.getWulinLog ? s.getWulinLog() : { hasWulinLog: false, lines: [] };
    const add = (k, v) => {
      const c = el('div', null, 'summary-card');
      c.appendChild(el('span', k, 'label'));
      c.appendChild(el('strong', v === undefined || v === null || v === '' ? '-' : v, 'value'));
      cards.appendChild(c);
    };
    add('파일', state.fileName);
    add('버전', ver);
    add('모드 식별자', gf.ModId || (s.parsed && s.parsed.header && s.parsed.header.modId) || '-');
    add('캐릭터 수', s.getCharacterList ? s.getCharacterList().length : 0);
    add('난이도', codeLabel(Cat.difficulties, gf.Difficulty));
    add('경과 일수', gf.DaysFromBeginning);
    add('동료 수', Array.isArray(gf.Teammates) ? gf.Teammates.length : 0);
    add('무림일지 줄 수', logInfo.hasWulinLog ? logInfo.lines.length : '미포함');

    const presets = Core && Core.PRESETS ? Core.PRESETS : [];
    if (!presets.length) grid.appendChild(el('p', '사용 가능한 프리셋이 없습니다.', 'empty'));
    presets.forEach((p) => {
      const c = el('div', null, 'preset-card');
      c.appendChild(el('strong', p.name || p.id));
      c.appendChild(el('p', p.description || '', 'muted'));
      c.appendChild(button('적용', () => {
        try {
          Core.applyPreset(state.session, p.id);
          markDirty(true);
          refreshAll();
          status('프리셋을 적용했습니다.');
        } catch (e) {
          status('프리셋 적용 중 오류가 발생했습니다.', true);
        }
      }, 'primary'));
      grid.appendChild(c);
    });

    const diff = normalizeList(Cat.difficulties);
    const dSel = selectInput(diff, gf.Difficulty);
    const days = numInput(gf.DaysFromBeginning, 0);
    const rate = numInput(gf.SkillExpDistributionRate, 0, undefined, 0.1);
    const modIdInp = textInput(gf.ModId || '', 'SSTS');
    const uT = el('input'); uT.type = 'checkbox'; uT.checked = !!(gf.AvailableTeleporters && gf.AvailableTeleporters.length);
    const uN = el('input'); uN.type = 'checkbox'; uN.checked = !!(gf.AvailableNicknames && gf.AvailableNicknames.length);
    form.appendChild(field('난이도', dSel));
    form.appendChild(field('경과 일수', days));
    form.appendChild(field('숙련 경험 배율', rate));
    form.appendChild(field('모드 식별자', modIdInp));
    form.appendChild(field('순간이동 모두 해금', uT));
    form.appendChild(field('별명 모두 해금', uN));
    form.appendChild(button('세계 설정 저장', () => {
      try {
        s.setWorldSettings({
          difficulty: Number(dSel.value),
          daysFromBeginning: Number(days.value),
          skillExpRate: Number(rate.value),
          modId: modIdInp.value,
          unlockAllTeleporters: uT.checked,
          unlockAllNicknames: uN.checked
        });
        markDirty(true);
        refreshAll();
        status('세계 설정을 저장했습니다.');
      } catch (e) {
        status('세계 설정 저장 중 오류가 발생했습니다.', true);
      }
    }, 'primary'));
  }

  function renderWulinLog() {
    const box = clear($('wulin-log-box'));
    if (!box) return;
    if (!state.session) {
      box.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      return;
    }
    const log = state.session.getWulinLog();
    const ta = el('textarea', (log.lines || []).join('\n'), 'log-textarea');
    ta.setAttribute('aria-label', '무림일지 내용');
    ta.placeholder = '무림일지 부록 줄을 한 줄씩 입력하거나 편집합니다.';
    const info = el('p', log.hasWulinLog ? '전용 로그 부록 포함됨 (' + log.lines.length + '줄)' : '전용 로그 부록 미포함 (저장 시 자동 생성)', 'muted');
    box.appendChild(info);
    box.appendChild(ta);
    box.appendChild(button('무림일지 저장', () => {
      try {
        const lines = ta.value === '' ? [] : ta.value.split(/\r?\n/);
        state.session.setWulinLog(lines);
        markDirty(true);
        renderSummary();
        renderWulinLog();
        renderAtlas();
        status('무림일지를 저장했습니다.');
      } catch (e) {
        status('무림일지 저장 중 오류가 발생했습니다.', true);
      }
    }, 'primary'));
  }

  function renderCharacters() {
    const filter = $('chara-filter');
    const sel = $('chara-select');
    if (!sel) return;
    const s = state.session;
    clear(sel);
    if (!s) {
      sel.appendChild(opt('열린 저장파일 없음', ''));
      return;
    }
    const list = s.getCharacterList();
    const q = (filter ? filter.value : '').trim().toLowerCase();
    const shown = list.filter((c) => !q || String(c.name || '').toLowerCase().includes(q) || String(c.id || '').toLowerCase().includes(q));
    shown.slice(0, 400).forEach((c) => {
      const isMate = !!(c.isTeammate || c.inParty);
      const label = (c.isPlayer ? '[주인공] ' : '') + (c.name || c.id) + (isMate ? ' · 동료' : '');
      sel.appendChild(opt(label, c.id, String(c.id) === String(state.cid)));
    });
    if (!shown.length) {
      sel.appendChild(opt('검색 결과 없음', ''));
      return;
    }
    if (!shown.some((c) => String(c.id) === String(state.cid))) state.cid = shown[0].id;
    sel.value = String(state.cid);
    if (sel.dataset.bound !== '1') {
      sel.dataset.bound = '1';
      sel.addEventListener('change', () => {
        state.cid = sel.value;
        renderCharacterDetail();
        renderSkillsTalents();
        renderInventory();
      });
    }
    if (filter && filter.dataset.bound !== '1') {
      filter.dataset.bound = '1';
      filter.addEventListener('input', () => {
        renderCharacters();
        renderCharacterDetail();
        renderSkillsTalents();
        renderInventory();
      });
    }
  }

  function renderCharacterDetail() {
    const box = clear($('chara-basic-box'));
    const bar = clear($('stat-group-bar'));
    const grid = clear($('stats-grid'));
    if (!box || !grid) return;
    if (!state.session || state.cid === null || state.cid === '') {
      box.appendChild(el('p', '캐릭터를 선택해 주세요.', 'empty'));
      grid.appendChild(el('p', '캐릭터를 선택해 주세요.', 'empty'));
      return;
    }
    const d = state.session.getCharacterDetail(state.cid);
    if (!d) {
      box.appendChild(el('p', '캐릭터 정보를 읽지 못했습니다.', 'empty'));
      return;
    }

    const row = el('div', null, 'field-row');
    const surnames = textInput(d.surname || '', '성');
    const names = textInput(d.givenName || '', '이름');
    const level = numInput(d.level, 1, d.maxLevel || undefined);
    const exp = numInput(d.exp, 0);
    const tp = numInput(d.talentPoint, 0);
    const nickname = selectInput(normalizeList(Cat.nicknames), d.nicknameId, '없음');
    const allSkills = normalizeList(Cat.skills);
    const neigongSkills = allSkills.filter((x) => !x.category || x.category === '내공');
    const qinggongSkills = allSkills.filter((x) => !x.category || x.category === '경공');
    const nei = selectInput(neigongSkills.length ? neigongSkills : allSkills, d.currentNeiGongId, '없음');
    const qing = selectInput(qinggongSkills.length ? qinggongSkills : allSkills, d.currentQingGongId, '없음');
    const tree = selectInput(allSkills, d.currentSkillTreeId, '없음');

    row.appendChild(field('성', surnames));
    row.appendChild(field('이름', names));
    row.appendChild(field('레벨', level));
    row.appendChild(field('경험치', exp));
    row.appendChild(field('감오 점수', tp));
    row.appendChild(field('칭호', nickname));
    row.appendChild(field('내공', nei));
    row.appendChild(field('경공', qing));
    row.appendChild(field('주력 무공', tree));
    box.appendChild(row);

    const saveBtn = button('기본 정보 저장', () => {
      try {
        state.session.setCharacterBasics(state.cid, {
          surname: surnames.value,
          givenName: names.value,
          level: Number(level.value),
          exp: Number(exp.value),
          talentPoint: Number(tp.value),
          nicknameId: nickname.value,
          currentNeiGongId: nei.value,
          currentQingGongId: qing.value,
          currentSkillTreeId: tree.value
        });
        markDirty(true);
        renderCharacters();
        renderCharacterDetail();
        renderAtlas();
        status('기본 정보를 저장했습니다.');
      } catch (e) {
        status('기본 정보 저장 중 오류가 발생했습니다.', true);
      }
    }, 'primary');
    saveBtn.style.marginTop = '10px';
    box.appendChild(saveBtn);

    const stats = d.stats || [];
    const groups = ['전체'];
    stats.forEach((st) => {
      const g = st.group || '기본';
      if (groups.indexOf(g) < 0) groups.push(g);
    });
    if (groups.indexOf(state.statGroup) < 0) state.statGroup = '전체';
    if (bar) {
      groups.forEach((g) => {
        const gb = button(g, () => {
          state.statGroup = g;
          renderCharacterDetail();
        });
        gb.setAttribute('aria-pressed', state.statGroup === g ? 'true' : 'false');
        bar.appendChild(gb);
      });
    }

    stats.filter((st) => state.statGroup === '전체' || (st.group || '기본') === state.statGroup).forEach((st) => {
      const w = el('div', null, 'stat-item');
      w.appendChild(el('span', st.label || st.key, 'stat-label'));
      const inp = numInput(st.value, st.min, st.max);
      inp.addEventListener('change', () => {
        try {
          let v = Number(inp.value);
          if (st.min !== undefined && v < st.min) v = st.min;
          if (st.max !== undefined && v > st.max) v = st.max;
          const savedVal = state.session.setCharacterStat(state.cid, st.key, v);
          markDirty(true);
          inp.value = String(savedVal);
          status('능력치를 변경했습니다.');
        } catch (e) {
          status('능력치 변경 중 오류가 발생했습니다.', true);
        }
      });
      w.appendChild(inp);
      w.appendChild(el('span', String(st.min) + ' ~ ' + String(st.max), 'muted'));
      grid.appendChild(w);
    });
  }

  function skillLabel(s) {
    const cat = s.category ? '[' + s.category + '] ' : '';
    return cat + (s.name || s.id);
  }

  function renderSkillsTalents() {
    const sk = clear($('skills-box'));
    const ta = clear($('talents-box'));
    if (!sk || !ta) return;
    if (!state.session || !state.cid) {
      sk.appendChild(el('p', '캐릭터를 선택해 주세요.', 'empty'));
      ta.appendChild(el('p', '캐릭터를 선택해 주세요.', 'empty'));
      return;
    }
    const d = state.session.getCharacterDetail(state.cid);
    if (!d) return;

    const addSkillBtn = button('무공 검색 추가', () => {
      const list = normalizeList(Cat.skills).map((x) => ({
        id: x.id,
        name: (x.category ? '[' + x.category + '] ' : '') + (x.name || x.id) + ' (' + x.id + ')'
      }));
      openPicker('무공 추가', list, (picked) => {
        try {
          state.session.setSkillMastery(state.cid, picked.id, { learned: true, isExpert: false, currentExp: 0, maxExp: 2000000 });
          markDirty(true);
          renderSkillsTalents();
          status('무공을 추가했습니다.');
        } catch (e) {
          status('무공 추가 중 오류가 발생했습니다.', true);
        }
      });
    }, 'primary');
    sk.appendChild(addSkillBtn);

    (d.skills || []).forEach((s) => {
      const row = el('div', null, 'skill-row');
      row.appendChild(el('strong', skillLabel(s), 'row-title'));
      row.appendChild(el('span', s.isExpert ? '전문' : '일반', 'chip'));
      const learned = el('input'); learned.type = 'checkbox'; learned.checked = true;
      const expert = el('input'); expert.type = 'checkbox'; expert.checked = !!s.isExpert;
      const cur = numInput(s.currentExp || 0, 0);
      const max = numInput(s.maxExp || 2000000, 0);
      row.appendChild(field('습득', learned));
      row.appendChild(field('전문', expert));
      row.appendChild(field('현재 숙련', cur));
      row.appendChild(field('최대 숙련', max));
      row.appendChild(button('저장', () => {
        try {
          state.session.setSkillMastery(state.cid, s.id, {
            learned: learned.checked,
            isExpert: expert.checked,
            currentExp: Number(cur.value),
            maxExp: Number(max.value)
          });
          markDirty(true);
          renderSkillsTalents();
          status('무공 숙련을 저장했습니다.');
        } catch (e) {
          status('무공 숙련 저장 중 오류가 발생했습니다.', true);
        }
      }));
      sk.appendChild(row);
    });
    if (!(d.skills || []).length) sk.appendChild(el('p', '보유 무공이 없습니다.', 'empty'));

    const talents = normalizeList(Cat.talents);
    const clickedSet = new Set((d.clickedTalents || []).map(String));
    const point = numInput(d.talentPoint, 0);
    ta.appendChild(field('남은 감오 점수', point));
    const tList = el('div', null, 'scroll-box');
    talents.forEach((t) => {
      const id = String(t.id);
      const cb = el('input');
      cb.type = 'checkbox';
      cb.dataset.tid = id;
      cb.checked = clickedSet.has(id);
      const lab = el('label', null, 'talent-item');
      lab.appendChild(cb);
      lab.appendChild(el('span', (t.treeName ? '[' + t.treeName + '] ' : '') + (t.name || id)));
      tList.appendChild(lab);
    });
    ta.appendChild(tList);
    ta.appendChild(button('감오 저장', () => {
      const nodes = [];
      tList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.checked && cb.dataset.tid) nodes.push(cb.dataset.tid);
      });
      try {
        state.session.setTalentNodes(state.cid, nodes, Number(point.value));
        markDirty(true);
        renderSkillsTalents();
        status('감오를 저장했습니다.');
      } catch (e) {
        status('감오 저장 중 오류가 발생했습니다.', true);
      }
    }, 'primary'));
  }

  function itemInfo(itemId) {
    if (Cat.equipment && Cat.equipment[itemId]) return Cat.equipment[itemId];
    if (Cat.normalInventory && Cat.normalInventory[itemId]) return Cat.normalInventory[itemId];
    return null;
  }
  function itemName(it) {
    if (!it) return '없음';
    if (typeof it === 'string' || typeof it === 'number') return String(it);
    if (it.ItemId) {
      const info = itemInfo(it.ItemId);
      return info && info.name ? info.name : String(it.ItemId);
    }
    return it.name || it.label || it.id || '없음';
  }

  function renderInventory() {
    const eq = clear($('equip-box'));
    const tb = clear($('inventory-toolbar'));
    const wr = clear($('inventory-table-wrap'));
    const filterInp = $('inv-filter');
    const catSel = $('inv-category');
    if (!eq || !tb || !wr) return;
    if (!state.session || !state.cid) {
      wr.appendChild(el('p', '캐릭터를 선택해 주세요.', 'empty'));
      return;
    }
    const d = state.session.getCharacterDetail(state.cid);
    if (!d) return;

    const slots = normalizeList(Cat.equipSlots);
    slots.forEach((slot) => {
      const equipped = d.equip ? d.equip[slot.id] : null;
      const row = el('div', null, 'equip-row');
      row.appendChild(el('strong', slot.name || slot.id, 'row-title'));
      row.appendChild(el('span', itemName(equipped), 'row-meta'));
      row.appendChild(button('해제', () => {
        try {
          state.session.setEquipSlot(state.cid, slot.id, null);
          markDirty(true);
          renderInventory();
          status('장비를 해제했습니다.');
        } catch (e) {
          status('장비 해제 중 오류가 발생했습니다.', true);
        }
      }));
      eq.appendChild(row);
    });

    const allCatalogItems = normalizeList(Cat.equipment).concat(normalizeList(Cat.normalInventory));
    const addCount = numInput(1, 1);
    addCount.style.maxWidth = '90px';
    tb.appendChild(field('추가 수량', addCount));
    tb.appendChild(button('아이템 검색 추가', () => {
      const list = allCatalogItems.map((x) => ({
        id: x.id,
        name: (x.subCategoryKo || x.category ? '[' + (x.subCategoryKo || x.category) + '] ' : '') + (x.name || x.id) + ' (' + x.id + ')'
      }));
      openPicker('소지품 추가', list, (picked) => {
        try {
          state.session.addInventoryItem(state.cid, picked.id, Number(addCount.value) || 1);
          markDirty(true);
          renderInventory();
          status('아이템을 추가했습니다.');
        } catch (e) {
          status('아이템 추가 중 오류가 발생했습니다.', true);
        }
      });
    }, 'primary'));

    if (catSel) {
      const prevCat = catSel.value;
      clear(catSel);
      catSel.appendChild(opt('모든 분류', ''));
      const seenCat = new Set();
      allCatalogItems.forEach((x) => {
        const c = x.subCategoryKo || x.category || '';
        if (c && !seenCat.has(c)) {
          seenCat.add(c);
          catSel.appendChild(opt(c, c, c === prevCat));
        }
      });
      if (catSel.dataset.bound !== '1') {
        catSel.dataset.bound = '1';
        catSel.addEventListener('change', renderInventory);
      }
    }
    if (filterInp && filterInp.dataset.bound !== '1') {
      filterInp.dataset.bound = '1';
      filterInp.addEventListener('input', renderInventory);
    }

    const q = (filterInp ? filterInp.value : '').trim().toLowerCase();
    const chosenCat = catSel ? catSel.value : '';

    const table = el('table');
    const thead = el('thead');
    const hr = el('tr');
    ['번호', '이름', '코드', '수량', '내구도', '동작'].forEach((x) => hr.appendChild(el('th', x)));
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = el('tbody');
    (d.inventory || []).forEach((it, idx) => {
      if (!it) return;
      const itemId = it.ItemId || '';
      const info = itemInfo(itemId);
      const name = itemName(it);
      const catLabel = info ? (info.subCategoryKo || info.category || '') : '';
      if (q && name.toLowerCase().indexOf(q) === -1 && itemId.toLowerCase().indexOf(q) === -1) return;
      if (chosenCat && catLabel !== chosenCat) return;

      const tr = el('tr');
      tr.appendChild(el('td', idx));
      tr.appendChild(el('td', name));
      tr.appendChild(el('td', itemId));
      const cnt = numInput(it.Count !== undefined ? it.Count : 1, 1);
      cnt.style.maxWidth = '84px';
      const cntTd = el('td');
      cntTd.appendChild(cnt);
      tr.appendChild(cntTd);
      tr.appendChild(el('td', String(it.Durability || 0) + ' / ' + String(it.MaxDurability || 0)));

      const ops = el('td');
      const opWrap = el('div', null, 'toolbar-group');
      opWrap.appendChild(button('저장', () => {
        try {
          state.session.setInventoryCount(state.cid, idx, Number(cnt.value));
          markDirty(true);
          renderInventory();
          status('수량을 저장했습니다.');
        } catch (e) {
          status('수량 저장 중 오류가 발생했습니다.', true);
        }
      }));
      opWrap.appendChild(button('삭제', () => {
        try {
          state.session.removeInventoryItem(state.cid, idx);
          markDirty(true);
          renderInventory();
          status('아이템을 삭제했습니다.');
        } catch (e) {
          status('아이템 삭제 중 오류가 발생했습니다.', true);
        }
      }));
      const eqSel = selectInput(slots, '', '슬롯 선택');
      eqSel.style.width = 'auto';
      opWrap.appendChild(eqSel);
      opWrap.appendChild(button('장착', () => {
        if (!eqSel.value) return;
        try {
          state.session.setEquipSlot(state.cid, eqSel.value, idx);
          markDirty(true);
          renderInventory();
          status('장비를 장착했습니다.');
        } catch (e) {
          status('장비 장착 중 오류가 발생했습니다.', true);
        }
      }));
      ops.appendChild(opWrap);
      tr.appendChild(ops);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wr.appendChild(table);
  }

  function renderParty() {
    const pb = clear($('party-box'));
    const tj = clear($('tujian-box'));
    const tb = clear($('teleporters-box'));
    const nb = clear($('nicknames-box'));
    if (!pb || !tb || !nb) return;
    if (!state.session) {
      pb.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      if (tj) tj.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      tb.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      nb.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      return;
    }

    const allChars = state.session.getCharacterList();
    const partyChars = allChars.filter((c) => c.isPlayer || c.isTeammate);
    const reserveChars = allChars.filter((c) => !c.isPlayer && !c.isTeammate).slice(0, 120);
    partyChars.concat(reserveChars).forEach((c) => {
      const row = el('div', null, 'party-row');
      row.appendChild(el('span', c.name || c.id, 'row-title'));
      row.appendChild(el('span', c.isTeammate ? '동료' : '대기', 'chip'));
      if (c.isPlayer) {
        row.appendChild(el('span', '주인공', 'chip'));
      } else {
        row.appendChild(button(c.isTeammate ? '해제' : '추가', () => {
          try {
            if (c.isTeammate) state.session.removeTeammate(c.id);
            else state.session.addTeammate(c.id);
            markDirty(true);
            renderParty();
            renderCharacters();
            status('동료 편성을 변경했습니다.');
          } catch (e) {
            status('동료 편성 변경 중 오류가 발생했습니다.', true);
          }
        }));
      }
      pb.appendChild(row);
    });

    if (tj && state.session.getWulinTujianStates) {
      const search = textInput('', '무림도감 인물·천서 검색');
      const rows = el('div');
      const drawTujian = () => {
        clear(rows);
        const q = search.value.trim().toLowerCase();
        state.session.getWulinTujianStates()
          .filter((e) => !q || (e.book + ' ' + e.name + ' ' + e.id).toLowerCase().indexOf(q) >= 0)
          .slice(0, 80)
          .forEach((entry) => {
            const row = el('div', null, 'tujian-row');
            row.appendChild(el('span', '[' + (entry.book || '도감') + '] ' + entry.name + (entry.attrBonus ? ' · ' + entry.attrBonus : ''), 'row-title'));
            const met = el('input'); met.type = 'checkbox'; met.checked = !!entry.met;
            const unlocked = el('input'); unlocked.type = 'checkbox'; unlocked.checked = !!entry.unlocked;
            met.addEventListener('change', () => {
              state.session.setWulinTujianState(entry.id, { met: met.checked });
              markDirty(true);
              status('무림도감 조우 상태를 변경했습니다.');
            });
            unlocked.addEventListener('change', () => {
              state.session.setWulinTujianState(entry.id, { unlocked: unlocked.checked });
              markDirty(true);
              status('무림도감 해금 상태를 변경했습니다.');
            });
            row.appendChild(field('조우', met));
            row.appendChild(field('해금', unlocked));
            rows.appendChild(row);
          });
      };
      search.addEventListener('input', drawTujian);
      tj.appendChild(search);
      tj.appendChild(rows);
      drawTujian();
    }

    const gf = (state.session._gameFields ? state.session._gameFields() : {}) || {};
    const tel = Array.isArray(gf.AvailableTeleporters) ? gf.AvailableTeleporters.map(String) : [];
    const tpItems = normalizeList(Cat.teleporters);
    tpItems.forEach((t) => {
      const id = String(t.id);
      const row = el('label', null, 'check-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.dataset.tpid = id; cb.checked = tel.indexOf(id) >= 0;
      row.appendChild(cb);
      row.appendChild(el('span', t.name || id));
      tb.appendChild(row);
    });
    tb.appendChild(button('거점 해금 저장', () => {
      const values = [];
      tb.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.checked && cb.dataset.tpid) values.push(cb.dataset.tpid);
      });
      try {
        state.session.setWorldSettings({ teleporters: values });
        markDirty(true);
        renderSummary();
        status('전송 거점을 저장했습니다.');
      } catch (e) {
        status('전송 거점 저장 중 오류가 발생했습니다.', true);
      }
    }, 'primary'));

    const nicks = Array.isArray(gf.AvailableNicknames) ? gf.AvailableNicknames.map(String) : [];
    const nickItems = normalizeList(Cat.nicknames);
    nickItems.slice(0, 120).forEach((n) => {
      const id = String(n.id);
      const row = el('label', null, 'check-row');
      const cb = el('input'); cb.type = 'checkbox'; cb.dataset.nnid = id; cb.checked = nicks.indexOf(id) >= 0;
      row.appendChild(cb);
      row.appendChild(el('span', n.name || id));
      nb.appendChild(row);
    });
    nb.appendChild(button('칭호 해금 저장', () => {
      const selectedShown = new Set();
      const shownIds = new Set();
      nb.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        if (cb.dataset.nnid) {
          shownIds.add(cb.dataset.nnid);
          if (cb.checked) selectedShown.add(cb.dataset.nnid);
        }
      });
      const merged = nicks.filter((x) => !shownIds.has(x));
      selectedShown.forEach((x) => merged.push(x));
      try {
        state.session.setWorldSettings({ nicknames: merged });
        markDirty(true);
        renderSummary();
        status('칭호 해금을 저장했습니다.');
      } catch (e) {
        status('칭호 해금 저장 중 오류가 발생했습니다.', true);
      }
    }, 'primary'));
  }

  function renderAtlas() {
    const vb = clear($('validation-box'));
    const db = clear($('diff-box'));
    const ab = clear($('atlas-box'));
    if (!vb || !db || !ab) return;
    if (!state.session) {
      vb.appendChild(el('p', '열린 저장파일이 없습니다.', 'empty'));
      return;
    }
    try {
      const v = state.session.validate();
      vb.appendChild(el('strong', v.ok ? '검증 통과' : '검증 오류', v.ok ? 'ok' : 'bad'));
      (v.errors || []).forEach((x) => vb.appendChild(el('p', x, 'bad')));
    } catch (e) {
      vb.appendChild(el('p', '검증 중 오류가 발생했습니다.', 'bad'));
    }
    try {
      const diff = state.session.computeDiff();
      db.appendChild(el('pre', JSON.stringify(diff, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)));
    } catch (e) {
      db.appendChild(el('p', '변경 내역 계산 중 오류가 발생했습니다.', 'bad'));
    }
    const atlas = Cat.codeAtlas;
    if (atlas) {
      Object.keys(atlas).forEach((k) => {
        ab.appendChild(el('div', k + ' : ' + atlas[k], 'equip-row'));
      });
    }
    if (Array.isArray(Cat.qzzlPasses) && Cat.qzzlPasses.length) {
      ab.appendChild(el('p', '강자의 길 도전 과제 ' + Cat.qzzlPasses.length + '종 · 업적 ' + Object.keys(Cat.achievements || {}).length + '종 수록', 'muted'));
    }
  }

  function openPicker(title, list, onPick) {
    const dlg = $('picker-dialog');
    if (!dlg || !dlg.showModal) return;
    state.picker = { list: list || [], onPick };
    $('picker-title').textContent = title || '항목 선택';
    $('picker-search').value = '';
    renderPicker();
    dlg.showModal();
    setTimeout(() => $('picker-search').focus(), 0);
  }
  function renderPicker() {
    const box = clear($('picker-list'));
    const q = ($('picker-search').value || '').trim().toLowerCase();
    (state.picker ? state.picker.list : []).filter((x) => {
      const name = String(x.name || x.label || x.id || '');
      return !q || name.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 120).forEach((x) => {
      box.appendChild(button(x.name || x.label || x.id, () => {
        const fn = state.picker && state.picker.onPick;
        const dlg = $('picker-dialog');
        if (dlg && dlg.open) dlg.close();
        if (fn) fn(x);
      }, 'picker-item'));
    });
  }
  function setupPicker() {
    const dlg = $('picker-dialog');
    if (!dlg) return;
    $('picker-close').addEventListener('click', () => dlg.close());
    const cancelBtn = $('picker-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => dlg.close());
    $('picker-search').addEventListener('input', renderPicker);
    dlg.addEventListener('cancel', () => { state.picker = null; });
  }

  function setupTheme() {
    const btn = $('btn-theme');
    function set(theme) {
      D.documentElement.dataset.theme = theme;
      D.body.dataset.theme = theme;
      if (btn) btn.textContent = theme === 'dark' ? '밝게' : '어둡게';
      try { localStorage.setItem('ssts-theme', theme); } catch (e) {}
    }
    let saved = 'light';
    try { saved = localStorage.getItem('ssts-theme') || 'light'; } catch (e) {}
    set(saved);
    if (btn) btn.addEventListener('click', () => set(D.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  }

  function setupBrowser() {
    const input = $('file-input');
    const open = $('btn-file-open');
    const save = $('btn-download-save');
    const demo = $('btn-load-demo');
    if (open && input) open.addEventListener('click', () => input.click());
    if (input) input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      f.arrayBuffer().then((buf) => openBytes(new Uint8Array(buf), f.name)).catch(() => status('파일 읽기 오류', true));
      input.value = '';
    });
    if (save) save.addEventListener('click', () => {
      const u8 = saveBytes();
      if (u8) { downloadU8(u8, state.fileName); status('저장파일을 내려받았습니다.'); }
    });
    if (demo) demo.addEventListener('click', () => {
      try {
        if (!Core || !Core.createDemoSave) throw 0;
        openBytes(Core.createDemoSave(), '예제.save');
        status('예제 저장파일을 열었습니다.');
      } catch (e) {
        status('예제 저장파일을 만들지 못했습니다.', true);
      }
    });
  }

  function setupNative() {
    const wv = window.chrome && window.chrome.webview;
    if (!wv) return;
    const bar = $('native-bar');
    if (bar) bar.hidden = false;
    window.__sstsBridgeReady = true;
    window.__htlsBridgeReady = true;
    $('btn-native-open').addEventListener('click', () => wv.postMessage(JSON.stringify({ cmd: 'open' })));
    $('btn-native-save').addEventListener('click', () => {
      const u8 = saveBytes();
      if (u8) wv.postMessage(JSON.stringify({ cmd: 'save', path: state.nativePath || '', expectedHash: state.nativeSha256 || '', dataB64: u8ToB64(u8), fileName: state.fileName }));
    });
    $('btn-native-save-copy').addEventListener('click', () => {
      const u8 = saveBytes();
      if (u8) wv.postMessage(JSON.stringify({ cmd: 'saveAs', path: state.nativePath || '', dataB64: u8ToB64(u8), fileName: state.fileName }));
    });
    wv.addEventListener('message', (ev) => {
      let m = ev.data;
      if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { m = {}; } }
      m = m || {};
      try {
        if (m.canceled) return;
        if (m.error) { status('네이티브 오류: ' + m.error, true); return; }
        const b64 = m.dataB64 || m.data || m.base64 || m.content;
        if (b64) {
          state.nativePath = m.path || state.nativePath;
          state.nativeSha256 = m.sha256 || state.nativeSha256;
          openBytes(b64ToU8(b64), m.fileName || m.name || state.fileName);
        } else if (m.backupPath || m.saved || m.type === 'saved') {
          if (m.path) state.nativePath = m.path;
          if (m.sha256) state.nativeSha256 = m.sha256;
          markDirty(false);
          status('네이티브 저장 및 백업 완료');
        } else if (m.paths || m.type === 'discover' || m.type === 'ready') {
          status('네이티브 연결 준비됨');
        }
      } catch (e) {
        status('네이티브 메시지 처리 오류', true);
      }
    });
  }

  function setupServer() {
    fetch('/api/info').then((r) => r.ok ? r.json() : null).then((info) => {
      if (!info || !info.token) return;
      state.serverToken = info.token;
      const bar = $('server-bar');
      if (bar) bar.hidden = false;
      const sel = $('server-save-select');
      clear(sel);
      (info.files || info.saves || []).forEach((f) => sel.appendChild(opt(typeof f === 'string' ? f : (f.name || f.file), typeof f === 'string' ? f : (f.name || f.file))));
      $('btn-server-load').addEventListener('click', () => {
        const name = sel.value;
        if (!name) { status('불러올 저장파일을 선택해 주세요.', true); return; }
        fetch('/api/load?name=' + encodeURIComponent(name), { headers: { 'X-SSTS-Token': state.serverToken } })
          .then((r) => { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then((b) => { if (openBytes(new Uint8Array(b), name)) status('서버 저장파일을 열었습니다.'); })
          .catch(() => status('서버 불러오기 오류', true));
      });
      $('btn-server-save').addEventListener('click', () => {
        const u8 = saveBytes();
        if (!u8) return;
        fetch('/api/save', {
          method: 'POST',
          headers: { 'X-SSTS-Token': state.serverToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: state.fileName, data: u8ToB64(u8) })
        }).then((r) => {
          if (!r.ok) throw 0;
          status('서버에 저장했습니다.');
        }).catch(() => status('서버 저장 오류', true));
      });
    }).catch(() => {});
  }

  D.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupTheme();
    setupBrowser();
    setupNative();
    setupServer();
    setupPicker();
    refreshAll();
    status('준비됨');
  });
})();
