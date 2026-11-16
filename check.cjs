const assert=require('node:assert/strict');const fs=require('node:fs');const L=require('./dist/lesson.js');
const teachingKey=L.generateTeachingKey();
assert(/^demo-key-[0-9a-f]{16}$/.test(teachingKey));
const replacementKey=L.generateTeachingKey();assert.notEqual(teachingKey,replacementKey);
const validKeys=new Set([teachingKey]);
const connection={baseUrl:'https://api.example.com/v1',key:teachingKey,model:'demo-small'};
assert.deepEqual(L.validateConnection(connection,validKeys),[]);
assert(L.validateConnection(connection,null).length,'An unissued or revoked teaching key cannot authenticate');
assert(L.validateConnection({...connection,key:''},validKeys).length);
assert(L.validateConnection({...connection,key:'Bearer '+teachingKey},validKeys).some(x=>x.includes('Bearer')));
assert(L.validateConnection({...connection,baseUrl:'https://api.example.com/v1/chat/completions'},validKeys).some(x=>x.includes('重复')));
assert(L.validateConnection({...connection,baseUrl:'https://api.example.com'},validKeys).some(x=>x.includes('/v1')));
assert(L.validateConnection({...connection,model:'another-model'},validKeys).length);
assert.deepEqual(L.validateConnection({...connection,baseUrl:' https://api.example.com/v1/ '},validKeys),[]);
for(const [rule,entry] of Object.entries(L.endpointRules))assert.equal(L.composeEndpoint(entry.expected,rule),'https://api.example.com/v1/chat/completions');
assert.equal(L.composeEndpoint(''), '');
assert.deepEqual(L.validateKey(teachingKey,validKeys),[]);
assert(L.validateKey(teachingKey,null).length);
assert(L.parseAndValidate('{bad').errors.length);
assert(L.parseAndValidate('null').errors.length);
assert(L.parseAndValidate('[]').errors.length);
const valid={model:'demo-small',messages:[{role:'system',content:'你是一位耐心的老师。'},{role:'user',content:L.prompts.write}]};
assert.deepEqual(L.parseAndValidate(JSON.stringify(valid)).errors,[]);
for(const value of [null,[],{},'hello',12]){const body={...valid,messages:value};assert(L.validateBody(body,L.prompts.write).length);}
assert(L.validateBody({...valid,model:'wrong'},L.prompts.write).length);
assert(L.validateBody({...valid,messages:[...valid.messages,{role:'user',content:'extra'}]},L.prompts.write).length);
assert(L.validateBody(valid,L.prompts.ui).length);
const html=fs.readFileSync('dist/index.html','utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'IDs must be unique');
const app=fs.readFileSync('dist/app.js','utf8');for(const m of app.matchAll(/\$\('([^']+)'\)/g)){assert(ids.includes(m[1]),'Missing element '+m[1]);}
for(const file of ['style.css','lesson.js','app.js'])assert(fs.existsSync('dist/'+file));
const chapters=[...html.matchAll(/data-step="(\d+)"/g)].map(m=>Number(m[1]));
assert.deepEqual(chapters,[0,1,2,3,4,5,6,7,8],'Nine chapters should follow the teaching sequence');
for(const chapter of chapters)assert(ids.includes('heading-'+chapter));
for(const match of html.matchAll(/data-go="(\d+)"/g))assert(chapters.includes(Number(match[1])),'Navigation target must exist');
assert(html.includes('data-issued-key'),'Examples show the currently generated teaching key');
assert(L.validateKey(teachingKey,new Set([replacementKey])).length,'Replacing a key invalidates the old value');
assert(!html.includes('DEMO_KEY'),'Keep the teaching key consistent');
assert(!html.includes('role="tablist"'),'Exercises should follow the lesson rather than require switching tabs');
assert(ids.includes('prevStep')&&ids.includes('nextStep'),'Provide explicit sequential navigation');
for(const id of ['createKey','revokeKey','issuedKey','keyNameDialog','keyNameForm','keyName','revokeDialog','confirmRevoke','baseUrl','apiKey','fetchModels','connectionModel','saveConnection','testConnection','chatForm','sendChat','writeKey','scenario-ui','scenario-drag','scenario-write','playDemo','stepDemo'])assert(ids.includes(id),'Missing learning interaction '+id);
assert(html.includes('data-slot="auth"'),'The drag request includes an authentication header');
assert(ids.includes('pageRequirement')&&ids.includes('replayDemo'),'Lesson gate status and replay control exist');
for(const rule of ['base','host','endpoint']){assert(html.includes('data-address-rule="'+rule+'"'),'All three address questions are visible');assert(ids.includes('address-feedback-'+rule)&&ids.includes('address-result-'+rule),'Each address question has independent feedback');}
assert(!ids.includes('addressRule'),'Address questions must not be hidden behind a dropdown');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(app),'All model calls remain simulated');
console.log('通过：服务地址拼接、密钥签发与认证、连接配置、JSON 语法与语义、分步结构、模拟聊天与静态资源检查。');

const bothKeys=new Set([teachingKey,replacementKey]);assert.deepEqual(L.validateKey(teachingKey,bothKeys),[]);assert.deepEqual(L.validateKey(replacementKey,bothKeys),[]);bothKeys.delete(teachingKey);assert(L.validateKey(teachingKey,bothKeys).length);assert.deepEqual(L.validateKey(replacementKey,bothKeys),[]);
