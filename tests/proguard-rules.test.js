import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('R8 최적화 후에도 Capacitor 권한 어노테이션을 보존한다', async () => {
  const rules = await readFile('android/app/proguard-rules.pro', 'utf8');
  assert.match(rules, /-keepattributes[^\n]*RuntimeVisibleAnnotations/);
  assert.match(rules, /-keep @interface com\.getcapacitor\.annotation\.\*\*/);
  assert.match(rules, /@com\.getcapacitor\.PluginMethod/);
});
