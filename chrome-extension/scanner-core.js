// Pure helpers shared by the isolated content script and regression tests.
(() => {
  function chunks(text, maximum = 12000) {
    const result = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maximum, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(' ', end);
        if (boundary > start + maximum / 2) end = boundary + 1;
        else if (/[\uD800-\uDBFF]/.test(text[end - 1])) --end;
      }
      result.push({text: text.slice(start, end), start});
      start = end;
    }
    return result;
  }
  function annotations(text, results) {
    const offsets = [0];
    for (const point of text) offsets.push(offsets.at(-1) + point.length);
    const output = [];
    let previousEnd = 0;
    for (const item of [...results].sort((a,b) => a.start - b.start)) {
      if (!Number.isInteger(item.start) || !Number.isInteger(item.end) ||
          item.start < 0 || item.end <= item.start || item.end > offsets.length - 1) continue;
      const start = offsets[item.start], end = offsets[item.end];
      if (start < previousEnd || text.slice(start,end) !== item.mention || item.status === 'out_of_scope') continue;
      const place = item.selected || item.candidates?.[0];
      if (!place?.name) continue;
      const review = !!item.needs_review || !item.selected || item.score < 80;
      // Unchanged names are only marked when they need review.
      if (!review && place.name.toLocaleLowerCase() === item.mention.toLocaleLowerCase()) continue;
      output.push({start, end, original:item.mention, canonical:place.name, review,
        score:item.score, place, candidates:item.candidates || [], method:item.method});
      previousEnd = end;
    }
    return output;
  }
  function locate(parts, start, end) {
    const first = parts.find(p => start >= p.start && start < p.end);
    const last = parts.find(p => end > p.start && end <= p.end);
    if (!first || !last) return null;
    return {first, last, start:start-first.start, end:end-last.start};
  }
  globalThis.STHALAMScan = {chunks, annotations, locate};
})();
