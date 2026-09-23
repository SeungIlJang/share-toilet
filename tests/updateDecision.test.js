import test from 'node:test';
import assert from 'node:assert/strict';
import { decideUpdateAction } from '../src/utils/updateDecision.js';

test('현재 번들이 최신이면 아무 작업도 하지 않는다', () => {
  assert.equal(decideUpdateAction({
    currentVersion: 'web-new',
    queuedVersion: undefined,
    targetVersion: 'web-new',
  }), 'none');
});

test('최신 번들이 적용 대기 중이면 즉시 다시 불러온다', () => {
  assert.equal(decideUpdateAction({
    currentVersion: 'web-old',
    queuedVersion: 'web-new',
    targetVersion: 'web-new',
  }), 'reload');
});

test('최신 번들이 기기에 없으면 내려받는다', () => {
  assert.equal(decideUpdateAction({
    currentVersion: 'web-old',
    queuedVersion: undefined,
    targetVersion: 'web-new',
  }), 'download');
});
