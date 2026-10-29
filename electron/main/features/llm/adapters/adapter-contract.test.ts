import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../llm-adapter';

describe('[TH02-03] LLM adapter contract', () => {
  it.each(Object.values(ADAPTERS))('$id builds a command and parses its structured result', (adapter) => {
    const command = adapter.runCommand({ model: 'model-x', prompt: 'task', schema: { type: 'object' }, schemaFile: 'schema.json', timeoutMs: 1000 });
    expect(command.args.join(' ')).toContain('model-x');
    const output = adapter.id === 'claude'
      ? JSON.stringify({ subtype: 'success', structured_output: { ok: true } })
      : adapter.id === 'codex'
        ? JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } })
        : JSON.stringify({ status: 'SUCCESS', structured_output: { ok: true } });
    expect(adapter.parseOutput(output).value).toEqual({ ok: true });
  });
});
