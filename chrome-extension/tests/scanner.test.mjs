import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const scope = {};
vm.runInNewContext(await readFile(new URL('../scanner-core.js',import.meta.url),'utf8'),scope);
const {chunks, annotations, locate} = scope.STHALAMScan;
const hit = (mention,start,end,extra={}) => ({mention,start,end,selected:{name:'Chennai'},score:100,candidates:[],...extra});

test('Python codepoint offsets map to browser UTF-16 spans after emoji', () => {
  const text='😀 Madras and Madras.';
  const items=annotations(text,[hit('Madras',2,8),hit('Madras',13,19)]);
  assert.equal(items.length,2);
  assert.equal(text.slice(items[0].start,items[0].end),'Madras');
  assert.equal(text.slice(items[1].start,items[1].end),'Madras');
  assert.equal(items[0].start,3);
});
test('inline elements map a mention to two distinct text nodes', () => {
  const parts=[{start:0,end:4,node:'New '},{start:4,end:9,node:'Delhi'}];
  const result=locate(parts,0,9);
  assert.equal(result.first.node,'New ');
  assert.equal(result.last.node,'Delhi');
  assert.equal(result.end,5);
});
test('low-score fallback is a suggestion, not a resolved canonical name', () => {
  const items=annotations('Madras',[hit('Madras',0,6,{selected:null,score:70,candidates:[{name:'Chennai'}]})]);
  assert.equal(items[0].review,true);
  assert.equal(items[0].canonical,'Chennai');
});
test('invalid, stale, overlapping and outside-India spans are rejected', () => {
  assert.equal(annotations('Madras',[hit('Bombay',0,6)]).length,0);
  assert.equal(annotations('Madras',[hit('Madras',0,60)]).length,0);
  assert.equal(annotations('Madras',[hit('Madras',0,6,{status:'out_of_scope'})]).length,0);
  assert.equal(annotations('Madras',[hit('Madras',0,6),hit('Madras',0,6)]).length,1);
});
test('a mention ending at the end of a paragraph is retained', () => {
  const items=annotations('Arrived in Madras',[hit('Madras',11,17)]);
  assert.equal(items.length,1);
  assert.equal(items[0].canonical,'Chennai');
});
test('long pages split without truncation or broken surrogate pairs', () => {
  const text=('Madras 😀 Bombay. ').repeat(3000);
  const batches=chunks(text);
  assert.ok(batches.length>1);
  assert.equal(batches.map(b=>b.text).join(''),text);
  assert.ok(batches.every(b=>b.text.length<=12000));
  for(const batch of batches) assert.equal(text.slice(batch.start,batch.start+batch.text.length),batch.text);
});
