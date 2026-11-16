(function(root){
  const prompts={ui:'用一句话解释彩虹。',write:'用一句话解释月食。'};
  const norm=s=>String(s??'').trim().replace(/[。.!！?？\s]+$/u,'');
  function validateBody(body,prompt){
    const errors=[];
    if(!body||typeof body!=='object'||Array.isArray(body))return ['正文应是用花括号包起来的 JSON 对象。'];
    if(body.model!=='demo-small')errors.push('model 用于选择模型；本题应填写教学模型 "demo-small"。');
    if(!Array.isArray(body.messages))return [...errors,'messages 应是由方括号包起来的消息列表。'];
    if(body.messages.length!==2)errors.push('本题保留两条消息：一条 system 指令和一条 user 提问。');
    const [system,user]=body.messages;
    if(system?.role!=='system'||system?.content!=='你是一位耐心的老师。')errors.push('请保留已填好的 system 消息，它用于设定模型的整体行为。');
    if(user?.role!=='user')errors.push('这句话是用户在提问，所以第二条消息的 role 应是 "user"，而不是 assistant 或 system。');
    if(typeof user?.content!=='string'||norm(user.content)!==norm(prompt))errors.push('content 是具体说的话；本题请填写“'+prompt+'”。');
    const extra=Object.keys(body).filter(k=>!['model','messages'].includes(k));
    if(extra.length)errors.push('本题只需 model 和 messages 两个顶层字段，请移除额外字段：'+extra.join('、')+'。');
    return errors;
  }
  function validateUI(data){return [...(data.method==='POST'?[]:['这里要提交消息并生成回答，请选择 POST；GET 常用于读取已有资源。']),...validateBody({model:'demo-small',messages:[{role:'system',content:'你是一位耐心的老师。'},{role:data.role,content:data.prompt}]},prompts.ui)];}
  function parseAndValidate(text,prompt=prompts.write){let body;try{body=JSON.parse(text);}catch(e){return {errors:['JSON 还不能被解析。检查英文双引号、逗号和括号；最后一项后面不能有逗号。解析器提示：'+e.message]};}return {body,errors:validateBody(body,prompt)};}
  const api={prompts,validateBody,validateUI,parseAndValidate};if(typeof module!=='undefined')module.exports=api;else root.Lesson=api;
})(typeof globalThis!=='undefined'?globalThis:this);
