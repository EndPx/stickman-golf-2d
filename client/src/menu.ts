// Main menu and mode select - user-directed addition outside the original plan.
//
// Two screens: a title screen (logo, Play, corner toggles) in the Super Stickman Golf mould, and a
// mode-select grid (Solo Play, Multiplayer Play) in the Rocket League mould. Multiplayer is declared
// but disabled - the Game_Server is descoped, so the card renders with a COMING SOON ribbon and
// refuses activation rather than pretending.
//
// Keyboard-first by construction (R7.14's spirit): arrows move focus, Enter activates, Escape goes
// back. The frozen Debug_Overlay contract is untouched - this module owns #menu-root, which the
// overlay never writes to, and every element here carries its own data-testid outside the frozen
// set so a future menu flow can read them without touching Requirement 9.
//
// Starting Solo Play navigates to /?arena=1, which is the R1.25 start-arena selector doing exactly
// what it already does - the menu is an entry screen in front of the existing boot path, not a
// second way to start a Match.
//
// Asset files come from the client's public directory when they exist; every image sits on a CSS
// fallback (gradient or styled text) so a missing file degrades the look, never the function.

const SOLO_START_URL = '/?arena=1';

interface MenuHandles {
  /** Removes the menu from the DOM and disconnects its listeners. */
  readonly dispose: () => void;
}

export function createMenu(mount: HTMLElement): MenuHandles {
  mount.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    #menu-root { position: fixed; inset: 0; z-index: 40; font-family: system-ui, sans-serif; }
    .menu-screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    /* The display:flex above beats the hidden attribute's UA stylesheet, so hide explicitly. */
    .menu-screen[hidden] { display: none; }
    .menu-bg {
      background-image: linear-gradient(160deg, rgba(0,0,0,0.05), rgba(0,0,0,0.25)), url('assets/menu-bg.png');
      background-color: #e2611b; background-size: cover; background-position: center;
    }
    .menu-logo { width: min(64vw, 560px); filter: drop-shadow(0 10px 24px rgba(0,0,0,0.35)); }
    .menu-logo-fallback {
      font-size: clamp(40px, 8vw, 84px); font-weight: 900; letter-spacing: 1px; text-align: center;
      color: #fff; text-shadow: 0 4px 0 #1c232e, 0 10px 24px rgba(0,0,0,0.4); margin: 0 0 8px;
    }
    .menu-logo-fallback em { font-style: normal; color: #7ede4e; }
    .menu-button {
      margin-top: 28px; min-width: 220px; padding: 16px 44px; font-size: 28px; font-weight: 800;
      color: #fff; background: #1c2430; border: 4px solid #f4f7fb; border-radius: 16px; cursor: pointer;
      box-shadow: 0 8px 0 #0d1219, 0 14px 28px rgba(0,0,0,0.35);
    }
    .menu-button:hover, .menu-button:focus-visible { outline: none; transform: translateY(-2px); box-shadow: 0 10px 0 #0d1219, 0 18px 32px rgba(0,0,0,0.4); }
    .menu-button:active { transform: translateY(2px); box-shadow: 0 4px 0 #0d1219; }
    .menu-corner { position: absolute; top: 18px; display: flex; flex-direction: column; gap: 12px; }
    .menu-corner.left { left: 18px; } .menu-corner.right { right: 18px; }
    .menu-round {
      width: 52px; height: 52px; border-radius: 50%; border: 3px solid #f4f7fb; background: #1c2430;
      color: #fff; font-size: 22px; cursor: pointer; box-shadow: 0 4px 0 #0d1219;
    }
    .menu-round:focus-visible { outline: none; box-shadow: 0 0 0 4px rgba(255,255,255,0.45); }
    .menu-select { background: radial-gradient(120% 120% at 30% 20%, #2a3240 0%, #141a22 70%); }
    .menu-select-heading { position: absolute; top: 12px; left: 28px; font-size: clamp(48px, 9vw, 110px); font-weight: 900; color: rgba(255,255,255,0.06); letter-spacing: 6px; user-select: none; }
    .menu-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 380px)); gap: 28px; }
    .menu-card {
      position: relative; border: 3px solid rgba(255,255,255,0.55); border-radius: 14px; overflow: hidden;
      cursor: pointer; background: #1c2430; padding: 0; aspect-ratio: 16 / 9;
      box-shadow: 0 10px 26px rgba(0,0,0,0.45); transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .menu-card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .menu-card-fallback-solo { position: absolute; inset: 0; background: linear-gradient(150deg, #59b24a 0%, #2f7a3f 55%, #1c4a28 100%); }
    .menu-card-fallback-multi { position: absolute; inset: 0; background: linear-gradient(150deg, #3f6fb2 0%, #2a4a7a 55%, #1a2f4e 100%); }
    .menu-card-label {
      position: absolute; left: 12px; bottom: 10px; font-size: 22px; font-weight: 800; letter-spacing: 1px;
      color: #fff; text-shadow: 0 2px 6px rgba(0,0,0,0.8);
    }
    .menu-card:hover:not([data-disabled="true"]), .menu-card:focus-visible:not([data-disabled="true"]) {
      outline: none; transform: translateY(-4px) scale(1.02); border-color: #fff;
      box-shadow: 0 0 0 3px rgba(255,255,255,0.35), 0 16px 34px rgba(0,0,0,0.55);
    }
    .menu-card[data-disabled="true"] { filter: saturate(0.35) brightness(0.7); cursor: not-allowed; }
    .menu-ribbon {
      position: absolute; top: 12px; right: -34px; transform: rotate(35deg); background: #e63946; color: #fff;
      font-size: 12px; font-weight: 800; letter-spacing: 1px; padding: 4px 40px;
    }
    .menu-back {
      position: absolute; left: 24px; bottom: 20px; padding: 10px 26px; font-size: 16px; font-weight: 700;
      color: #fff; background: rgba(28,36,48,0.9); border: 2px solid rgba(255,255,255,0.5); border-radius: 10px; cursor: pointer;
    }
    .menu-back:focus-visible { outline: none; border-color: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,0.3); }
  `;
  document.head.appendChild(style);

  // -- title screen ---------------------------------------------------------------------------

  const titleScreen = document.createElement('div');
  titleScreen.className = 'menu-screen menu-bg';

  const logo = document.createElement('img');
  logo.className = 'menu-logo';
  logo.alt = '';
  logo.src = 'assets/menu-logo.png';
  logo.addEventListener('error', () => {
    // Static fallback wordmark built with DOM methods; no HTML string reaches the document here.
    const fallback = document.createElement('h1');
    fallback.className = 'menu-logo-fallback';
    fallback.setAttribute('data-testid', 'menu-logo');
    fallback.append('SUPER', document.createElement('br'), 'STICKMAN ');
    const golf = document.createElement('em');
    golf.textContent = 'GOLF';
    fallback.append(golf);
    logo.replaceWith(fallback);
  });

  const cornerLeft = document.createElement('div');
  cornerLeft.className = 'menu-corner left';
  for (const [testid, glyph, label] of [
    ['menu-sound', '\u{1F50A}', 'Sound'],
    ['menu-music', '♪', 'Music'],
  ] as const) {
    const button = document.createElement('button');
    button.className = 'menu-round';
    button.setAttribute('data-testid', testid);
    button.title = label;
    button.textContent = glyph;
    cornerLeft.appendChild(button);
  }
  const cornerRight = document.createElement('div');
  cornerRight.className = 'menu-corner right';
  const infoButton = document.createElement('button');
  infoButton.className = 'menu-round';
  infoButton.setAttribute('data-testid', 'menu-info');
  infoButton.title = 'About';
  infoButton.textContent = 'ℹ';
  cornerRight.appendChild(infoButton);

  const playButton = document.createElement('button');
  playButton.className = 'menu-button';
  playButton.setAttribute('data-testid', 'menu-play');
  playButton.textContent = 'Play';

  titleScreen.append(cornerLeft, cornerRight, logo, playButton);
  mount.appendChild(titleScreen);

  // -- mode select screen ---------------------------------------------------------------------

  const selectScreen = document.createElement('div');
  selectScreen.className = 'menu-screen menu-select';
  selectScreen.hidden = true;
  selectScreen.innerHTML = `
    <div class="menu-select-heading">PLAY</div>
    <div class="menu-grid">
      <button class="menu-card" data-testid="menu-card-solo">
        <span class="menu-card-fallback-solo"></span>
        <img alt="" src="assets/card-solo.png" />
        <span class="menu-card-label">SOLO PLAY</span>
      </button>
      <button class="menu-card" data-testid="menu-card-multiplayer" data-disabled="true" disabled
              title="Multiplayer needs the Game_Server, which is descoped.">
        <span class="menu-card-fallback-multi"></span>
        <img alt="" src="assets/card-multiplayer.png" />
        <span class="menu-card-label">MULTIPLAYER PLAY</span>
        <span class="menu-ribbon">COMING SOON</span>
      </button>
    </div>
    <button class="menu-back" data-testid="menu-back">BACK</button>
  `;
  mount.appendChild(selectScreen);

  // The card image covers its gradient fallback when the file exists; when it fails to load, the
  // broken image element is removed and the fallback shows through.
  for (const img of [...selectScreen.querySelectorAll('.menu-card img')]) {
    img.addEventListener('error', () => img.remove());
  }

  function showTitle(): void {
    selectScreen.hidden = true;
    titleScreen.hidden = false;
    (titleScreen.querySelector('[data-testid="menu-play"]') as HTMLButtonElement | null)?.focus();
  }

  function showSelect(): void {
    titleScreen.hidden = true;
    selectScreen.hidden = false;
    (selectScreen.querySelector('[data-testid="menu-card-solo"]') as HTMLButtonElement | null)?.focus();
  }

  function startSolo(): void {
    // R1.25 - the start-arena selector is the one way into a Match; the menu just types the URL.
    window.location.href = SOLO_START_URL;
  }

  titleScreen.querySelector('[data-testid="menu-play"]')?.addEventListener('click', showSelect);
  selectScreen.querySelector('[data-testid="menu-card-solo"]')?.addEventListener('click', startSolo);
  selectScreen.querySelector('[data-testid="menu-back"]')?.addEventListener('click', showTitle);

  // Keyboard-first: Escape walks back to the title, arrows move focus across the mode grid, and
  // Enter activates the focused control natively. Everything a pointer can do, the keyboard can do.
  function onKey(event: KeyboardEvent): void {
    if (!event.isTrusted) {
      return;
    }
    if (event.key === 'Escape' && !selectScreen.hidden) {
      event.preventDefault();
      showTitle();
      return;
    }
    const active = document.activeElement;
    if (event.key === 'ArrowRight' && active?.getAttribute('data-testid') === 'menu-card-solo') {
      event.preventDefault();
      (selectScreen.querySelector('[data-testid="menu-card-multiplayer"]') as HTMLButtonElement | null)?.focus();
    }
    if (
      event.key === 'ArrowLeft' &&
      active !== null &&
      selectScreen.contains(active) &&
      active.getAttribute('data-testid') !== 'menu-card-solo'
    ) {
      event.preventDefault();
      (selectScreen.querySelector('[data-testid="menu-card-solo"]') as HTMLButtonElement | null)?.focus();
    }
  }
  document.addEventListener('keydown', onKey);

  (titleScreen.querySelector('[data-testid="menu-play"]') as HTMLButtonElement | null)?.focus();

  return {
    dispose(): void {
      document.removeEventListener('keydown', onKey);
      style.remove();
      mount.innerHTML = '';
    },
  };
}
