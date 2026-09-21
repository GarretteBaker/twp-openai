const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function harness(respond) {
 const data = { openaiCredentials: { apiKey: 'fake-key', model: 'test-model' } };
 const listeners = [];
 const calls = [];
 const browser = { storage: {
  local: { get: async () => data, set: async value => Object.assign(data, value) },
  onChanged: { addListener: fn => listeners.push(fn) },
 } };
 const context = vm.createContext({ browser, chrome: { runtime: { onMessage: { addListener() {} } } }, console: {error() {}}, AbortController, setTimeout, clearTimeout,
  fetch: async (url, opts) => {
   const body = JSON.parse(opts.body); calls.push({url, opts, body});
   if(respond) return respond(body);
   const paragraphs = JSON.parse(body.input).paragraphs;
   for(const p of Object.values(paragraphs)) for(const k in p) p[k] = `EN:${p[k]}`;
   return { ok: true, json: async () => ({ status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(paragraphs)}]}] }) };
  },
 });
 vm.runInContext(fs.readFileSync('src/background/openaiService.js','utf8'),context);
 return { service:context.openaiService,data,calls, change(settings) {data.openaiCredentials=settings;listeners.forEach(fn=>fn({openaiCredentials:{newValue:settings}},'local'));} };
}
const plain = x => JSON.parse(JSON.stringify(x));
test('maps inline fragments and paragraphs exactly; sends no HTML, uses strict schema and store:false', async () => {
 const h=harness(); const rows=[['Bonjour ', 'monde.'],['Deuxième paragraphe.']];
 assert.deepEqual(plain(await h.service.translate('fr','en',rows)),[['EN:Bonjour ','EN:monde.'],['EN:Deuxième paragraphe.']]);
 assert.equal(h.calls[0].url,'https://api.openai.com/v1/responses');
 assert.equal(h.calls[0].body.store,false); assert.equal(h.calls[0].body.text.format.strict,true);
 assert.deepEqual(h.calls[0].body.text.format.schema.properties.p0.required,['s0','s1']);
 assert.equal(h.calls[0].opts.headers.Authorization,'Bearer fake-key');
 assert.ok(!h.calls[0].opts.body.includes('fake-key'));
});
test('coalesces concurrent identical calls, invalidates cache on model change', async()=>{
 const h=harness();await Promise.all([h.service.translate('fr','en',[['a']]),h.service.translate('fr','en',[['a']])]);assert.equal(h.calls.length,1);
 h.change({apiKey:'fake-key',model:'other'});await h.service.translate('fr','en',[['a']]);assert.equal(h.calls.length,2);assert.equal(h.calls[1].body.model,'other');
});
test('batches whole paragraphs without splitting fragments or losing order', async()=>{
 const h=harness();const rows=Array.from({length:4},(_,i)=>[String(i).repeat(3500)]);
 const result=await h.service.translate('fr','en',rows); assert.equal(h.calls.length,4);
 assert.deepEqual(plain(result),rows.map(row=>row.map(s=>'EN:'+s)));
});
test('missing key fails before network',async()=>{const h=harness();h.change({});await assert.rejects(h.service.translate('fr','en',[['a']]),/API key/);assert.equal(h.calls.length,0);});
test('429 halts queued requests until explicit reset',async()=>{
 const h=harness(()=>({ok:false,status:429}));const results=await Promise.allSettled([h.service.translate('fr','en',[['a']]),h.service.translate('fr','en',[['b']])]);
 assert.ok(results.every(r=>r.status==='rejected'));assert.equal(h.calls.length,1);assert.match(h.data.openaiStatus,/429/);
 h.service.removeTranslationsWithError();await assert.rejects(h.service.translate('fr','en',[['a']]),/429/);assert.equal(h.calls.length,2);
});
for(const [name,response] of [
 ['missing fragment',{status:'completed',output:[{content:[{type:'output_text',text:'{"p0":{}}'}]}]}],
 ['refusal',{status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]}],
 ['truncation',{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output:[]}],
 ['empty text',{status:'completed',output:[{content:[{type:'output_text',text:'{"p0":{"s0":""}}'}]}]}],
]) test(`rejects ${name} rather than corrupting a page`,async()=>{
 const h=harness(()=>({ok:true,json:async()=>response}));await assert.rejects(h.service.translate('fr','en',[['a']]));
});
test('preserves empty/whitespace-only rows without API calls',async()=>{const h=harness();assert.deepEqual(plain(await h.service.translate('fr','en',[[],[' ']])),[[],[' ']]);assert.equal(h.calls.length,0);});
test('rejects oversized paragraph without truncation or network',async()=>{const h=harness();await assert.rejects(h.service.translate('fr','en',[['a'.repeat(12001)]]),/too large/);assert.equal(h.calls.length,0);});
test('OpenAI never falls back to another service for any language',()=>{
 const context=vm.createContext({});vm.runInContext(fs.readFileSync('src/lib/languages.js','utf8'),context);
 assert.equal(vm.runInContext("twpLang.getAlternativeService('xx','openai',true)",context),'openai');
});
