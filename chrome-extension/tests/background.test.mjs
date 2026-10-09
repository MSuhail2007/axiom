import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('selection handoff stores the latest selection for the popup window', async () => {
  const listeners = {}, saved = {};
  const event = name => ({addListener: handler => {listeners[name] = handler;}});
  const chrome = {
    runtime:{onInstalled:event('installed'),onMessage:event('message')},
    contextMenus:{onClicked:event('context'),removeAll:fn=>fn(),create:()=>{}},
    windows:{onRemoved:event('removed')},
    storage:{session:{set:async data=>Object.assign(saved,data),remove:async key=>{delete saved[key];}}}
  };
  vm.runInNewContext((await readFile(new URL('../background.js',import.meta.url),'utf8')).replace(/^import .*;\s*/,''),{chrome,console});
  listeners.context({menuItemId:'sthalam-selection',selectionText:'Calcutta'},{windowId:10});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved['selection:10'].text,'Calcutta');
  listeners.context({menuItemId:'other',selectionText:'stale'},{windowId:10});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved['selection:10'].text,'Calcutta');
  listeners.removed(10);
  assert.equal(saved['selection:10'],undefined);
});
