const assert=require('node:assert/strict');const fs=require('node:fs');const L=require('./dist/lesson.js');
assert.deepEqual(L.validateUI({method:'POST',role:'user',prompt:L.prompts.ui}),[]);
assert.equal(L.validateUI({method:'GET',role:'assistant',prompt:'答案'}).length,3);
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
assert(html.includes('Authorization: Bearer this-is-a-key'),'Use the explicit teaching placeholder');
assert(!html.includes('DEMO_KEY'),'Keep the teaching key consistent');
assert(!html.includes('role="tablist"'),'Exercises should follow the lesson rather than require switching tabs');
assert(ids.includes('prevStep')&&ids.includes('nextStep'),'Provide explicit sequential navigation');
console.log('通过：请求语义、JSON 语法、异常结构、三关元素与静态资源检查。');
