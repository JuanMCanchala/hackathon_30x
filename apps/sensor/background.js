// Radar 30X sensor: sends a public post's URL to the radar, which reads its public page.
const DEFAULTS = { base: 'http://localhost:3300', name: 'Equipo 30X' };

async function settings() {
  return { ...DEFAULTS, ...(await chrome.storage.sync.get(['base', 'name'])) };
}

async function send(url) {
  const { base, name } = await settings();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/sensor`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, submittedBy: name }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message ?? `El radar respondió ${res.status}.`);
    const topics = (body.topics ?? []).map((t) => t.name).join(', ');
    notify('Entró al radar', topics ? `Sumó a: ${topics}` : (body.title ?? url));
    return { ok: true, topics };
  } catch (error) {
    notify('No entró al radar', String(error.message ?? error));
    return { ok: false, error: String(error.message ?? error) };
  }
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title,
    message: message.slice(0, 180),
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'radar-link',
    title: 'Mandar este enlace al Radar 30X',
    contexts: ['link'],
  });
  chrome.contextMenus.create({
    id: 'radar-page',
    title: 'Mandar esta página al Radar 30X',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void send(info.menuItemId === 'radar-link' ? info.linkUrl : tab?.url);
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.url) void send(tab.url);
});

// The LinkedIn button in each post asks the worker to send its permalink.
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === 'radar:send' && typeof message.url === 'string') {
    void send(message.url).then(reply);
    return true;
  }
  return false;
});
