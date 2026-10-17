// Adds an "Al radar" button to each post of the LinkedIn feed. It only reads the post's public
// permalink (its activity id); the radar reads the post's public page on its own.
const MARK = 'data-radar-sensor';

function permalinkOf(el) {
  const urn = el.getAttribute('data-urn') || el.getAttribute('data-id') || '';
  const match = urn.match(/urn:li:(activity|ugcPost|share):\d+/);
  return match ? `https://www.linkedin.com/feed/update/${match[0]}/` : null;
}

function decorate(post) {
  if (post.hasAttribute(MARK)) return;
  const url = permalinkOf(post);
  if (!url) return;
  post.setAttribute(MARK, '1');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'radar-sensor-button';
  button.textContent = 'Al radar';
  button.title = 'Mandar este post al Radar 30X';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.disabled = true;
    button.textContent = 'Enviando…';
    chrome.runtime.sendMessage({ type: 'radar:send', url }, (result) => {
      button.textContent = result?.ok ? 'En el radar' : 'No entró';
      button.classList.toggle('is-done', Boolean(result?.ok));
      if (!result?.ok) button.disabled = false;
    });
  });
  if (getComputedStyle(post).position === 'static') post.style.position = 'relative';
  post.appendChild(button);
}

function scan() {
  document
    .querySelectorAll('[data-urn*="urn:li:activity"], [data-id*="urn:li:activity"]')
    .forEach(decorate);
}

scan();
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
