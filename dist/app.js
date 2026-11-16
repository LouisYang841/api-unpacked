const $ = (id) => document.getElementById(id);
const completed = new Set();
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
    updateProgress();
  }
}
function updateProgress() {
  $('progressText').textContent = completed.size + ' / 3';
  $('progressBar').style.width = (completed.size / 3) * 100 + '%';
  $('completion').hidden = completed.size !== 3;
  updateChapterMarks();
}
document.querySelectorAll('[data-answer]').forEach((b) =>
  b.addEventListener('click', () => {
    $('quizFeedback').textContent =
      b.dataset.answer === 'right'
        ? '答对了。客户端或它的后端会把消息包装成请求，再发送给模型服务。'
        : '再想想：你输入的是文字，负责把文字包装成网络请求的是应用客户端或它的后端。';
    document
      .querySelectorAll('[data-answer]')
      .forEach((x) =>
        x.classList.toggle('correct', x === b && b.dataset.answer === 'right'),
      );
  }),
);
function uiBody() {
  return {
    model: 'demo-small',
    messages: [
      { role: 'system', content: '你是一位耐心的老师。' },
      {
        role: $('role').value || '__选择角色__',
        content: $('prompt').value || '__填写提问__',
      },
    ],
  };
}
function updatePreview() {
  const method = $('method').value || '__选择方法__';
  $('livePreview').textContent =
    method + ' /v1/chat/completions\n\n' + JSON.stringify(uiBody(), null, 2);
  $('uiResponse').textContent = '检查后，这里会显示模型的模拟回答。';
}
['method', 'role', 'prompt'].forEach((id) =>
  $(id).addEventListener('input', updatePreview),
);
updatePreview();
$('requestForm').after($('uiResponse'));
const answers = {
  rainbow: '彩虹是阳光进入水滴后发生折射、反射和色散，分出不同颜色而形成的。',
  eclipse: '月食是地球运行到太阳与月球之间，使月球进入地球影子而变暗的现象。',
};
function showResponse(id, answer) {
  const el = $(id);
  el.hidden = false;
  el.replaceChildren();
  const title = document.createElement('strong');
  title.textContent = '200 OK · 模拟响应（预设示例，并未调用模型）';
  const reply = document.createElement('p');
  reply.textContent = '模型回答：' + answer;
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
  el.append(title, reply, raw);
}
$('requestForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const errors = Lesson.validateUI({
    method: $('method').value,
    role: $('role').value,
    prompt: $('prompt').value,
  });
  feedback(
    'ui',
    errors,
    '填写正确！POST 提交消息，user 表示用户提问，content 存放提问内容。你已完成第一关。先看模拟响应，再点页面底部的“下一步”，学习 JSON 的写法。',
  );
  if (!errors.length) showResponse('uiResponse', answers.rainbow);
  else $('uiResponse').textContent = '先按提示调整，再试一次。';
});
const cards = [
  { id: 'assistant', text: '"assistant"' },
  { id: 'content', text: '"用一句话解释彩虹。"' },
  { id: 'messages', text: '"messages"' },
  { id: 'user', text: '"user"' },
  { id: 'model', text: '"model"' },
];
let slots = { key: null, role: null, content: null },
  selected = null;
const slotNames = { key: '① 字段名', role: '② 角色', content: '③ 提问内容' };
const dragAnnouncement = document.createElement('p');
dragAnnouncement.className = 'drag-help';
dragAnnouncement.setAttribute('role', 'status');
$('cardBank').after(dragAnnouncement);
function renderCards() {
  const bank = $('cardBank');
  bank.replaceChildren();
  cards
    .filter((c) => !Object.values(slots).includes(c.id))
    .forEach((c) => {
      const b = document.createElement('button');
      b.className = 'card' + (selected === c.id ? ' selected' : '');
      b.textContent = c.text;
      b.draggable = true;
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
  const errors = [];
  if (slots.key !== 'model')
    errors.push(
      '空位①后面是模型名称 demo-small，因此字段名应是 "model"；messages 对应的是整个消息列表。',
    );
  if (slots.role !== 'user')
    errors.push('空位②是提问者的角色，应放 "user"；assistant 表示模型的回复。');
  if (slots.content !== 'content')
    errors.push('空位③是 content 的值，应放具体提问“用一句话解释彩虹。”。');
  feedback(
    'drag',
    errors,
    '拼对了！卡片组合成了和表单相同的 JSON 正文。字段名和值都要用双引号包起来。先核对模拟响应，再点页面底部的“下一步”，亲手补全 JSON。',
  );
  if (!errors.length) showResponse('dragResponse', answers.rainbow);
  else $('dragResponse').hidden = true;
});
const skeleton = JSON.stringify(
  {
    model: '__填写__',
    messages: [
      { role: 'system', content: '你是一位耐心的老师。' },
      { role: '__填写__', content: '__填写__' },
    ],
  },
  null,
  2,
);
$('jsonEditor').value = skeleton;
$('jsonEditor').addEventListener('input', () => {
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
  feedback(
    'write',
    result.errors,
    '补全正确！你已经能把模型、角色和提问直接写进 JSON。正文只是请求的一部分，真实发送时仍需方法、地址和请求头。',
  );
  if (!result.errors.length) showResponse('writeResponse', answers.eclipse);
  else $('writeResponse').hidden = true;
});
const hints = {
  ui: '提交通常用 POST。提问的人是 user。把“用一句话解释彩虹。”填入提问内容；不是把预期回答填进去。',
  drag: '① model 选择模型；② user 是提问者；③ content 的值是整句提问。assistant 和 messages 两张卡片在这次填空中用不到。',
  write:
    '按顺序把三个占位符替换为 demo-small、user、用一句话解释月食。保留外面的英文双引号和原有 JSON 结构。',
};
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
    completed.delete(id);
    updateProgress();
    $('feedback-' + id).replaceChildren();
    if (id === 'ui') {
      $('requestForm').reset();
      updatePreview();
    }
    if (id === 'drag') {
      slots = { key: null, role: null, content: null };
      selected = null;
      dragAnnouncement.textContent = '已重置，可以重新选择卡片。';
      renderCards();
    }
    if (id === 'write') {
      $('jsonEditor').value = skeleton;
      $('writeResponse').hidden = true;
    }
  }),
);

const chapterNames = [
  '先认识 API',
  '拆开一次请求',
  '认识 API Key',
  '练习一：填写表单',
  '把表单写成 JSON',
  '练习二：拖拽 JSON',
  '练习三：补全 JSON',
  '读懂返回的回答',
  '准备真实调用',
];
const nextLabels = [
  '下一步：认识请求 →',
  '下一步：认识 API Key →',
  '下一步：照着填表 →',
  '下一步：认识 JSON →',
  '下一步：用卡片拼 JSON →',
  '下一步：自己补全 JSON →',
  '下一步：读懂响应 →',
  '下一步：准备真实调用 →',
];
const visited = new Set([0]);
let currentChapter = 0;
function updateChapterMarks() {
  for (let i = 0; i < chapterNames.length; i++) {
    $('chapter-mark-' + i).textContent =
      i === currentChapter ? ' ← 当前' : visited.has(i) ? ' · 已读' : '';
  }
  const pending = [
    ['ui', '表单'],
    ['drag', '拖拽 JSON'],
    ['write', '补全 JSON'],
  ]
    .filter(([id]) => !completed.has(id))
    .map(([, name]) => name);
  $('reviewStatus').textContent = pending.length
    ? '尚可继续练习：' + pending.join('、') + '。可用下方按钮或目录返回。'
    : '本课讲解和三项练习都已完成，可以随时从目录返回复习。';
}
function goToChapter(index, moveFocus = true) {
  if (!Number.isInteger(index) || index < 0 || index >= chapterNames.length)
    return;
  currentChapter = index;
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
  if (moveFocus) {
    $('heading-' + index).focus({ preventScroll: true });
    document
      .querySelector('.reading-progress')
      .scrollIntoView({
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
document.querySelectorAll('[data-key-answer]').forEach((b) =>
  b.addEventListener('click', () => {
    $('keyFeedback').textContent =
      b.dataset.keyAnswer === 'right'
        ? '答对了。本例放在 Authorization 请求头中；真实使用时以对应文档为准。'
        : '再看一下上面的示范：API Key 是认证凭证，应放在文档指定的认证请求头，不是模型名或提问内容。';
  }),
);
const initial = /^#step-([0-8])$/.exec(location.hash);
goToChapter(initial ? Number(initial[1]) : 0, false);
window.addEventListener('hashchange', () => {
  const match = /^#step-([0-8])$/.exec(location.hash);
  if (match) goToChapter(Number(match[1]));
});
