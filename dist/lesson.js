(function (root) {
  const prompts = { ui: '用一句话解释彩虹。', write: '用一句话解释月食。' };
  const norm = (s) =>
    String(s ?? '')
      .trim()
      .replace(/[。.!！?？\s]+$/u, '');
  function validateBody(body, prompt) {
    const errors = [];
    if (!body || typeof body !== 'object' || Array.isArray(body))
      return ['正文应是用花括号包起来的 JSON 对象。'];
    if (body.model !== 'demo-small')
      errors.push('model 用于选择模型；本题应填写教学模型 "demo-small"。');
    if (!Array.isArray(body.messages))
      return [...errors, 'messages 应是由方括号包起来的消息列表。'];
    if (body.messages.length !== 2)
      errors.push('本题保留两条消息：一条 system 指令和一条 user 提问。');
    const [system, user] = body.messages;
    if (system?.role !== 'system' || system?.content !== '你是一位耐心的老师。')
      errors.push('请保留已填好的 system 消息，它用于设定模型的整体行为。');
    if (user?.role !== 'user')
      errors.push(
        '这句话是用户在提问，所以第二条消息的 role 应是 "user"，而不是 assistant 或 system。',
      );
    if (
      typeof user?.content !== 'string' ||
      norm(user.content) !== norm(prompt)
    )
      errors.push('content 是具体说的话；本题请填写“' + prompt + '”。');
    const extra = Object.keys(body).filter(
      (k) => !['model', 'messages'].includes(k),
    );
    if (extra.length)
      errors.push(
        '本题只需 model 和 messages 两个顶层字段，请移除额外字段：' +
          extra.join('、') +
          '。',
      );
    return errors;
  }
  const endpointRules = {
    base: {
      suffix: '/chat/completions',
      expected: 'https://api.example.com/v1',
    },
    host: {
      suffix: '/v1/chat/completions',
      expected: 'https://api.example.com',
    },
    endpoint: {
      suffix: '',
      expected: 'https://api.example.com/v1/chat/completions',
    },
  };
  function composeEndpoint(value, rule = 'base') {
    const clean = String(value ?? '')
      .trim()
      .replace(/\/+$/, '');
    return clean ? clean + (endpointRules[rule]?.suffix ?? '') : '';
  }
  function generateTeachingKey(cryptoSource = root.crypto) {
    const bytes = new Uint8Array(8);
    cryptoSource.getRandomValues(bytes);
    return (
      'demo-key-' +
      Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    );
  }
  function validateKey(value, activeKey) {
    const errors = [];
    if (!activeKey)
      errors.push('请先返回第 2 步，在服务商控制台点击“创建教学密钥”。');
    const key = String(value ?? '').trim();
    if (activeKey && key !== activeKey)
      errors.push(
        /^Bearer\s|^Authorization:/i.test(key)
          ? '这里只填密钥本身，不要再加 Bearer 或 Authorization:。'
          : '密钥与本次签发的教学密钥不一致。请返回控制台复制最新的密钥；旧密钥和真实密钥不能用于本课。',
      );
    return errors;
  }
  function validateConnection(data, activeKey) {
    const errors = validateKey(data.key, activeKey);
    const base = String(data.baseUrl ?? '')
      .trim()
      .replace(/\/+$/, '');
    if (base !== endpointRules.base.expected) {
      if (base.includes('/chat/completions'))
        errors.push(
          '此应用会自动补 /chat/completions。请填写基础地址 https://api.example.com/v1，否则路径会重复。',
        );
      else if (base === 'https://api.example.com')
        errors.push(
          '此应用只补 /chat/completions，基础地址还需要保留 /v1：填写 https://api.example.com/v1。',
        );
      else
        errors.push(
          '请使用示例服务的 API 基础地址 https://api.example.com/v1，而不是官网或控制台网址。',
        );
    }
    if (data.model !== 'demo-small')
      errors.push(
        '本服务提供的模型 ID 是 demo-small，请选择它；其他服务的模型名不能直接拿来调用。',
      );
    return errors;
  }
  function parseAndValidate(text, prompt = prompts.write) {
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      return {
        errors: [
          'JSON 还不能被解析。检查英文双引号、逗号和括号；最后一项后面不能有逗号。解析器提示：' +
            e.message,
        ],
      };
    }
    return { body, errors: validateBody(body, prompt) };
  }
  const api = {
    prompts,
    validateBody,
    validateKey,
    generateTeachingKey,
    validateConnection,
    composeEndpoint,
    endpointRules,
    parseAndValidate,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Lesson = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
