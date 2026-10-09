import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolvePlaces, validate, label, ENDPOINT} from '../client.mjs';

test('selection size uses Unicode characters and rejects empty/oversized text', () => {
  assert.throws(() => validate('  '));
  validate('😀'.repeat(20000));
  assert.throws(() => validate('a'.repeat(20001)));
});
test('requests only the existing resolve endpoint, India and no LLM', async () => {
  const items = [{mention:'Madras',score:100}];
  const result = await resolvePlaces('Madras','names',true,undefined,async (url,options) => {
    assert.equal(url, ENDPOINT);
    assert.equal(options.redirect,'error');
    assert.equal(options.credentials,'omit');
    assert.deepEqual(JSON.parse(options.body),{text:'Madras',mode:'names',use_osm:true,use_llm:false,country:'IN'});
    return {ok:true,json:async () => ({results:items})};
  });
  assert.deepEqual(result,items);
});
test('review threshold, ambiguity and outside scope are not misrepresented', () => {
  assert.equal(label({score:79,selected:{}}),'Needs review');
  assert.equal(label({score:100,needs_review:true,selected:{}}),'Needs review');
  assert.equal(label({score:80,selected:{}}),'Resolved');
  assert.equal(label({status:'out_of_scope',score:null}),'Outside India');
});
test('server errors and wrong response schemas are visible', async () => {
  await assert.rejects(resolvePlaces('Madras','auto',false,undefined,async () => ({ok:false,json:async () => ({error:'Example error'})})), /Example error/);
  await assert.rejects(resolvePlaces('Madras','auto',false,undefined,async () => ({ok:true,json:async () => ({})})), /Unexpected response/);
});
test('automatic scanner uses isolated top-frame scripts; API host remains local', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json',import.meta.url),'utf8'));
  assert.deepEqual(manifest.host_permissions,['http://127.0.0.1/*']);
  assert.deepEqual(manifest.content_scripts[0].js,['scanner-core.js','content.js']);
  assert.equal(manifest.content_scripts[0].all_frames,false);
  assert.ok(manifest.content_scripts[0].exclude_matches.includes('http://127.0.0.1/*'));
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.version,'1.3.0');
  assert.equal(manifest.action.default_popup,'panel.html');
  assert.equal(manifest.side_panel,undefined);
});
