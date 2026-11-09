// Firestore giả dùng chung cho các test: đủ cho collection/doc/where/limit/batch và transaction.
// Transaction được TUẦN TỰ HÓA và ghi đệm (chỉ áp khi hàm chạy xong không lỗi) — đúng ngữ nghĩa Firestore:
// hai giao dịch tranh chấp cùng document sẽ lần lượt thấy dữ liệu của nhau; lỗi giữa chừng thì bỏ hết thay đổi.
const path = require('path');

function createFakeDb() {
  const store = {};
  let auto = 0;
  const copy = (o) => (o ? { ...o } : o);

  const makeSnap = (c, id) => {
    const d = (store[c] || {})[id];
    return { exists: !!d, id, ref: docRef(c, id), data: () => copy(d) };
  };
  const apply = (op) => {
    const { kind, c, id, data } = op;
    if (kind === 'set') (store[c] ||= {})[id] = copy(data);
    else if (kind === 'update') {
      if (!(store[c] || {})[id]) throw new Error(`NOT_FOUND: ${c}/${id}`);
      store[c][id] = { ...store[c][id], ...data };
    } else if (kind === 'delete') { if (store[c]) delete store[c][id]; }
  };
  const docRef = (c, id) => ({
    id, path: `${c}/${id}`, _c: c,
    async get() { return makeSnap(c, id); },
    async set(v) { apply({ kind: 'set', c, id, data: v }); },
    async update(p) { apply({ kind: 'update', c, id, data: p }); },
    async delete() { apply({ kind: 'delete', c, id }); },
  });
  const query = (c, filters = [], lim = Infinity) => ({
    where(field, op, val) { return query(c, [...filters, { field, op, val }], lim); },
    limit(n) { return query(c, filters, n); },
    async get() {
      let docs = Object.keys(store[c] || {}).map((id) => makeSnap(c, id));
      for (const f of filters) {
        docs = docs.filter((d) => {
          const v = f.field === '__name__' ? d.id : (d.data() || {})[f.field];
          if (f.op === '==') return v === f.val;
          if (f.op === '!=') return v !== f.val;
          if (f.op === 'in') return f.val.includes(v);
          throw new Error('op chưa hỗ trợ: ' + f.op);
        });
      }
      docs = docs.slice(0, lim);
      return { empty: docs.length === 0, size: docs.length, docs, forEach: (fn) => docs.forEach(fn) };
    },
  });

  let tail = Promise.resolve();
  const db = {
    _store: store,
    collection: (c) => ({ doc: (id) => docRef(c, id || `AUTO${++auto}`), ...query(c) }),
    batch() {
      const ops = [];
      return {
        set: (ref, data) => ops.push({ kind: 'set', c: ref._c, id: ref.id, data }),
        update: (ref, data) => ops.push({ kind: 'update', c: ref._c, id: ref.id, data }),
        delete: (ref) => ops.push({ kind: 'delete', c: ref._c, id: ref.id }),
        async commit() { ops.forEach(apply); },
      };
    },
    runTransaction(fn) {
      const run = async () => {
        const ops = [];
        const tx = {
          get: async (ref) => ref.get(),
          set: (ref, data) => ops.push({ kind: 'set', c: ref._c, id: ref.id, data }),
          update: (ref, data) => ops.push({ kind: 'update', c: ref._c, id: ref.id, data }),
          delete: (ref) => ops.push({ kind: 'delete', c: ref._c, id: ref.id }),
        };
        const result = await fn(tx);
        ops.forEach(apply);
        return result;
      };
      const p = tail.then(run, run);
      tail = p.catch(() => {});
      return p;
    },
  };
  return db;
}

// Thay module bằng bản giả trong require.cache (đường dẫn tính từ thư mục backend)
function stub(rel, exportsObj) {
  const root = path.resolve(__dirname, '..');
  const f = require.resolve(path.join(root, rel));
  require.cache[f] = { id: f, filename: f, loaded: true, exports: exportsObj, children: [], paths: [] };
}

function createChecker() {
  let bad = 0;
  const check = (name, ok, extra = '') => { if (!ok) bad++; console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : String(extra).slice(0, 300)); };
  const rejects = async (p) => { try { await p; return null; } catch (e) { return e.message || String(e); } };
  return { check, rejects, failed: () => bad };
}

module.exports = { createFakeDb, stub, createChecker };
