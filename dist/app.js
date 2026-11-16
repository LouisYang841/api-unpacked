const $ = (id) => document.getElementById(id);
const completed = new Set();
let activeKey = null;
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
    title.textContent = '再检查一下，已经很接近了：';
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
    celebrate(box);
    updateProgress();
  }
}
function updateProgress() {
  $('progressText').textContent = completed.size + ' / 3';
  $('progressBar').style.width = (completed.size / 3) * 100 + '%';
  $('completion').hidden = completed.size !== 3;
  updateChapterMarks();
}
function uiBody() {
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
  const endpoint = Lesson.composeEndpoint($('baseUrl').value);
  const key = $('apiKey').value.trim();
  // Never echo arbitrary entered credentials into the page or logs.
  $('livePreview').textContent =
    'POST ' +
    (endpoint || '__等待填写地址__') +
    '\nAuthorization: Bearer ' +
    (validKeys.has(key)
      ? key
      : key
        ? '[已隐藏：本课只接收教学密钥]'
        : '__等待填写密钥__') +
    '\nContent-Type: application/json\n\n' +
    JSON.stringify(uiBody(), null, 2);
  if (reset)
    $('uiResponse').textContent =
      '配置更新了。点击检测连接，观察地址、密钥与模型是否匹配。';
}
['baseUrl', 'apiKey', 'connectionModel'].forEach((id) =>
  $(id).addEventListener('input', updatePreview),
);
updatePreview();
$('toggleKey').addEventListener('click', () => {
  const show = $('apiKey').type === 'password';
  $('apiKey').type = show ? 'text' : 'password';
  $('toggleKey').setAttribute('aria-pressed', String(show));
  $('toggleKey').textContent = show ? '隐藏教学密钥' : '显示教学密钥';
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
    $('revokeKey').focus();
  }),
);
['keyNameDialog', 'revokeDialog'].forEach((id) => {
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
    $('keyIssueStatus').textContent =
      '无法生成教学密钥，请使用支持 Web Crypto 的浏览器访问此 HTTPS 页面。';
    $('keyNameError').textContent = $('keyIssueStatus').textContent;
    return;
  }
  closeConsoleDialog('keyNameDialog');
  $('issuedKey').value = activeKey;
  syncTeachingKey();
  $('keyReceipt').hidden = false;
  $('createKey').disabled = false;
  $('createKey').textContent = '＋ 创建 API 密钥';
  $('keyIssueStatus').textContent =
    '已新增一把随机教学密钥。之前未撤销的密钥仍然有效；下面可切换查看、复制或单独撤销。刷新页面后全部失效。';
  $('keyReceipt').classList.remove('key-arrival');
  void $('keyReceipt').offsetWidth;
  $('keyReceipt').classList.add('key-arrival');
  celebrate($('keyReceipt'));
  $('issuedKey').focus();
});
$('copyKey').addEventListener('click', async () => {
  if (!activeKey) {
    $('keyIssueStatus').textContent = '请先创建一把教学密钥。';
    return;
  }
  try {
    if (!window.navigator.clipboard?.writeText) throw new Error('unavailable');
    await window.navigator.clipboard.writeText(activeKey);
    $('keyIssueStatus').textContent = '已复制本次生成的教学密钥。';
  } catch {
    $('issuedKey').focus();
    $('issuedKey').select?.();
    $('keyIssueStatus').textContent = '可以手动复制上方刚生成的教学密钥。';
  }
});
$('revokeKey').addEventListener('click', () => requestRevocation(activeKey));
function requestKeyFor(id) {
  return id === 'ui'
    ? $('apiKey').value.trim()
    : id === 'write'
      ? $('writeKey').value.trim()
      : cards.find((c) => c.id === 'auth').text;
}
function renderKeyList() {
  const list = $('keyList');
  list.replaceChildren();
  keyRecords.forEach((record) => {
    const li = document.createElement('li');
    li.dataset.key = record.key;
    li.className =
      'key-record' +
      (record.revoked ? ' revoked' : '') +
      (record.key === activeKey ? ' current' : '');
    const title = document.createElement('strong');
    title.textContent =
      record.label +
      (record.revoked
        ? ' · 已撤销'
        : record.key === activeKey
          ? ' · 当前查看'
          : ' · 有效');
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
      const select = document.createElement('button');
      select.className = 'text-button';
      select.textContent = '查看 / 用于示范';
      select.type = 'button';
      select.addEventListener('click', () => {
        activeKey = record.key;
        syncTeachingKey();
        $('keyIssueStatus').textContent =
          '已切换查看 ' + record.label + '。其他未撤销的密钥仍然有效。';
      });
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'text-button';
      revoke.textContent = '撤销这一把';
      revoke.addEventListener('click', () => requestRevocation(record.key));
      li.append(select, revoke);
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
      completed.delete(id);
      completedKeys.delete(id);
      stopScenario(id, '本次请求使用的密钥已撤销，请换一把有效密钥。');
      $('feedback-' + id).replaceChildren();
      $(id + 'Response').hidden = true;
    }
  });
  syncTeachingKey();
  if (savedConnection?.key === key) {
    connectionTested = false;
    $('sendChat').disabled = true;
    setConnectionNotice('已保存配置的密钥被撤销，请更换密钥并重新保存。', true);
  }
  updateProgress();
  $('keyIssueStatus').textContent =
    '已撤销所选密钥，其他 ' +
    validKeys.size +
    ' 把密钥继续有效。已填入的其他有效密钥无需更换。';
}
function resetAddressLab() {
  $('addressFeedback').textContent =
    '请按当前应用会补的路径，选一个合适的地址。';
  $('addressResult').textContent = '等待选择地址';
  document
    .querySelectorAll('[data-address-choice]')
    .forEach((b) => b.classList.remove('correct'));
}
$('addressRule').addEventListener('change', resetAddressLab);
document.querySelectorAll('[data-address-choice]').forEach((b) =>
  b.addEventListener('click', () => {
    const rule = $('addressRule').value;
    const correct =
      b.dataset.addressChoice === Lesson.endpointRules[rule].expected;
    $('addressResult').textContent = Lesson.composeEndpoint(
      b.dataset.addressChoice,
      rule,
    );
    $('addressFeedback').textContent = correct
      ? '选对了！应用补完路径后，刚好得到服务商给的完整 Endpoint。'
      : '看看下面的最终地址：路径重复了，或者少了一段。换一个基础地址，使最终地址刚好等于完整 Endpoint。';
    document
      .querySelectorAll('[data-address-choice]')
      .forEach((x) => x.classList.toggle('correct', x === b && correct));
  }),
);
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
  title.textContent = '200 OK · 模拟响应（预设示例，并未调用模型）';

  const raw = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '查看原始响应 JSON（后面会逐步讲解）';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(
    { choices: [{ message: { role: 'assistant', content: answer } }] },
    null,
    2,
  );
  const note = document.createElement('span');
  note.textContent = '回答在 choices[0].message.content 中。';
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
  };
}
function sameConnection(a, b) {
  return (
    a && b && a.baseUrl === b.baseUrl && a.key === b.key && a.model === b.model
  );
}
function setConnectionNotice(message, bad = false) {
  $('connectionStatus').textContent = message;
  $('connectionStatus').classList.toggle('status-error', bad);
}
function invalidateConnection() {
  connectionTested = false;
  $('sendChat').disabled = true;
  $('testConnection').disabled = true;
  const values = connectionValues();
  if (
    fetchedConnection &&
    (values.baseUrl !== fetchedConnection.baseUrl ||
      values.key !== fetchedConnection.key)
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
  $('modelStatus').textContent =
    '已获取 1 个可用模型（模拟）。请选择 demo-small。';
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
  $('sendChat').disabled = true;
  $('testConnection').disabled = false;
  setConnectionNotice('配置已保存（仅本次页面有效）。下一步：点击“检测连接”。');
});
$('providerEnabled').addEventListener('change', () => {
  connectionTested = false;
  $('sendChat').disabled = true;
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
    $('sendChat').disabled = true;
    setConnectionNotice(errors.join(' '), true);
    scenarioError('ui', errors);
    return;
  }
  connectionTested = true;
  $('sendChat').disabled = false;
  setConnectionNotice('连接检测通过（模拟）。请到下方聊天窗口点击“发送”。');
  $('scenario-status-ui').textContent =
    '服务商已连接 · demo-small 已选中 · 等待发送消息';
  celebrate($('connectionStatus'));
});
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const errors = savedConnection
    ? Lesson.validateConnection(savedConnection, validKeys)
    : ['请先保存服务配置。'];
  if (!connectionTested || !sameConnection(savedConnection, connectionValues()))
    errors.push('请先保存当前配置并完成连接检测。');
  if (!$('providerEnabled').checked)
    errors.push('服务商已停用，请先启用并重新检测。');
  feedback(
    'ui',
    errors,
    '检查结果：用户消息已提交，密钥验证通过。请观察聊天窗口中逐段显示的模型回答。',
  );
  if (!errors.length) showResponse('uiResponse', answers.rainbow);
  else scenarioError('ui', errors);
});
const cards = [
  { id: 'assistant', text: '"assistant"' },
  { id: 'content', text: '"用一句话解释彩虹。"' },
  { id: 'messages', text: '"messages"' },
  { id: 'auth', text: '先领取教学密钥' },
  { id: 'model', text: '"model"' },
];
let slots = { key: null, auth: null, content: null },
  selected = null;
function syncTeachingKey() {
  $('issuedKey').value = activeKey || '';
  $('issuedKeyLabel').textContent = activeKey
    ? '已创建 · ' + keyRecords.find((r) => r.key === activeKey).label
    : '尚未创建密钥';
  $('keyReceipt').hidden = !activeKey;
  const card = cards.find((c) => c.id === 'auth');
  if (!slots.auth || !validKeys.has(card.text)) {
    if (!validKeys.has(card.text)) slots.auth = null;
    const next = activeKey || '先领取教学密钥';
    if (card.text !== next) {
      card.text = next;
      renderCards();
    }
  }
  document
    .querySelectorAll('[data-issued-key]')
    .forEach((el) => (el.textContent = activeKey || 'demo-key-…（待领取）'));
  renderKeyList();
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
      b.disabled = c.id === 'auth' && !activeKey;
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
    b.classList.toggle('filled', !!c);
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
    el.textContent =
      '缩进已整理。格式正确不代表内容符合任务，还可以点击“检查并模拟发送”。';
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
  feedback(
    'write',
    result.errors,
    '补全正确！教学密钥在请求头中通过认证，模型和新问题写在 JSON 中。你已把同一把密钥用于三种请求配置方式。',
  );
  if (!result.errors.length) showResponse('writeResponse', answers.eclipse);
  else {
    $('writeResponse').hidden = true;
    scenarioError('write', result.errors);
  }
});
const hints = {
  ui: '先到第 2 步模拟创建密钥。Base URL 填 https://api.example.com/v1；API Key 填控制台本次生成的密钥；模型选 demo-small。',
  drag: '① 控制台本次生成的教学密钥放在 Bearer 后面；② 模型字段名是 "model"；③ 放整句彩虹提问。密钥不属于 JSON。',
  write:
    '上方 Key 填控制台本次生成的密钥；下面 JSON 两个占位符按顺序替换成 demo-small、用一句话解释月食。保留双引号。',
};
$('writeKey').addEventListener('input', () => {
  stopScenario('write');
  const value = $('writeKey').value.trim();
  $('writeHeaderPreview').textContent =
    'Authorization: Bearer ' +
    (validKeys.has(value)
      ? value
      : value
        ? '[只接收教学密钥]'
        : '__填写密钥__');
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
    completedKeys.delete(id);
    updateProgress();
    $('feedback-' + id).replaceChildren();
    if (id === 'ui') {
      fetchedConnection = null;
      savedConnection = null;
      connectionTested = false;
      $('providerEnabled').checked = true;
      $('connectionModel').replaceChildren(makeOption('请先获取模型列表', ''));
      $('connectionModel').disabled = true;
      $('modelStatus').textContent = '填写地址和密钥后，获取服务商提供的模型。';
      ['baseUrl', 'apiKey', 'connectionModel'].forEach(
        (id) => ($(id).value = ''),
      );
      $('apiKey').type = 'password';
      $('toggleKey').textContent = '显示教学密钥';
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
  '模拟申请 API Key',
  '地址究竟填到哪里',
  '练习一：连接第三方应用',
  '应用怎样组成请求',
  '拓展练习：拖拽请求',
  '拓展练习：补全 JSON',
  '连不上时怎样排查',
  '迁移到真实应用',
];
const nextLabels = [
  '下一步：领取教学密钥 →',
  '下一步：分清地址怎么填 →',
  '下一步：连接第三方应用 →',
  '继续理解：应用怎样发请求 →',
  '拓展：用卡片拼请求 →',
  '拓展：自己补全 JSON →',
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
  if (index === 0 && !reducedMotion()) {
    stopDemo();
    startDemo();
  }
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
  const status = $('scenario-status-' + id);
  status.classList.add('failed');
  status.textContent = '配置检查未通过，尚未发送请求。';
  const bubble = document.createElement('p');
  bubble.className = 'chat-error';
  bubble.textContent = errors[0] || '请检查连接设置。';
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
  status.textContent = '请求已发出 → 服务验证教学密钥 → 等待首段回答';
  status.classList.add('working');
  function finish() {
    window.clearInterval(state.timer);
    reply.textContent = answer;
    reply.classList.remove('streaming');
    status.textContent = '接收完成 · 密钥通过教学验证 · 200 OK（模拟）';
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
  demoTimer = null;
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
  $('playDemo').textContent = '重新播放 ▶';
}
function startDemo() {
  if (demoTimer !== null) {
    stopDemo();
    return;
  }
  demoStage = 0;
  paintDemo();
  $('playDemo').textContent = '暂停演示 Ⅱ';
  demoTimer = window.setInterval(() => {
    demoStage++;
    if (demoStage >= demoCaptions.length) {
      demoStage = demoCaptions.length - 1;
      stopDemo();
      return;
    }
    paintDemo();
  }, 1800);
}
$('playDemo').addEventListener('click', startDemo);
$('stepDemo').addEventListener('click', () => {
  stopDemo();
  demoStage = (demoStage + 1) % demoCaptions.length;
  paintDemo();
});
paintDemo();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopDemo();
});
const initial = /^#step-([0-8])$/.exec(location.hash);
goToChapter(initial ? Number(initial[1]) : 0, false);
window.addEventListener('hashchange', () => {
  const match = /^#step-([0-8])$/.exec(location.hash);
  if (match) goToChapter(Number(match[1]));
});
