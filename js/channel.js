// Where the visitor came from decides which ordering buttons they see.
// It's one app with one set of code; the address picks the mode:
//
//   etsy     ?for=etsy (or the short link /etsy/, which forwards here).
//            Shows "Copy design code" and a note to paste it into Etsy's
//            personalization box; hides Send to Print. Remembered in this
//            browser (localStorage), so a reload or a later visit to the
//            plain address still shows the Etsy version. ?for=web turns it
//            off again.
//   store    Running inside Cobb3D's own store page (an <iframe>), or
//            ?for=store. Shows "Add design to cart", which hands the design
//            to the store page (see STORE_ORIGINS and addToCart below);
//            hides Send to Print. Not remembered: it depends on the page.
//   default  Everywhere else: Send to Print, like before, and Copy design
//            code too.
//
// Every mode can open a design from a code (the design code dialog).

const CHANNEL_KEY = 'keycapforge.channel';

// The store page(s) allowed to receive "Add design to cart" messages. Add
// the store's address here (scheme + host, no path), e.g.
// 'https://cobb3dprinting.com'. While it's empty, Add design to cart still
// shows inside an iframe but says the store isn't connected yet.
export const STORE_ORIGINS = [];

function readChannel() {
  const q = new URLSearchParams(location.search).get('for');
  let embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  try {
    if (q === 'etsy') localStorage.setItem(CHANNEL_KEY, 'etsy');
    else if (q === 'web' || q === 'default') localStorage.removeItem(CHANNEL_KEY);
  } catch (e) { /* not remembered; the address still decides this visit */ }
  if (q === 'store' || (embedded && q !== 'etsy' && q !== 'web')) return 'store';
  if (q === 'etsy') return 'etsy';
  if (q === 'web' || q === 'default') return 'default';
  let saved = null;
  try { saved = localStorage.getItem(CHANNEL_KEY); } catch (e) { saved = null; }
  return saved === 'etsy' ? 'etsy' : 'default';
}

export const CHANNEL = readChannel();

// The parent store page's origin, when it's one of STORE_ORIGINS.
export function storeOrigin() {
  let ref = '';
  try { ref = document.referrer ? new URL(document.referrer).origin : ''; } catch (e) { ref = ''; }
  const fromAncestors = (location.ancestorOrigins && location.ancestorOrigins[0]) || '';
  const candidate = fromAncestors || ref;
  return STORE_ORIGINS.includes(candidate) ? candidate : null;
}

// Marks the page with its mode (body.channel-etsy / -store / -default) and
// shows or hides the mode-specific bits that don't need app state.
export function initChannel() {
  document.body.classList.add(`channel-${CHANNEL}`);
  const etsyNote = document.getElementById('etsyNote');
  if (etsyNote) etsyNote.hidden = CHANNEL !== 'etsy';
  const cart = document.getElementById('addToCartBtn');
  if (cart) cart.hidden = CHANNEL !== 'store';
  const codeBtn = document.getElementById('designCodeBtn');
  // On Etsy the code is how they order, so it's the main button.
  if (codeBtn && CHANNEL === 'etsy') { codeBtn.classList.remove('ghost'); codeBtn.classList.add('primary'); }
}

// Send to Print only in the default mode.
export const SEND_TO_PRINT_ALLOWED = CHANNEL === 'default';
