const fields = ['base', 'name'];
chrome.storage.sync.get(fields, (stored) => {
  for (const f of fields) document.getElementById(f).value = stored[f] ?? '';
});
document.getElementById('save').addEventListener('click', () => {
  const values = Object.fromEntries(
    fields.map((f) => [f, document.getElementById(f).value.trim()]),
  );
  chrome.storage.sync.set(values, () => {
    document.getElementById('saved').hidden = false;
  });
});
