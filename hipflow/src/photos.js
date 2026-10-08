// Progress photos live only on this device, in IndexedDB.
const DB = "hipflow-photos", STORE = "photos";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const listPhotos = () => tx("readonly", (s) => s.getAll()).then((all) => (all || []).sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at));
export const deletePhoto = (id) => tx("readwrite", (s) => s.delete(id));

// Shrink to ≤1280px JPEG before storing.
export async function addPhoto(file, pose, date) {
  const bmp = await createImageBitmap(file).catch(() => null);
  let blob = file;
  if (bmp) {
    const k = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
  }
  const rec = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, pose, date, at: Date.now(), blob };
  await tx("readwrite", (s) => s.put(rec));
  return rec;
}
