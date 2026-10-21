import { describe, it, expect } from 'vitest';
import tuning from '../src/data/tuning.json';
import { payout, trainCost, train } from '../src/meta/storyEconomy.js';
import { offerDoubleCoins, buyCoins } from '../src/meta/storyHooks.js';
import { SaveManager } from '../src/meta/save.js';

const stop = (kind) => ({ kind });
const story = () => ({
  roster: [{ id: 'b1', stats: { power: 4, speed: 5, arm: 3, glove: 6 } }, { id: 'b2', stats: { power: 10, speed: 2, arm: 2, glove: 2 } }],
});
const wallet = (n) => { const s = new SaveManager({ backend: 'memory' }); s.set('crowns', n); return s; };

describe('story economy', () => {
  it('pays by the table', () => {
    expect(payout(stop('ladder'), true, ['win'], tuning)).toBe(60);
    expect(payout(stop('ladder'), false, ['loss'], tuning)).toBe(15);
    expect(payout(stop('semi'), true, ['win'], tuning)).toBe(90);
    expect(payout(stop('final'), true, ['win', 'regionChamp'], tuning)).toBe(150 + 250);
    expect(payout(stop('nationals'), true, ['win'], tuning)).toBe(200);
    expect(payout(stop('final'), false, ['loss'], tuning)).toBe(15);
  });

  it('training gets dearer as the stat climbs and stops at 10', () => {
    expect(trainCost(4, tuning)).toBe(140);
    expect(trainCost(0, tuning)).toBe(40);
    expect(trainCost(10, tuning)).toBe(Infinity);
  });

  it('broke: no spend, no change', () => {
    const save = wallet(139);
    const s = story();
    const r = train(s, save, 'b1', 'power', tuning);
    expect(r).toMatchObject({ ok: false, reason: 'broke' });
    expect(save.get('crowns')).toBe(139);
    expect(r.story).toBe(s);
  });

  it('pays and raises exactly one stat on one player, input untouched', () => {
    const save = wallet(140);
    const s = story();
    const r = train(s, save, 'b1', 'power', tuning);
    expect(r).toMatchObject({ ok: true, cost: 140 });
    expect(r.story.roster[0].stats).toEqual({ power: 5, speed: 5, arm: 3, glove: 6 });
    expect(r.story.roster[1]).toBe(s.roster[1]);
    expect(s.roster[0].stats.power).toBe(4);
    expect(save.get('crowns')).toBe(0);
  });

  it('maxed and unknown players are refused', () => {
    const save = wallet(9999);
    expect(train(story(), save, 'b2', 'power', tuning)).toMatchObject({ ok: false, reason: 'maxed' });
    expect(train(story(), save, 'nobody', 'power', tuning)).toMatchObject({ ok: false, reason: 'noPlayer' });
    expect(save.get('crowns')).toBe(9999);
  });

  it('ad / purchase hooks are stubs until the app-store shell', async () => {
    expect(await offerDoubleCoins()).toBe(false);
    expect(await buyCoins('small')).toBe(false);
  });
});
