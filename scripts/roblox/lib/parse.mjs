// OBJ / MTL parsing. Deliberately tolerant: Roblox's exporter is simple, but a refreshed outfit may differ
// (quads, v/vt/vn with distinct indices, negative indices, option-prefixed map_ lines).

/** @returns {Map<string, object>} material name -> params */
export function parseMtl(text) {
  const mats = new Map(); let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const sp = line.split(/\s+/); const k = sp[0];
    if (k === 'newmtl') { cur = { name: sp.slice(1).join(' '), kd: [1, 1, 1], alphaMode: null }; mats.set(cur.name, cur); continue; }
    if (!cur) continue;
    // map_ lines can carry options ("-s 1 1 1 file"); the file is always the last token.
    const mapKey = { map_Kd: 'mapKd', map_d: 'mapD', map_Bump: 'mapBump', map_bump: 'mapBump', bump: 'mapBump', map_Ns: 'mapNs', map_Ke: 'mapKe' }[k];
    if (mapKey) cur[mapKey] = sp[sp.length - 1];
    else if (k === 'Kd') cur.kd = [+sp[1], +sp[2], +sp[3]];
    else if (k === 'rbx_alphamode') cur.alphaMode = sp[1];
  }
  return mats;
}

/**
 * Raw OBJ: flat position/uv/normal arrays plus groups whose faces are lists of [v, vt, vn] 0-based indices
 * (-1 = absent). Groups without faces are dropped. A `usemtl` change inside a group starts a new group record.
 */
export function parseObj(text) {
  const v = [], vt = [], vn = [], groups = [];
  let cur = null, curMtl = null;
  const open = (name) => { cur = { name, mtl: curMtl, faces: [] }; groups.push(cur); };
  const resolve = (s, len) => { if (s === undefined || s === '') return -1; const i = parseInt(s, 10); return i < 0 ? len + i : i - 1; };
  for (const raw of text.split('\n')) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const sp = line.split(/\s+/); const k = sp[0];
    if (k === 'v') v.push(+sp[1], +sp[2], +sp[3]); // optional RGBA vertex colour components are ignored
    else if (k === 'vt') vt.push(+sp[1], +sp[2] || 0);
    else if (k === 'vn') vn.push(+sp[1], +sp[2], +sp[3]);
    else if (k === 'g' || k === 'o') open(sp.slice(1).join(' ') || 'default');
    else if (k === 'usemtl') {
      curMtl = sp[1];
      if (!cur) open('default');
      else if (!cur.faces.length) cur.mtl = curMtl;
      else if (cur.mtl !== curMtl) open(cur.name);
    } else if (k === 'f') {
      if (!cur) open('default');
      const nv = v.length / 3, nt = vt.length / 2, nn = vn.length / 3;
      cur.faces.push(sp.slice(1).map((tok) => { const p = tok.split('/'); return [resolve(p[0], nv), resolve(p[1], nt), resolve(p[2], nn)]; }));
    }
  }
  return { v, vt, vn, groups: groups.filter((g) => g.faces.length) };
}
