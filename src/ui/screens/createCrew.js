// NAME YOUR CREW (story spec §2): one screen — the crew's name, its colours,
// its mark. You never name the players (dev, 2026-10-20); the block shows up
// already named. `{ edit: true }` reopens it from the crew room: same three
// choices, your roster and your climb untouched.
import crewKit from '../../data/story/crewKit.json';
import { cleanCrewName, makeBlockRoster, NAME_MAX } from '../../meta/yourCrew.js';
import { newStory, loadStory, saveStory } from '../../meta/story.js';
import { markCssUrl } from '../../meta/markTint.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function CreateCrewScreen(ctx) {
  return {
    mount(root, params = {}) {
      const existing = params.edit ? loadStory(ctx.save) : null;
      const pick = {
        name: existing?.crew.name ?? '',
        swatch: crewKit.swatches.find((w) => w.primary === existing?.crew.primary) ?? crewKit.swatches[0],
        mark: existing?.crew.mark ?? crewKit.marks[0],
      };
      const s = el(`
        <div class="screen create-crew">
          <h1 class="screen-title gold">${existing ? 'YOUR CREW' : 'START A CREW'}</h1>
          <p class="cc-sub">${existing ? 'New name, new colors — same block.' : 'Nobody knows you yet. Give them a name to remember.'}</p>
          <div class="cc-badge"><i class="cc-mark"></i><b class="cc-name"></b></div>
          <label class="cc-field">
            <input class="cc-input" type="text" maxlength="${NAME_MAX}" placeholder="CREW NAME"
              autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="done" />
            <small class="cc-err">2–${NAME_MAX} letters</small>
          </label>
          <div class="cc-label">COLORS</div>
          <div class="cc-swatches"></div>
          <div class="cc-label">MARK</div>
          <div class="cc-marks"></div>
          <div class="coin-buttons">
            <button data-act="back">BACK</button>
            <button data-act="go" class="cc-go">${existing ? 'SAVE' : "LET'S GO"}</button>
          </div>
        </div>`);
      root.appendChild(s);
      const input = s.querySelector('.cc-input');
      input.value = pick.name;

      const paint = () => {
        const name = cleanCrewName(input.value);
        s.style.setProperty('--cc1', pick.swatch.primary);
        s.style.setProperty('--cc2', pick.swatch.secondary);
        s.querySelector('.cc-name').textContent = name ?? (input.value.trim().toUpperCase() || 'YOUR CREW');
        s.querySelector('.cc-mark').style.setProperty('--m', markCssUrl(pick.mark));
        s.querySelector('.cc-err').classList.toggle('on', input.value.trim() !== '' && !name);
        s.querySelector('.cc-go').disabled = !name;
        s.querySelectorAll('.cc-sw').forEach((b) => b.classList.toggle('on', b.dataset.id === pick.swatch.id));
        s.querySelectorAll('.cc-mk').forEach((b) => b.classList.toggle('on', b.dataset.id === pick.mark));
      };

      const sw = s.querySelector('.cc-swatches');
      for (const w of crewKit.swatches) {
        const b = el(`<button class="cc-sw" data-id="${w.id}" aria-label="${w.id}"></button>`);
        b.style.background = `linear-gradient(135deg, ${w.primary} 0 60%, ${w.secondary} 60%)`;
        b.addEventListener('pointerdown', () => { pick.swatch = w; ctx.bus.emit('sfx', 'juke'); paint(); });
        sw.appendChild(b);
      }
      const mk = s.querySelector('.cc-marks');
      for (const id of crewKit.marks) {
        const b = el(`<button class="cc-mk" data-id="${id}" aria-label="${id}"><i></i></button>`);
        b.querySelector('i').style.setProperty('--m', markCssUrl(id));
        b.addEventListener('pointerdown', () => { pick.mark = id; ctx.bus.emit('sfx', 'juke'); paint(); });
        mk.appendChild(b);
      }
      input.addEventListener('input', paint);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

      s.querySelector('[data-act="back"]').addEventListener('pointerdown', () => {
        ctx.bus.emit('sfx', 'scratch');
        ctx.router.go(existing ? 'crewRoom' : 'menu');
      });
      s.querySelector('.cc-go').addEventListener('pointerdown', (e) => {
        const name = cleanCrewName(input.value);
        if (!name || e.currentTarget.disabled) return;
        ctx.bus.emit('sfx', 'bassdrop');
        const crew = { name, primary: pick.swatch.primary, secondary: pick.swatch.secondary, mark: pick.mark };
        if (existing) {
          saveStory(ctx.save, { ...existing, crew });
          ctx.router.go('crewRoom');
        } else {
          saveStory(ctx.save, newStory({ crew, roster: makeBlockRoster(Date.now() >>> 0) }));
          ctx.router.go('storyIntro');
        }
      });
      paint();
    },
  };
}
