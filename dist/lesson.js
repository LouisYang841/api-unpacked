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
    if (body.model !== 'demo-small') errors.push('模型名称应为 "demo-small"。');
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
  function normalizeBaseUrl(value) {
    const clean = String(value ?? '')
      .trim()
      .replace(/\/+$/, '');
    if (
      [
        'https://api.example.com',
        'https://api.example.com/v1',
        'https://api.example.com/v1/chat/completions',
        'https://api.example.com/v1/responses',
      ].includes(clean)
    )
      return 'https://api.example.com/v1';
    return clean;
  }
  function composeEndpoint(value, useResponses = false) {
    const base = normalizeBaseUrl(value);
    return base
      ? base + (useResponses ? '/responses' : '/chat/completions')
      : '';
  }
  function generateTeachingKey(cryptoSource = root.crypto) {
    const bytes = new Uint8Array(8);
    cryptoSource.getRandomValues(bytes);
    return (
      'demo-key-' +
      Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    );
  }
  function validateKey(value, validKeys) {
    const errors = [];
    if (!validKeys?.size) errors.push('请先在服务商控制台创建 API 密钥。');
    const key = String(value ?? '').trim();
    if (validKeys?.size && !validKeys.has(key))
      errors.push(
        /^Bearer\s|^Authorization:/i.test(key)
          ? 'API Key 字段只填写密钥值。'
          : '认证失败：密钥无效或已撤销。请从控制台复制一把有效密钥。',
      );
    return errors;
  }
  function validateConnection(data, validKeys) {
    const errors = validateKey(data.key, validKeys);
    if (normalizeBaseUrl(data.baseUrl) !== 'https://api.example.com/v1')
      errors.push('服务地址不正确。请填写 https://api.example.com/v1。');
    if (data.protocol !== 'openai')
      errors.push('接口类型不匹配。此服务使用 OpenAI 兼容格式。');
    if (data.model !== 'demo-small')
      errors.push('模型不可用，请选择 demo-small。');
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
    normalizeBaseUrl,
    parseAndValidate,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Lesson = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
