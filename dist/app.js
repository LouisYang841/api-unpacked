const $ = (id) => document.getElementById(id);
const completed = new Set();
const completedTasks = new Set();
const taskIds = [
  'api-basics',
  'key-management',
  'app-connection',
  'request-structure',
  'request-cards',
  'request-json',
  'troubleshooting',
];
const requirementTaskMap = {
  'concept-api': 'api-basics',
  'key-created': 'key-management',
  'exercise-ui': 'app-connection',
  'concept-request': 'request-structure',
  'exercise-drag': 'request-cards',
  'exercise-write': 'request-json',
  'concept-errors': 'troubleshooting',
};
const learningStorageKey = 'api-unpacked-learning-v1';
const answeredQuestions = new Set();
const rewardedQuestions = new Set();
let activeKey = null;
let revealedKey = null;
let practiceKeysReady = false;
const validKeys = new Set();
const keyRecords = [];
const completedKeys = new Map();
const scenarioStates = new Map();
let fetchedConnection = null,
  savedConnection = null,
  connectionTested = false,
  pendingRevocation = null;
function feedback(id, errors, success) {
  const box = $('feedback-' + id);
  box.replaceChildren();
  box.className = 'feedback ' + (errors.length ? 'bad' : 'good');
  if (errors.length) {
    const title = document.createElement('strong');
    title.textContent = '请检查以下项目：';
    box.append(title);
    const list = document.createElement('ul');
    errors.forEach((e) => {
      const li = document.createElement('li');
      li.textContent = e;
      list.append(li);
    });
    box.append(list);
  } else {
    box.textContent = success;
    completed.add(id);
    completedKeys.set(id, requestKeyFor(id));
    rewardCorrectAnswer('exercise-' + id, box);
    updateProgress();
  }
}
function updateProgress() {
  $('progressText').textContent = completed.size + ' / 3';
  $('progressBar').style.width = (completed.size / 3) * 100 + '%';
  $('completion').hidden = completed.size !== 3;
  updateChapterMarks();
  refreshLessonGates();
}
function uiBody() {
  if ($('useResponses').checked)
    return {
      model: $('connectionModel').value || '__选择模型__',
      instructions: '你是一位耐心的老师。',
      input: Lesson.prompts.ui,
    };
  return {
    model: $('connectionModel').value || '__选择模型__',
    messages: [
      { role: 'system', content: '你是一位耐心的老师。' },
      { role: 'user', content: Lesson.prompts.ui },
    ],
  };
}
function updatePreview(reset = true) {
  if (reset) {
    stopScenario('ui');
    invalidateConnection();
    $('feedback-ui').replaceChildren();
    $('uiResponse').hidden = false;
  }
  const endpoint = Lesson.composeEndpoint(
    $('baseUrl').value,
    $('useResponses').checked,
  );
  const key = $('apiKey').value.trim();
  // Never echo arbitrary entered credentials into the page or logs.
  $('livePreview').textContent =
    'POST ' +
    (endpoint || '__等待填写地址__') +
    '\nAuthorization: Bearer ' +
    (validKeys.has(key) ? key : key ? '••••••••' : '__等待填写密钥__') +
    '\nContent-Type: application/json\n\n' +
    JSON.stringify(uiBody(), null, 2);
  if ($('protocolType').value !== 'openai') {
    $('livePreview').textContent =
      '接口类型不匹配。此服务使用 OpenAI 兼容格式。';
  }
  syncPracticeKey();
  if (reset)
    $('uiResponse').textContent =
      '配置更新了。点击检测连接，观察地址、密钥与模型是否匹配。';
}
[
  'baseUrl',
  'apiKey',
  'connectionModel',
  'protocolType',
  'useResponses',
].forEach((id) => $(id).addEventListener('input', updatePreview));
updatePreview();
$('protocolType').addEventListener('change', () => {
  const openai = $('protocolType').value === 'openai';
  $('useResponses').disabled = !openai;
  if (!openai) $('useResponses').checked = false;
  $('protocolHelp').textContent = openai
    ? '可用接口：Chat Completions、Responses。'
    : '此服务使用 OpenAI 兼容格式。';
  updatePreview();
});
$('useResponses').addEventListener('change', () => updatePreview());
$('toggleKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('toggleKey').setAttribute('aria-pressed', String(show));
  $('toggleKey').textContent = show ? '隐藏密钥' : '显示密钥';
});
function openConsoleDialog(id) {
  const dialog = $(id);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else {
    dialog.setAttribute('open', '');
    dialog.classList.add('dialog-fallback');
  }
  dialog.querySelector('input,button')?.focus();
}
function closeConsoleDialog(id) {
  const dialog = $(id);
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
  dialog.classList.remove('dialog-fallback');
  if (id === 'keyRevealDialog') eraseKeyReveal();
}
$('createKey').addEventListener('click', () => {
  $('keyName').value = '';
  $('keyName').removeAttribute('aria-invalid');
  $('keyNameError').textContent = '';
  openConsoleDialog('keyNameDialog');
  $('keyName').focus();
});
['cancelKeyName', 'closeKeyName'].forEach((id) =>
  $(id).addEventListener('click', () => {
    closeConsoleDialog('keyNameDialog');
    $('createKey').focus();
  }),
);
['cancelRevoke', 'closeRevoke'].forEach((id) =>
  $(id).addEventListener('click', () => {
    pendingRevocation = null;
    closeConsoleDialog('revokeDialog');
    $('createKey').focus();
  }),
);
['keyNameDialog', 'keyRevealDialog', 'revokeDialog'].forEach((id) => {
  $(id).addEventListener('cancel', (e) => {
    e.preventDefault();
    closeConsoleDialog(id);
    pendingRevocation = null;
    $('createKey').focus();
  });
  $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeConsoleDialog(id);
      pendingRevocation = null;
      $('createKey').focus();
    }
    if (e.key === 'Tab' && $(id).classList.contains('dialog-fallback')) {
      const nodes = [...$(id).querySelectorAll('input,button')].filter(
        (n) => !n.disabled,
      );
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
});
function requestRevocation(key) {
  if (!validKeys.has(key)) return;
  pendingRevocation = key;
  const record = keyRecords.find((r) => r.key === key);
  $('revokeDescription').textContent =
    '即将撤销“' + record.label + '”（末尾 ' + key.slice(-4) + '）。';
  openConsoleDialog('revokeDialog');
}
$('confirmRevoke').addEventListener('click', () => {
  const key = pendingRevocation;
  pendingRevocation = null;
  closeConsoleDialog('revokeDialog');
  revokeTeachingKey(key);
  $('createKey').focus();
});
$('keyNameForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const label = $('keyName').value.trim();
  if (!label || label.length > 40) {
    $('keyNameError').textContent = '请输入 1—40 个字符的密钥名称。';
    $('keyName').setAttribute('aria-invalid', 'true');
    $('keyName').focus();
    return;
  }
  $('keyNameError').textContent = '';
  try {
    do {
      activeKey = Lesson.generateTeachingKey();
    } while (keyRecords.some((record) => record.key === activeKey));
    validKeys.add(activeKey);
    keyRecords.push({
      key: activeKey,
      label,
      createdAt: new Date().toISOString(),
      revoked: false,
    });
  } catch {
    $('keyIssueStatus').textContent = '密钥创建失败，请更新浏览器后重试。';
    $('keyNameError').textContent = $('keyIssueStatus').textContent;
    return;
  }
  closeConsoleDialog('keyNameDialog');
  revealedKey = activeKey;
  $('issuedKey').value = revealedKey;
  $('issuedKeyLabel').textContent = label;
  $('keyCopyStatus').textContent = '';
  syncTeachingKey();
  $('keyReceipt').hidden = false;
  openConsoleDialog('keyRevealDialog');
  $('createKey').disabled = false;
  $('createKey').textContent = '＋ 创建 API 密钥';
  $('keyIssueStatus').textContent =
    '密钥已创建。请复制密钥值，然后配置应用连接。';
  $('keyReceipt').classList.remove('key-arrival');
  void $('keyReceipt').offsetWidth;
  $('keyReceipt').classList.add('key-arrival');
  rewardCorrectAnswer('key-created', $('keyReceipt'));
  refreshLessonGates();
  $('issuedKey').focus();
});
$('copyKey').addEventListener('click', async () => {
  if (!revealedKey || !$('keyRevealDialog').hasAttribute('open')) return;
  try {
    if (!window.navigator.clipboard?.writeText) throw new Error('unavailable');
    await window.navigator.clipboard.writeText(revealedKey);
    $('keyCopyStatus').textContent = '密钥已复制。';
  } catch {
    $('issuedKey').focus();
    $('issuedKey').select?.();
    $('keyCopyStatus').textContent = '请选中上方密钥值并复制。';
  }
});
function eraseKeyReveal() {
  revealedKey = null;
  $('issuedKey').value = '';
  $('issuedKey').setAttribute('value', '');
  $('issuedKeyLabel').textContent = '';
  $('keyCopyStatus').textContent = '';
  $('keyReceipt').hidden = true;
}
['closeKeyReveal', 'finishKeyReveal'].forEach((id) =>
  $(id).addEventListener('click', () => {
    closeConsoleDialog('keyRevealDialog');
    $('createKey').focus();
  }),
);
$('keyRevealDialog').addEventListener('close', eraseKeyReveal);
function requestKeyFor(id) {
  return id === 'ui'
    ? $('apiKey').value.trim()
    : id === 'write'
      ? $('writeKey').value.trim()
      : cards.find((c) => c.id === slots.auth)?.text || '';
}
function renderKeyList() {
  const list = $('keyList');
  list.replaceChildren();
  keyRecords.forEach((record) => {
    const li = document.createElement('li');
    li.dataset.keyId = 'key-' + (keyRecords.indexOf(record) + 1);
    li.className = 'key-record' + (record.revoked ? ' revoked' : '');
    const title = document.createElement('strong');
    title.textContent =
      record.label + (record.revoked ? ' · 已撤销' : ' · 有效');
    const code = document.createElement('code');
    code.textContent =
      record.key.slice(0, 9) + '••••••••' + record.key.slice(-4);
    const created = document.createElement('time');
    created.dateTime = record.createdAt;
    created.textContent =
      '创建于 ' +
      new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false });
    li.append(title, code, created);
    if (!record.revoked) {
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'text-button';
      revoke.textContent = '撤销这一把';
      revoke.addEventListener('click', () => requestRevocation(record.key));
      li.append(revoke);
    }
    list.append(li);
  });
  $('keyCount').textContent =
    validKeys.size + ' 把有效 / 共创建 ' + keyRecords.length + ' 把';
}
function revokeTeachingKey(key) {
  if (!validKeys.has(key)) return;
  validKeys.delete(key);
  keyRecords.find((r) => r.key === key).revoked = true;
  if (activeKey === key) activeKey = [...validKeys].at(-1) || null;
  ['ui', 'drag', 'write'].forEach((id) => {
    if (completedKeys.get(id) === key || scenarioStates.get(id)?.key === key) {
      completedKeys.delete(id);
      stopScenario(id, '本次请求使用的密钥已撤销，请换一把有效密钥。');
      $('feedback-' + id).replaceChildren();
      $(id + 'Response').hidden = true;
    }
  });
  syncTeachingKey();
  if (savedConnection?.key === key) {
    connectionTested = false;
    setConnectionNotice('已保存配置的密钥被撤销，请更换密钥并重新保存。', true);
  }
  updateProgress();
  $('keyIssueStatus').textContent = '密钥已撤销。';
}
const answers = {
  rainbow: '彩虹是阳光进入水滴后发生折射、反射和色散，分出不同颜色而形成的。',
  eclipse: '月食是地球运行到太阳与月球之间，使月球进入地球影子而变暗的现象。',
};
function showResponse(id, answer) {
  const scenarioId = id.replace('Response', '');
  runScenario(
    scenarioId,
    scenarioId === 'write' ? Lesson.prompts.write : Lesson.prompts.ui,
    answer,
  );
  const el = $(id);
  el.hidden = false;
  el.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = '200 OK';

  const raw = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '查看响应 JSON';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(
    id === 'uiResponse' && $('useResponses').checked
      ? {
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: answer }],
            },
          ],
        }
      : { choices: [{ message: { role: 'assistant', content: answer } }] },
    null,
    2,
  );
  const note = document.createElement('span');
  note.textContent =
    id === 'uiResponse' && $('useResponses').checked
      ? '这条回复的文字位于 output[0].content[0].text。'
      : '回答在 choices[0].message.content 中。';
  raw.append(summary, pre, note);
  el.append(title, raw);
}
function makeOption(label, value) {
  const node = document.createElement('option');
  node.textContent = label;
  node.value = value;
  return node;
}
function connectionValues() {
  return {
    baseUrl: $('baseUrl').value.trim(),
    key: $('apiKey').value.trim(),
    model: $('connectionModel').value,
    protocol: $('protocolType').value,
    useResponses: Boolean($('useResponses').checked),
  };
}
function sameConnection(a, b) {
  return (
    a &&
    b &&
    a.baseUrl === b.baseUrl &&
    a.key === b.key &&
    a.model === b.model &&
    a.protocol === b.protocol &&
    a.useResponses === b.useResponses
  );
}
function setConnectionNotice(message, bad = false) {
  $('connectionStatus').textContent = message;
  $('connectionStatus').classList.toggle('status-error', bad);
}
function invalidateConnection() {
  connectionTested = false;
  $('testConnection').disabled = true;
  const values = connectionValues();
  if (
    fetchedConnection &&
    (values.baseUrl !== fetchedConnection.baseUrl ||
      values.key !== fetchedConnection.key ||
      values.protocol !== fetchedConnection.protocol ||
      values.useResponses !== fetchedConnection.useResponses)
  ) {
    fetchedConnection = null;
    $('connectionModel').replaceChildren(makeOption('请先获取模型列表', ''));
    $('connectionModel').disabled = true;
    $('modelStatus').textContent = '连接地址或密钥已变更，请重新获取模型列表。';
  }
  setConnectionNotice(
    savedConnection
      ? '配置已修改，请重新保存并检测连接。'
      : '请先填写地址与密钥，再获取模型列表。',
  );
}
$('fetchModels').addEventListener('click', () => {
  const values = connectionValues(),
    errors = Lesson.validateConnection(
      { ...values, model: 'demo-small' },
      validKeys,
    );
  if (errors.length) {
    $('modelStatus').textContent = errors[0];
    setConnectionNotice('未能获取模型，请检查地址与密钥。', true);
    return;
  }
  fetchedConnection = { ...values };
  $('connectionModel').replaceChildren(
    makeOption('请选择模型', ''),
    makeOption('demo-small', 'demo-small'),
  );
  $('connectionModel').disabled = false;
  $('modelStatus').textContent = '已获取 1 个模型，请选择 demo-small。';
  setConnectionNotice('模型列表已更新。选择模型后，点击“保存配置”。');
});
$('requestForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const values = connectionValues(),
    errors = Lesson.validateConnection(values, validKeys);
  if (!fetchedConnection)
    errors.push('请先点击“获取模型列表”，再选择服务商提供的模型。');
  if (errors.length) {
    setConnectionNotice(errors.join(' '), true);
    scenarioError('ui', errors);
    return;
  }
  savedConnection = { ...values };
  connectionTested = false;
  $('testConnection').disabled = false;
  setConnectionNotice('配置已保存。请检测连接。');
});
$('providerEnabled').addEventListener('change', () => {
  connectionTested = false;
  $('testConnection').disabled = !savedConnection;
  stopScenario('ui');
  setConnectionNotice(
    $('providerEnabled').checked
      ? '服务商已启用，请检测连接。'
      : '服务商已停用，启用后才能检测或发送消息。',
  );
});
$('testConnection').addEventListener('click', () => {
  const errors = savedConnection
    ? Lesson.validateConnection(savedConnection, validKeys)
    : ['请先保存配置。'];
  if (!sameConnection(savedConnection, connectionValues()))
    errors.push('配置已变更，请重新保存。');
  if (!$('providerEnabled').checked) errors.push('请先启用此服务商。');
  if (errors.length) {
    connectionTested = false;
    setConnectionNotice(errors.join(' '), true);
    scenarioError('ui', errors);
    return;
  }
  connectionTested = true;
  feedback('ui', [], '连接成功，配置练习已完成。');
  setConnectionNotice('连接成功。现在可以发送消息。');
  $('scenario-status-ui').textContent =
    '服务商已连接 · demo-small 已选中 · 等待发送消息';
  celebrate($('connectionStatus'));
});
$('chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const errors = Lesson.validateConnection(connectionValues(), validKeys);
  if (!$('providerEnabled').checked)
    errors.unshift('服务商已停用，请先启用服务。');
  if (errors.length) {
    scenarioError('ui', errors);
    return;
  }
  showResponse('uiResponse', answers.rainbow);
});
['drag', 'write'].forEach((id) =>
  $('scenarioForm-' + id).addEventListener('submit', (event) => {
    event.preventDefault();
    $(id === 'drag' ? 'checkDrag' : 'checkWrite').click();
  }),
);
const cards = [
  { id: 'assistant', text: '"assistant"' },
  { id: 'content', text: '"用一句话解释彩虹。"' },
  { id: 'messages', text: '"messages"' },
  { id: 'auth', text: '先在连接设置中填写密钥' },
  { id: 'model', text: '"model"' },
];
let slots = { key: null, auth: null, content: null },
  selected = null;
function syncPracticeKey() {
  if (!practiceKeysReady) return;
  const entered = $('apiKey').value.trim(),
    key = validKeys.has(entered) ? entered : null;
  const card = cards.find((c) => c.id === 'auth');
  if (slots.auth && validKeys.has(card.text)) return;
  if (!validKeys.has(card.text)) slots.auth = null;
  const next = key || '先在连接设置中填写密钥';
  if (card.text !== next) {
    card.text = next;
    renderCards();
  }
}
function syncTeachingKey() {
  renderKeyList();
  syncPracticeKey();
  updatePreview(false);
}
const slotNames = { auth: '① 密钥', key: '② 字段名', content: '③ 提问内容' };
const dragAnnouncement = document.createElement('p');
dragAnnouncement.className = 'drag-help';
dragAnnouncement.setAttribute('role', 'status');
$('cardBank').after(dragAnnouncement);
function renderCards() {
  stopScenario('drag');
  const bank = $('cardBank');
  bank.replaceChildren();
  cards
    .filter((c) => !Object.values(slots).includes(c.id))
    .forEach((c) => {
      const b = document.createElement('button');
      b.className = 'card' + (selected === c.id ? ' selected' : '');
      b.textContent = c.text;
      b.disabled = c.id === 'auth' && !validKeys.has(c.text);
      b.draggable = !b.disabled;
      b.dataset.card = c.id;
      b.setAttribute('aria-pressed', String(selected === c.id));
      b.addEventListener('click', () => {
        selected = selected === c.id ? null : c.id;
        dragAnnouncement.textContent = selected
          ? '已选中 ' + c.text + '，请点击要放入的空位。'
          : '已取消选择。';
        renderCards();
        if (selected)
          document.querySelector('[data-card="' + selected + '"]').focus();
      });
      b.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      bank.append(b);
    });
  document.querySelectorAll('[data-slot]').forEach((b) => {
    const c = cards.find((x) => x.id === slots[b.dataset.slot]);
    b.textContent = c ? c.text : slotNames[b.dataset.slot];
    const expected = { auth: 'auth', key: 'model', content: 'content' };
    b.classList.toggle(
      'filled',
      !!c &&
        slots[b.dataset.slot] === expected[b.dataset.slot] &&
        (b.dataset.slot !== 'auth' || validKeys.has(c.text)),
    );
    b.setAttribute(
      'aria-label',
      slotNames[b.dataset.slot] +
        (c ? '，已放入 ' + c.text + '，点击可取回' : '，点击放入已选卡片'),
    );
  });
  $('dragResponse').hidden = true;
}
function place(slot, card) {
  if (!cards.some((c) => c.id === card)) return;
  Object.keys(slots).forEach((k) => {
    if (slots[k] === card) slots[k] = null;
  });
  slots[slot] = card;
  selected = null;
  dragAnnouncement.textContent = '已放入 ' + slotNames[slot] + '。';
  renderCards();
}
document.querySelectorAll('[data-slot]').forEach((b) => {
  b.addEventListener('click', () => {
    const slot = b.dataset.slot;
    if (selected) {
      place(slot, selected);
    } else if (slots[slot]) {
      const old = slots[slot];
      slots[slot] = null;
      selected = old;
      dragAnnouncement.textContent = '已取回卡片，可以重新放置。';
      renderCards();
    } else {
      dragAnnouncement.textContent = '请先选择一张卡片，再点击这里。';
    }
  });
  b.addEventListener('dragover', (e) => {
    e.preventDefault();
    b.classList.add('over');
  });
  b.addEventListener('dragleave', () => b.classList.remove('over'));
  b.addEventListener('drop', (e) => {
    e.preventDefault();
    b.classList.remove('over');
    place(b.dataset.slot, e.dataTransfer.getData('text/plain'));
  });
});
renderCards();
$('checkDrag').addEventListener('click', () => {
  const errors = Lesson.validateKey(
    slots.auth === 'auth' ? cards.find((c) => c.id === 'auth').text : '',
    validKeys,
  );
  if (slots.key !== 'model')
    errors.push('正文空位②后面是 demo-small，所以字段名应为 "model"。');
  if (slots.content !== 'content')
    errors.push('正文空位③应放入具体提问“用一句话解释彩虹。”。');
  feedback(
    'drag',
    errors,
    '拼对了！密钥位于 Authorization 请求头；模型和提问位于 JSON 正文。两部分一起构成应用发送的请求。',
  );
  if (!errors.length) showResponse('dragResponse', answers.rainbow);
  else {
    $('dragResponse').hidden = true;
    scenarioError('drag', errors);
  }
});
const skeleton = JSON.stringify(
  {
    model: '__填写__',
    messages: [
      { role: 'system', content: '你是一位耐心的老师。' },
      { role: 'user', content: '__填写__' },
    ],
  },
  null,
  2,
);
$('jsonEditor').value = skeleton;
$('jsonEditor').addEventListener('input', () => {
  stopScenario('write');
  $('writeResponse').hidden = true;
});
$('formatJson').addEventListener('click', () => {
  try {
    $('jsonEditor').value = JSON.stringify(
      JSON.parse($('jsonEditor').value),
      null,
      2,
    );
    const el = $('feedback-write');
    el.className = 'feedback hint';
    el.textContent = '格式已整理。点击“检查并发送”查看结果。';
  } catch (e) {
    feedback(
      'write',
      ['暂时无法整理：JSON 存在语法错误。先检查双引号、逗号和括号。'],
      '',
    );
  }
});
$('checkWrite').addEventListener('click', () => {
  const result = Lesson.parseAndValidate($('jsonEditor').value);
  result.errors.unshift(...Lesson.validateKey($('writeKey').value, validKeys));
  feedback('write', result.errors, '填写正确。请求已发送，请观察返回的回答。');
  if (!result.errors.length) showResponse('writeResponse', answers.eclipse);
  else {
    $('writeResponse').hidden = true;
    scenarioError('write', result.errors);
  }
});
const hints = {
  ui: '先到第 2 步创建密钥。Base URL 填 https://api.example.com/v1；API Key 填控制台本次生成的密钥；模型选 demo-small。',
  drag: '① 控制台本次生成的密钥放在 Bearer 后面；② 模型字段名是 "model"；③ 放整句彩虹提问。密钥不属于 JSON。',
  write:
    '上方 Key 填控制台本次生成的密钥；下面 JSON 两个占位符按顺序替换成 demo-small、用一句话解释月食。保留双引号。',
};
$('writeKey').addEventListener('input', () => {
  stopScenario('write');
  const value = $('writeKey').value.trim();
  $('writeHeaderPreview').textContent =
    'Authorization: Bearer ' +
    (validKeys.has(value) ? value : value ? '••••••••' : '__填写密钥__');
  $('writeResponse').hidden = true;
});
document.querySelectorAll('[data-hint]').forEach((b) =>
  b.addEventListener('click', () => {
    const box = $('feedback-' + b.dataset.hint);
    box.className = 'feedback hint';
    box.textContent = hints[b.dataset.hint];
  }),
);
document.querySelectorAll('[data-reset]').forEach((b) =>
  b.addEventListener('click', () => {
    const id = b.dataset.reset;
    stopScenario(id);
    completed.delete(id);
    completedTasks.delete(
      { ui: 'app-connection', drag: 'request-cards', write: 'request-json' }[
        id
      ],
    );
    completedKeys.delete(id);
    updateProgress();
    $('feedback-' + id).replaceChildren();
    if (id === 'ui') {
      fetchedConnection = null;
      savedConnection = null;
      connectionTested = false;
      $('providerEnabled').checked = true;
      $('protocolType').value = 'openai';
      $('useResponses').checked = false;
      $('useResponses').disabled = false;
      $('connectionModel').replaceChildren(makeOption('请先获取模型列表', ''));
      $('connectionModel').disabled = true;
      $('modelStatus').textContent = '填写地址和密钥后，获取服务商提供的模型。';
      ['baseUrl', 'apiKey', 'connectionModel'].forEach(
        (id) => ($(id).value = ''),
      );
      $('apiKey').type = 'password';
      $('toggleKey').textContent = '显示密钥';
      $('toggleKey').setAttribute('aria-pressed', 'false');
      updatePreview();
    }
    if (id === 'drag') {
      slots = { key: null, auth: null, content: null };
      selected = null;
      dragAnnouncement.textContent = '已重置，可以重新选择卡片。';
      renderCards();
    }
    if (id === 'write') {
      $('jsonEditor').value = skeleton;
      $('writeKey').value = '';
      $('writeHeaderPreview').textContent =
        'Authorization: Bearer __填写密钥__';
      $('writeResponse').hidden = true;
    }
  }),
);

const chapterNames = [
  '先分清应用与服务商',
  '创建 API Key',
  '练习一：连接第三方应用',
  '应用怎样组成请求',
  '巩固练习：拖拽请求',
  '巩固练习：补全 JSON',
  '连不上时怎样排查',
  '迁移到真实应用',
];
const nextLabels = [
  '下一步：领取密钥 →',
  '下一步：连接第三方应用 →',
  '继续理解：应用怎样发请求 →',
  '巩固练习：用卡片拼请求 →',
  '巩固练习：自己补全 JSON →',
  '下一步：学会排查问题 →',
  '最后：迁移到真实应用 →',
];
const visited = new Set([0]);
let currentChapter = 0;
function updateChapterMarks() {
  for (let i = 0; i < chapterNames.length; i++) {
    $('chapter-mark-' + i).textContent =
      i === currentChapter ? ' ← 当前' : visited.has(i) ? ' · 已读' : '';
  }
  const pending = [
    ['ui', '第三方应用连接'],
    ['drag', '拖拽 JSON'],
    ['write', '补全 JSON'],
  ]
    .filter(([id]) => !completed.has(id))
    .map(([, name]) => name);
  $('reviewStatus').textContent = pending.length
    ? '尚可继续练习：' + pending.join('、') + '。可用下方按钮或目录返回。'
    : '已完成应用连接与两项请求拓展练习；可以带着迁移清单去配置可信的真实应用。';
}
function goToChapter(index, moveFocus = true) {
  if (!Number.isInteger(index) || index < 0 || index >= chapterNames.length)
    return;
  const blocked = firstIncompleteBefore(index);
  if (index > currentChapter && blocked !== null) {
    if (blocked !== currentChapter) goToChapter(blocked, moveFocus);
    refreshLessonGates();
    highlightUnfinishedQuestions(blocked);
    history.replaceState(null, '', '#step-' + currentChapter);
    return;
  }
  closeFieldHints();
  currentChapter = index;
  if (index !== 0) stopDemo();
  visited.add(index);
  document
    .querySelectorAll('[data-step]')
    .forEach((s) => (s.hidden = Number(s.dataset.step) !== index));
  $('chapterProgress').textContent =
    '当前：第 ' + (index + 1) + ' 步 / 共 ' + chapterNames.length + ' 步';
  $('readingBar').style.width = ((index + 1) / chapterNames.length) * 100 + '%';
  $('prevStep').disabled = index === 0;
  $('nextStep').hidden = index === chapterNames.length - 1;
  $('nextStep').textContent = nextLabels[index] || '';
  $('nextDescription').textContent =
    index === chapterNames.length - 1
      ? '本课结束，可以返回任意一步复习。'
      : '接下来：' + chapterNames[index + 1];
  document.querySelector('.contents').open = false;
  updateChapterMarks();
  history.replaceState(null, '', '#step-' + index);
  if (index === 0 && !reducedMotion() && !demoUserPaused) resumeDemo();
  refreshLessonGates();
  if (moveFocus) {
    $('heading-' + index).focus({ preventScroll: true });
    document.querySelector('.reading-progress').scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
  }
}
$('prevStep').addEventListener('click', () => goToChapter(currentChapter - 1));
$('nextStep').addEventListener('click', () => goToChapter(currentChapter + 1));
document
  .querySelectorAll('[data-go]')
  .forEach((b) =>
    b.addEventListener('click', () => goToChapter(Number(b.dataset.go))),
  );

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function celebrate(el) {
  el.classList.remove('success-flash');
  void el.offsetWidth;
  el.classList.add('success-flash');
  if (reducedMotion()) return;
  el.querySelector('.celebration')?.remove();
  const overlay = document.createElement('span');
  overlay.className = 'celebration';
  overlay.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('i');
    p.style.setProperty('--x', (i - 5.5) * 14 + 'px');
    p.style.setProperty('--rot', (i % 2 ? 1 : -1) * (80 + i * 21) + 'deg');
    p.style.setProperty('--delay', (i % 4) * 35 + 'ms');
    p.style.background = ['#3c99c7', '#e5ad52', '#66ad88', '#c787a6'][i % 4];
    overlay.append(p);
  }
  overlay.addEventListener('animationend', () => overlay.remove(), {
    once: true,
  });
  el.append(overlay);
}
function stopScenario(id, message = '等待你完成请求设置。') {
  const state = scenarioStates.get(id);
  if (state) {
    window.clearInterval(state.timer);
    window.clearTimeout(state.wait);
    scenarioStates.delete(id);
  }
  const status = $('scenario-status-' + id);
  if (status) {
    status.textContent = message;
    status.className = 'scenario-status';
  }
  const messages = $('chat-messages-' + id);
  if (messages) {
    messages.replaceChildren();
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = '发送后，你的消息和模型回复会出现在这里。';
    messages.append(p);
  }
}
function scenarioError(id, errors) {
  stopScenario(id);
  let status = 400,
    label = '400 Bad Request',
    type = 'invalid_request_error',
    code = 'invalid_request',
    message = errors[0] || '请检查请求内容。';
  const key = requestKeyFor(id);
  if (id === 'ui' && !$('providerEnabled').checked) {
    status = null;
    label = '服务商未启用';
    type = 'configuration_error';
    code = 'provider_disabled';
    message = '请在设置中启用此服务商。';
  } else if (id === 'ui' && !$('baseUrl').value.trim()) {
    status = null;
    label = '连接失败';
    type = 'connection_error';
    code = 'missing_api_address';
    message = '尚未设置 API 地址。';
  } else if (
    id === 'ui' &&
    Lesson.normalizeBaseUrl($('baseUrl').value) !== 'https://api.example.com/v1'
  ) {
    status = null;
    label = '连接失败';
    type = 'connection_error';
    code = 'connection_failed';
    message = '无法连接到该服务地址，请检查连接设置。';
  } else if (!validKeys.has(key)) {
    status = 401;
    label = '401 Unauthorized';
    type = 'authentication_error';
    code = key ? 'invalid_api_key' : 'missing_api_key';
    message = key ? 'API Key 无效或已撤销。' : '未提供 API Key。';
  } else if (id === 'ui' && $('protocolType').value !== 'openai') {
    code = 'incompatible_protocol';
    message = '接口类型不匹配，此服务使用 OpenAI 兼容格式。';
  } else if (id === 'ui' && !$('connectionModel').value) {
    code = 'missing_model';
    message = '请先选择模型。';
  } else if (id === 'ui' && $('connectionModel').value !== 'demo-small') {
    status = 404;
    label = '404 Not Found';
    code = 'model_not_found';
    message = '未找到所选模型。';
  } else if (id === 'write') {
    try {
      const body = JSON.parse($('jsonEditor').value);
      if (
        body &&
        typeof body === 'object' &&
        body.model &&
        body.model !== 'demo-small'
      ) {
        status = 404;
        label = '404 Not Found';
        code = 'model_not_found';
        message = '未找到所选模型。';
      }
    } catch {
      code = 'invalid_json';
      message = '请求正文不是有效的 JSON。';
    }
  }
  const state = $('scenario-status-' + id);
  state.classList.add('failed');
  state.textContent = label;
  const bubble = document.createElement('div');
  bubble.className = 'chat-error';
  const text = document.createElement('p');
  text.textContent = message;
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify({ error: { message, type, code } }, null, 2);
  bubble.append(text, pre);
  $('chat-messages-' + id).replaceChildren(bubble);
}
function runScenario(id, prompt, answer) {
  stopScenario(id);
  const messages = $('chat-messages-' + id),
    status = $('scenario-status-' + id);
  messages.replaceChildren();
  const user = document.createElement('div');
  user.className = 'chat-bubble user-bubble';
  user.textContent = prompt;
  messages.append(user);
  const reply = document.createElement('div');
  reply.className = 'chat-bubble model-bubble';
  reply.textContent = '模型正在思考…';
  messages.append(reply);
  $('scenario-' + id).scrollIntoView({
    behavior: reducedMotion() ? 'instant' : 'smooth',
    block: 'nearest',
  });
  const state = { timer: null, wait: null, key: requestKeyFor(id) };
  scenarioStates.set(id, state);
  status.textContent = '请求已发送 → 验证密钥 → 等待回复';
  status.classList.add('working');
  function finish() {
    window.clearInterval(state.timer);
    reply.textContent = answer;
    reply.classList.remove('streaming');
    status.textContent = '回复完成 · 200 OK';
    status.className = 'scenario-status complete';
    scenarioStates.delete(id);
    celebrate($('scenario-' + id));
  }
  if (reducedMotion()) {
    finish();
    return;
  }
  state.wait = window.setTimeout(() => {
    if (scenarioStates.get(id) !== state) return;
    reply.textContent = '';
    reply.classList.add('streaming');
    status.textContent = '密钥验证通过 → 正在逐段接收回答…';
    let pos = 0;
    state.timer = window.setInterval(() => {
      if (scenarioStates.get(id) !== state) return;
      pos += 2;
      reply.textContent = answer.slice(0, pos);
      messages.scrollTop = messages.scrollHeight;
      if (pos >= answer.length) finish();
    }, 65);
  }, 650);
}
const demoCaptions = [
  '应用读取 Base URL、API Key 和模型设置，准备你的提问。',
  '应用拼出完整地址，把密钥放进请求头，把模型与消息放进正文。',
  '服务验证密钥和权限。验证通过后，模型开始处理这条消息。',
  '响应逐段返回。应用把收到的文字显示在聊天窗口里。',
];
let demoStage = 0,
  demoTimer = null,
  demoUserPaused = false;
function paintDemo() {
  document
    .querySelectorAll('[data-demo-stage]')
    .forEach((n) =>
      n.classList.toggle('active', Number(n.dataset.demoStage) === demoStage),
    );
  $('animationTrack').style.setProperty('--phase', demoStage);
  $('animationCaption').textContent = demoCaptions[demoStage];
}
function stopDemo() {
  if (demoTimer !== null) {
    window.clearInterval(demoTimer);
    demoTimer = null;
  }
  $('playDemo').textContent = '继续播放 ▶';
}
function resumeDemo() {
  if (demoTimer !== null) return;
  $('playDemo').textContent = '暂停演示 Ⅱ';
  demoTimer = window.setInterval(() => {
    demoStage = (demoStage + 1) % demoCaptions.length;
    paintDemo();
  }, 1800);
}
$('playDemo').addEventListener('click', () => {
  if (demoTimer !== null) {
    demoUserPaused = true;
    stopDemo();
  } else {
    demoUserPaused = false;
    resumeDemo();
  }
});
$('stepDemo').addEventListener('click', () => {
  demoUserPaused = true;
  stopDemo();
  demoStage = (demoStage + 1) % demoCaptions.length;
  paintDemo();
});
$('replayDemo').addEventListener('click', () => {
  stopDemo();
  demoStage = 0;
  demoUserPaused = false;
  paintDemo();
  resumeDemo();
});
paintDemo();
if (reducedMotion()) $('playDemo').textContent = '播放演示 ▶';
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopDemo();
  else if (currentChapter === 0 && !demoUserPaused && !reducedMotion())
    resumeDemo();
});
const requirements = {
  0: [['concept-api', '完成 API 概念选择题']],
  1: [['key-created', '命名并创建至少一把有效密钥']],
  2: [['exercise-ui', '保存配置并检测连接']],
  3: [['concept-request', '答对请求组成选择题']],
  4: [['exercise-drag', '检查并通过请求头与 JSON 卡片练习']],
  5: [['exercise-write', '检查并通过 JSON 练习']],
  6: [['concept-errors', '答对认证故障选择题']],
  7: [],
};
function requirementDone(id) {
  if (completedTasks.has(requirementTaskMap[id])) return true;
  if (id === 'key-created') return validKeys.size > 0;
  if (id.startsWith('exercise-')) return completed.has(id.slice(9));
  return answeredQuestions.has(id);
}
function firstIncompleteBefore(index) {
  for (let i = 0; i < index; i++) {
    if (requirements[i].some(([id]) => !requirementDone(id))) return i;
  }
  return null;
}
function refreshLessonGates() {
  for (const [id, task] of Object.entries(requirementTaskMap))
    if (requirementDone(id)) completedTasks.add(task);
  const items = requirements[currentChapter],
    pending = items.filter(([id]) => !requirementDone(id));
  const earlier = firstIncompleteBefore(currentChapter);
  const next = $('nextStep');
  next.disabled = false;
  next.removeAttribute('disabled');
  next.setAttribute('aria-disabled', 'false');
  next.setAttribute('aria-describedby', 'pageRequirement');
  next.classList.remove('is-locked');
  next.textContent = nextLabels[currentChapter] || '';
  $('pageRequirement').textContent =
    earlier !== null
      ? '第 ' + (earlier + 1) + ' 步还有未完成的练习，请先返回完成。'
      : pending.length
        ? '本页还需完成：' + pending.map(([, name]) => name).join('；') + '。'
        : items.length
          ? '本页练习全部完成，可以继续。'
          : '本页没有待答题目，可以继续学习。';
  updateQuestionMarkers();
  $('pageRequirement').classList.toggle(
    'requirements-complete',
    pending.length === 0 && earlier === null,
  );
  document.querySelectorAll('[data-go]').forEach((button) => {
    const target = Number(button.dataset.go),
      locked =
        target > currentChapter && firstIncompleteBefore(target) !== null;
    button.disabled = locked;
    button.setAttribute('aria-disabled', String(locked));
    button.title = locked ? '请先完成前面各页的练习。' : '';
  });
  persistLearningState();
}
const requirementTargets = {
  'concept-api': '[data-question="concept-api"].quick-check',
  'key-created': '.provider-console',
  'exercise-ui': '#panel-ui',
  'concept-request': '[data-question="concept-request"].quick-check',
  'exercise-drag': '#panel-drag',
  'exercise-write': '#panel-write',
  'concept-errors': '[data-question="concept-errors"].quick-check',
};
function updateQuestionMarkers() {
  for (const [id, selector] of Object.entries(requirementTargets)) {
    const target = document.querySelector(selector),
      done = requirementDone(id);
    if (!target) continue;
    target.classList.add('requirement-target');
    target.classList.toggle('is-complete', done);
    if (done) {
      target.classList.remove('needs-attention');
      target
        .querySelectorAll('.question-field-missing')
        .forEach((node) => node.classList.remove('question-field-missing'));
    }
    let state = target.querySelector('.completion-state');
    if (!state) {
      state = document.createElement('span');
      state.className = 'completion-state sr-only';
      target.append(state);
    }
    state.textContent = done ? '本题已完成' : '本题待完成';
  }
}
function highlightUnfinishedQuestions(index) {
  const pending = requirements[index].filter(([id]) => !requirementDone(id));
  let first = null;
  pending.forEach(([id]) => {
    const target = document.querySelector(requirementTargets[id]);
    if (!target) return;
    target.classList.remove('needs-attention');
    void target.offsetWidth;
    target.classList.add('needs-attention');
    first ??= target;
  });
  if (index === 2) {
    const values = connectionValues();
    const checks = [
      [
        'baseUrl',
        Lesson.normalizeBaseUrl(values.baseUrl) ===
          'https://api.example.com/v1',
      ],
      ['apiKey', validKeys.has(values.key)],
      ['protocolType', values.protocol === 'openai'],
      ['connectionModel', values.model === 'demo-small'],
    ];
    checks.forEach(([id, ok]) =>
      $(id).classList.toggle('question-field-missing', !ok),
    );
    if (checks.every(([, ok]) => ok))
      $(
        savedConnection && sameConnection(savedConnection, values)
          ? 'testConnection'
          : 'saveConnection',
      ).classList.add('question-field-missing');
  }
  if (index === 4) {
    for (const [slot, expected] of Object.entries({
      auth: 'auth',
      key: 'model',
      content: 'content',
    }))
      document
        .querySelector('[data-slot="' + slot + '"]')
        .classList.toggle('question-field-missing', slots[slot] !== expected);
  }
  if (index === 5) {
    $('writeKey').classList.toggle(
      'question-field-missing',
      !validKeys.has($('writeKey').value.trim()),
    );
    $('jsonEditor').classList.toggle(
      'question-field-missing',
      Lesson.parseAndValidate($('jsonEditor').value).errors.length > 0,
    );
  }
  if (first) {
    first.setAttribute('tabindex', '-1');
    first.focus({ preventScroll: true });
    first.scrollIntoView({
      behavior: reducedMotion() ? 'instant' : 'smooth',
      block: 'center',
    });
  }
}
document.addEventListener('input', (event) =>
  event.target.classList?.remove('question-field-missing'),
);
function rewardCorrectAnswer(id, element) {
  if (rewardedQuestions.has(id)) return;
  rewardedQuestions.add(id);
  celebrate(element);
  if (!reducedMotion()) {
    try {
      window.navigator.vibrate?.(18);
    } catch {}
  }
}
document.querySelectorAll('button[data-question]').forEach((button) =>
  button.addEventListener('click', () => {
    const id = button.dataset.question;
    if (answeredQuestions.has(id)) return;
    const result = $('result-' + id);
    if (button.dataset.correct === 'true') {
      answeredQuestions.add(id);
      result.textContent = '回答正确。' + result.dataset.explanation;
      button.classList.add('correct');
      document
        .querySelectorAll('button[data-question="' + id + '"]')
        .forEach((b) => (b.disabled = true));
      rewardCorrectAnswer(id, result);
      refreshLessonGates();
    } else {
      result.textContent = '请再想一想。' + result.dataset.explanation;
    }
  }),
);
document.querySelectorAll('.hint-trigger').forEach((button) => {
  button.addEventListener('mouseenter', () => positionFieldHint(button));
  button.addEventListener('focus', () => positionFieldHint(button));
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    closeFieldHints();
    if (!wasOpen) {
      button.setAttribute('aria-expanded', 'true');
      delete button.parentElement.dataset.dismissed;
      button.parentElement.dataset.open = 'true';
      positionFieldHint(button);
    }
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFieldHints();
      button.blur();
    }
  });
});
function positionFieldHint(button) {
  delete button.parentElement.dataset.dismissed;
  const tip = $(button.getAttribute('aria-controls'));
  const rect = button.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 32);
  tip.style.width = width + 'px';
  tip.style.left =
    Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)) +
    'px';
  const height = tip.offsetHeight || 100;
  const below = rect.bottom + 8;
  tip.style.top =
    (below + height <= window.innerHeight - 12
      ? below
      : Math.max(12, rect.top - height - 8)) + 'px';
}
function closeFieldHints() {
  document.querySelectorAll('.hint-trigger').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    delete button.parentElement.dataset.open;
    button.parentElement.dataset.dismissed = 'true';
  });
}
document.addEventListener('click', (event) => {
  if (!event.target.closest('.hint-wrap')) closeFieldHints();
});
document.addEventListener('scroll', closeFieldHints, true);
window.addEventListener('resize', closeFieldHints);
function persistLearningState() {
  const state = {
    version: 1,
    keys: keyRecords.map(({ key, label, createdAt, revoked }) => ({
      key,
      label,
      createdAt,
      revoked,
    })),
    tasks: Object.fromEntries(
      taskIds.filter((id) => completedTasks.has(id)).map((id) => [id, true]),
    ),
  };
  try {
    window.localStorage.setItem(learningStorageKey, JSON.stringify(state));
    $('storageStatus').textContent = '学习记录已保存在本机';
  } catch {
    $('storageStatus').textContent = '此浏览器未能保存学习记录';
  }
}
function restoreLearningState() {
  try {
    const raw = window.localStorage.getItem(learningStorageKey);
    if (!raw) return;
    const state = JSON.parse(raw);
    if (!state || state.version !== 1) return;
    if (Array.isArray(state.keys))
      for (const record of state.keys) {
        if (
          !record ||
          typeof record.key !== 'string' ||
          !/^demo-key-[0-9a-f]{16}$/.test(record.key) ||
          typeof record.label !== 'string' ||
          !record.label.trim() ||
          record.label.length > 40 ||
          typeof record.createdAt !== 'string' ||
          !Number.isFinite(Date.parse(record.createdAt)) ||
          typeof record.revoked !== 'boolean' ||
          keyRecords.some((existing) => existing.key === record.key)
        )
          continue;
        const key = {
          key: record.key,
          label: record.label,
          createdAt: record.createdAt,
          revoked: record.revoked,
        };
        keyRecords.push(key);
        if (!key.revoked) validKeys.add(key.key);
      }
    if (
      state.tasks &&
      typeof state.tasks === 'object' &&
      !Array.isArray(state.tasks)
    )
      for (const id of taskIds)
        if (state.tasks[id] === true) completedTasks.add(id);
    for (const [id, task] of Object.entries({
      ui: 'app-connection',
      drag: 'request-cards',
      write: 'request-json',
    }))
      if (completedTasks.has(task)) completed.add(id);
  } catch {}
  renderKeyList();
}
restoreLearningState();
practiceKeysReady = true;
syncPracticeKey();
updateProgress();
const initial = /^#step-([0-7])$/.exec(location.hash);
const requestedInitial = initial ? Number(initial[1]) : 0;
goToChapter(firstIncompleteBefore(requestedInitial) ?? requestedInitial, false);
window.addEventListener('hashchange', () => {
  const match = /^#step-([0-7])$/.exec(location.hash);
  if (match) goToChapter(Number(match[1]));
});
