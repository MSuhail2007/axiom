(() => {
  if (document.getElementById('sthalam-page-annotations')) return;
  const core = globalThis.STHALAMScan;
  const host = document.createElement('div');
  host.id = 'sthalam-page-annotations';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483647!important;';
  const shadow = host.attachShadow({mode:'closed'});
  const style = document.createElement('style');
  style.textContent = `
    :host{font-family:system-ui,sans-serif;color-scheme:light}
    .layer{position:fixed;inset:0;pointer-events:none}
    .label{all:initial;box-sizing:border-box;position:fixed;pointer-events:auto;font:600 11px/1.2 system-ui,sans-serif;
      padding:2px 5px;border:1px solid #7d66da;border-radius:4px;background:#f0ebff;color:#382084;
      box-shadow:0 1px 3px #0002;max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help}
    .review{background:#fff5d6;border-color:#bc890e;color:#704b00}
    .line{position:fixed;border-bottom:2px dotted #8063db;pointer-events:none;box-sizing:border-box}
    .bar{position:fixed;right:16px;bottom:16px;pointer-events:auto;max-width:min(420px,90vw);padding:9px 12px;
      border:1px solid #d5ccee;border-radius:12px;background:#fff;color:#302842;box-shadow:0 3px 16px #0002;font:12px/1.5 system-ui,sans-serif}
    button{font:600 12px system-ui,sans-serif;cursor:pointer;border:0;background:#eee8fc;color:#4d319b;border-radius:6px;padding:6px 8px;margin-left:7px}
    button:focus-visible{outline:2px solid #6b40c2;outline-offset:2px}
    .detail{position:fixed;right:16px;bottom:76px;pointer-events:auto;width:min(360px,90vw);max-height:55vh;overflow:auto;
      border:1px solid #d5ccee;background:white;color:#302842;border-radius:12px;padding:14px;font:12px/1.6 system-ui,sans-serif;box-shadow:0 4px 22px #0003}
    h3{font-size:16px;margin:6px 0}p{margin:8px 0}.muted{color:#716780}
  `;
  const layer = document.createElement('div'); layer.className = 'layer';
  const bar = document.createElement('div'); bar.className = 'bar';
  const status = document.createElement('span'); status.setAttribute('role','status');
  const pause = document.createElement('button'); pause.textContent = 'Pause';
  const retry = document.createElement('button'); retry.textContent = 'Rescan';
  bar.append(status,pause,retry); shadow.append(style,layer,bar); document.documentElement.append(host);
  const ignored = 'script,style,noscript,textarea,input,select,button,form,[contenteditable]:not([contenteditable="false"]),[role="textbox"],pre,code,svg,canvas,iframe,[hidden],[aria-hidden="true"],ruby';
  const blockSelector = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,figcaption,div,section,article,main,body';
  const pdfPage = document.contentType === 'application/pdf' || /\.pdf(?:[?#]|$)/i.test(location.href);
  let enabled = true, pdfEnabled = true, paused = false, generation = 0, timer, frame, scanning = false;
  let records = [], detail;
  const cache = new Map();
  const pending = new Set();
  function eligible(node) {
    const element = node.parentElement;
    if (!element || !node.data || element.closest(ignored) || host.contains(element)) return false;
    const range = document.createRange(); range.selectNodeContents(node);
    if (!range.getClientRects().length) return false;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor);
      if (css.display === 'none' || css.visibility !== 'visible' || css.opacity === '0') return false;
    }
    return true;
  }
  function collect() {
    const blocks = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node, group, lastBlock;
    while ((node = walker.nextNode())) {
      if (!eligible(node)) {group = null; lastBlock = null; continue;}
      const block = node.parentElement.closest(blockSelector) || document.body;
      if (!group || block !== lastBlock) {group = {text:'',parts:[]}; blocks.push(group);lastBlock=block;}
      const start = group.text.length;
      group.text += node.data;
      group.parts.push({node, text:node.data, start, end:group.text.length});
    }
    // Pack paragraphs to retain context while avoiding one HTTP call per text node.
    const batches = [];
    let batch = {text:'',parts:[]};
    for (const block of blocks.filter(b=>b.text.trim())) for (const chunk of core.chunks(block.text)) {
      if (batch.text.length && batch.text.length + chunk.text.length + 2 > 12000) {batches.push(batch); batch={text:'',parts:[]};}
      if (batch.text) batch.text += '\n\n';
      const base = batch.text.length;
      batch.text += chunk.text;
      for (const part of block.parts) {
        const start = Math.max(part.start,chunk.start), end = Math.min(part.end,chunk.start+chunk.text.length);
        if (start < end) batch.parts.push({...part, nodeOffset:start-part.start, start:base+start-chunk.start, end:base+end-chunk.start});
      }
    }
    if (batch.text.trim()) batches.push(batch);
    return batches;
  }
  function valid(record) {
    return record.parts.every(p => p.node.isConnected && p.node.data === p.text);
  }
  function showDetail(item) {
    detail?.remove(); detail=document.createElement('section');detail.className='detail';
    detail.setAttribute('role','region');detail.setAttribute('aria-label','Place details');
    const close=document.createElement('button');close.textContent='Close';close.onclick=()=>{detail.remove();detail=null;};
    const title=document.createElement('h3');title.textContent=`${item.original} → ${item.canonical}`;
    const info=document.createElement('p');info.textContent=`${item.review?'Suggestion — needs review':'Resolved'} · ${item.score ?? 'N/A'}% name similarity. ${item.place.state || ''} · ${item.place.kind || ''} · ${item.place.source || ''}`;
    detail.append(close,title,info);
    const note=document.createElement('p');note.className='muted';note.textContent='Original webpage text is unchanged. Similarity is not a probability.';detail.append(note);
    for (const candidate of [...new Map(item.candidates.map(p=>[p.id,p])).values()].slice(0,5)) {
      const p=document.createElement('p');p.textContent=`${candidate.name} · ${candidate.state || candidate.kind} · ${candidate.score}%`;detail.append(p);
    }
    shadow.append(detail);
  }
  function draw() {
    frame = null; layer.replaceChildren();
    if (!enabled || paused || document.hidden) return;
    const occupied=[];
    for (const record of records) {
      if (!valid(record)) continue;
      const rects = [...record.range.getClientRects()].filter(r=>r.width && r.height && r.bottom>0 && r.top<innerHeight && r.right>0 && r.left<innerWidth);
      if (!rects.length) continue;
      for (const rect of rects) {
        const line=document.createElement('div');line.className='line';
        Object.assign(line.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});layer.append(line);
      }
      const anchor=rects[0];
      const label=document.createElement('button');label.className=`label ${record.item.review?'review':''}`;
      label.textContent=`${record.item.review?'? ':''}${record.item.canonical}`;
      label.title=`${record.item.original} → ${record.item.canonical} · ${record.item.score ?? 'N/A'}% similarity${record.item.review?' · Needs review':''}. Click for details.`;
      label.setAttribute('aria-label',label.title);label.onclick=()=>showDetail(record.item);
      layer.append(label);
      let left=Math.max(2, Math.min(anchor.left,innerWidth-label.offsetWidth-2));
      let top=Math.max(0,anchor.top-label.offsetHeight-2);
      for (let attempt=0;attempt<6 && occupied.some(r=>left<r.right && left+label.offsetWidth>r.left && top<r.bottom && top+label.offsetHeight>r.top);attempt++) top=Math.max(0,top-label.offsetHeight-2);
      Object.assign(label.style,{left:`${left}px`,top:`${top}px`});
      occupied.push({left,right:left+label.offsetWidth,top,bottom:top+label.offsetHeight});
    }
  }
  function requestDraw() {if (!frame) frame=requestAnimationFrame(draw);}
  function request(text) {
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{pending.delete(cancel);reject(new Error('Local scan timed out. Start the app, then Retry.'));},30000);
      function cancel(){clearTimeout(timeout);reject(new Error('Scan cancelled'));}
      pending.add(cancel);
      chrome.runtime.sendMessage({type:'STHALAM_SCAN',text}, response=>{
        clearTimeout(timeout);pending.delete(cancel);
        const error=chrome.runtime.lastError;
        if(error) reject(new Error(/context invalidated/i.test(error.message || '')
          ? 'STHALAM was updated. Refresh this webpage to reconnect the scanner.'
          : 'Extension connection lost. Reload this webpage.'));
        else if(response?.error) reject(new Error(response.error));
        else if(!Array.isArray(response?.results)) reject(new Error('Unexpected local response. Retry.'));
        else resolve(response.results);
      });
    });
  }
  async function scan() {
    if (scanning || !enabled || paused || document.hidden || (pdfPage && !pdfEnabled)) return;
    scanning=true;const version=generation;records=[];detail?.remove();detail=null;requestDraw();
    try {
      const batches=collect();
      for (let index=0;index<batches.length;index++) {
        if(version!==generation || !enabled || paused || document.hidden) return;
        status.textContent=`STHALAM · Scanning ${index+1}/${batches.length}`;
        const batch=batches[index];
        let results=cache.get(batch.text);
        if (!results) {results=await request(batch.text);cache.set(batch.text,results);if(cache.size>80)cache.delete(cache.keys().next().value);}
        if(version!==generation || !enabled || paused) return;
        for (const item of core.annotations(batch.text,results)) {
          const location=core.locate(batch.parts,item.start,item.end);if(!location)continue;
          const parts=batch.parts.filter(p=>p.start<item.end && p.end>item.start);
          if(!parts.every(p=>p.node.isConnected && p.node.data===p.text))continue;
          const range=document.createRange();
          range.setStart(location.first.node,location.start+location.first.nodeOffset);
          range.setEnd(location.last.node,location.end+location.last.nodeOffset);
          records.push({range,parts,item});
        }
        requestDraw();
      }
      status.textContent=`STHALAM · ${records.length} annotations · Local`;
    } catch(error) {if(version===generation)status.textContent=`STHALAM · ${error.message}`;}
    finally {scanning=false;if(version!==generation && enabled && !paused)schedule();}
  }
  function schedule() {clearTimeout(timer);timer=setTimeout(scan,900);}
  function invalidate() {++generation;requestDraw();schedule();}
  pause.onclick=()=>{
    paused=!paused;++generation;pause.textContent=paused?'Resume':'Pause';
    detail?.remove();detail=null;requestDraw();
    status.textContent=paused?'STHALAM · Paused on this page':'STHALAM · Preparing…';
    if(!paused)schedule();
  };
  retry.onclick=()=>{cache.clear();paused=false;pause.textContent='Pause';invalidate();};
  addEventListener('scroll',requestDraw,true);addEventListener('resize',requestDraw);
  document.addEventListener('visibilitychange',()=>{requestDraw();if(!document.hidden)schedule();});
  const observer=new MutationObserver(mutations=>{
    if(mutations.some(m=>m.target!==host && !host.contains(m.target))) invalidate();
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-hidden','class','style']});
  new ResizeObserver(requestDraw).observe(document.body);
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local' && changes.autoScan){enabled=changes.autoScan.newValue!==false;host.style.setProperty('display',enabled?'block':'none','important');invalidate();}
    if(area==='local' && changes.pdfScan){pdfEnabled=changes.pdfScan.newValue!==false;invalidate();}
  });
  chrome.storage.local.get({autoScan:true,pdfScan:true}, options=>{
    enabled=options.autoScan!==false;pdfEnabled=options.pdfScan!==false;host.style.setProperty('display',enabled?'block':'none','important');status.textContent=pdfPage?'STHALAM · PDF text layer':'STHALAM · Preparing…';schedule();
  });
  chrome.runtime.onMessage.addListener((message, sender, reply)=>{
    if (message?.type === 'STHALAM_FOCUS') {paused=false;pause.textContent='Pause';invalidate();}
    if (message?.type === 'STHALAM_GET_STATE') {reply({paused, enabled, annotations:records.length});}
    if (message?.type === 'STHALAM_PDF_TOGGLE') {pdfEnabled=message.enabled !== false; ++generation; requestDraw(); if(pdfEnabled) schedule(); reply({enabled:pdfEnabled});}
    if (message?.type === 'STHALAM_TOGGLE_PAGE') {
      paused = message.paused === true; ++generation; pause.textContent=paused?'Resume':'Pause';
      requestDraw(); if (!paused) schedule();
      status.textContent=paused?'STHALAM · Paused on this page':'STHALAM · Preparing…';
      reply({paused, enabled, annotations:records.length});
    }
  });
  addEventListener('pagehide',()=>{++generation;for(const cancel of pending)cancel();pending.clear();});
})();
