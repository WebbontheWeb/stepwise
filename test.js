const S = require('./src/core.js');
const files = require('./src/sample.js');
const assert = require('assert');
const p = S.createProject();
for (const [path, text] of Object.entries(files)) {
  const id = path.split('/').pop().replace(/\.md$/, '');
  if (path.startsWith('cases/')) p.cases[id] = S.parseCase(id, text);
  if (path.startsWith('blocks/')) p.blocks[id] = S.parseBlock(id, text);
}
S.resolveReferences(p);
const bt = S.blockTitleFn(p);

// round trip is byte-identical for every sample file
for (const [path, text] of Object.entries(files)) {
  const id = path.split('/').pop().replace(/\.md$/, '');
  if (path.startsWith('cases/')) assert.strictEqual(S.writeCase(p.cases[id], bt), text, 'roundtrip ' + path);
  if (path.startsWith('blocks/')) assert.strictEqual(S.writeBlock(p.blocks[id]), text, 'roundtrip ' + path);
}
console.log('round trip ok');

const c = p.cases['expense-over-limit-approval'];
const textRows = S.flatten(p, c, { blocks: 'inline', repeats: 'text' });
console.log(textRows.map((r, i) => `${i + 1}. ${r.action}  =>  ${r.expected}`).join('\n'));
assert.strictEqual(textRows.length, 9);
assert.strictEqual(textRows[8].action, 'Repeat steps 3–6 as the manager');
const inl = S.flatten(p, c, { blocks: 'inline', repeats: 'inline' });
assert.strictEqual(inl.length, 12);
const named = S.flatten(p, c, { blocks: 'name', repeats: 'text' });
assert.strictEqual(named[5].action, 'Repeat steps 2–3 as the manager');

// renumbering: insert a step at the top, repeat label follows
c.steps.unshift(S.newStep('action', new Set(), { action: 'Clear browser cache', expected: 'Cache cleared' }));
assert.match(S.writeCase(c, bt), /\[Repeat steps 3–4\] as the manager `#t7w2 repeat:p2x1\.\.m8q4`/);
c.steps.shift();

// hand-written steps (Claude style, no ids)
const hand = S.parseCase('x', `---\ntitle: Hand\n---\n\n## Steps\n\n1. Open app\n   Expected: Loads\n2. Use block: Create a basic expense report\n3. Click save\n   and wait\n   Expected: Saved\n   with toast\n4. Repeat steps 2-3 as admin\n5. Step five \`#k3f9\`\n6. dup id \`#k3f9\`\n`);
p.cases.x = hand; S.resolveReferences(p);
assert.strictEqual(hand.steps[1].type, 'use'); assert.strictEqual(hand.steps[1].block, 'create-basic-expense-report');
assert.strictEqual(hand.steps[2].action, 'Click save\nand wait'); assert.strictEqual(hand.steps[2].expected, 'Saved\nwith toast');
assert.strictEqual(hand.steps[3].from, hand.steps[1].id); assert.strictEqual(hand.steps[3].to, hand.steps[2].id); assert.strictEqual(hand.steps[3].note, 'as admin');
assert.notStrictEqual(hand.steps[4].id, hand.steps[5].id);
const again = S.parseCase('x', S.writeCase(hand, bt));
assert.deepStrictEqual(again.steps, hand.steps);
console.log('hand-written ok');
delete p.cases.x;

// checks
console.log(S.lintCase(p, p.cases['expense-pdf-export']));
const broken = JSON.parse(JSON.stringify(c)); broken.steps.splice(1, 1);
console.log(S.lintCase(p, broken).filter(i => i.level === 'error'));

// exports
console.log('--- TSV ---\n' + S.toGridTSV(c, textRows.slice(0, 3), {}));
const csv = S.toCSV(p, [p.cases['expense-pdf-export']], {});
console.log('--- CSV ---\n' + csv);
console.log(S.relatedOf(p, c), Object.keys(S.coverage(p)));

// formula-looking cells are neutralized in CSV, left alone in grid paste
const evil = S.parseCase('evil', `---\ntitle: =HYPERLINK("http://x")\n---\n\n## Steps\n\n1. -2+3 opens calc\n   Expected: @SUM(A1)\n`);
const evilCsv = S.toCSV(p, [evil], {});
assert.match(evilCsv, /,"'=HYPERLINK\(""http:\/\/x""\)",/);
assert.match(evilCsv, /,1,'-2\+3 opens calc,'@SUM\(A1\),/);
assert.match(S.toGridTSV(evil, S.flatten(p, evil), {}), /^=HYPERLINK/);
console.log('formula cells ok');

// a block used twice: written out every time, or once and then "Repeat steps"
const twice = S.parseCase('twice', `---\ntitle: Twice\n---\n\n## Steps\n\n1. Use block: Log in as an employee\n2. Sign out \`#so01\`\n   Expected: Signed out\n3. Use block: Log in as an employee\n`);
p.cases.twice = twice; S.resolveReferences(p);
assert.strictEqual(S.flatten(p, twice, { blocks: 'inline' }).length, 5);
const once = S.flatten(p, twice, { blocks: 'once' });
assert.strictEqual(once.length, 4);
assert.strictEqual(once[3].action, 'Repeat steps 1–2 (Log in as an employee)');
assert.strictEqual(once[3].expected, 'Same results as steps 1–2');
delete p.cases.twice;
console.log('block once ok');

// inline formatting: **bold**, *italic*, escaped \* and HTML stay safe
assert.strictEqual(S.inlineToHtml('Click **Save** and *wait*'), 'Click <strong>Save</strong> and <em>wait</em>');
assert.strictEqual(S.inlineToHtml('2 \\* 3 <b>'), '2 * 3 &lt;b&gt;');
assert.strictEqual(S.inlineToPlain('Click **Save**\nthen *wait*'), 'Click Save\nthen wait');
const boldCase = S.parseCase('b', `---\ntitle: B\n---\n\n## Steps\n\n1. Click **Save** \`#bb01\`\n   Expected: A *toast* appears\n`);
assert.match(S.toGridTSV(boldCase, S.flatten(p, boldCase), {}), /\tClick Save\tA toast appears/);
console.log('formatting ok');

// line diffs for reviewing changes made outside the app
const kinds = d => d.map(l => (l.type === 'same' ? ' ' : l.type === 'add' ? '+' : '-') + l.text).join('|');
assert.strictEqual(kinds(S.diffLines('a\nb\nc\n', 'a\nb\nc\n')), ' a| b| c');
assert.strictEqual(kinds(S.diffLines('a\nb\nc\n', 'a\nB\nc\n')), ' a|-b|+B| c');
assert.strictEqual(kinds(S.diffLines('a\nc', 'a\nb\nc')), ' a|+b| c');
assert.strictEqual(kinds(S.diffLines('a\nb\nc', 'a\nc')), ' a|-b| c');
assert.strictEqual(kinds(S.diffLines(null, 'x\ny\n')), '+x|+y');
assert.strictEqual(kinds(S.diffLines('x\r\ny', null)), '-x|-y');
assert.strictEqual(kinds(S.diffLines('', '')), '');
assert.strictEqual(kinds(S.diffLines('1\n2\n3\n4', '0\n1\n3\n4\n5')), '+0| 1|-2| 3| 4|+5');
const big = S.diffLines(files['cases/expense-over-limit-approval.md'], files['cases/expense-over-limit-approval.md'].replace('$600', '$700'));
assert.strictEqual(big.filter(l => l.type !== 'same').length, 2);
console.log('diff ok');

// frontmatter keys Stepwise doesn't know about are written back unchanged
const custom = `---\ntitle: Custom keys\nowner: Pat Lee # QA lead\nado_id: 42\nlinks:\n  - https://example.com/a\n  - https://example.com/b\nreviewed: [2026-10-01, "x, y"]\n---\n\n## Steps\n\n1. Do it \`#cu01\`\n   Expected: Done\n`;
const cc = S.parseCase('custom', custom);
assert.strictEqual(cc.ado_id, '42');
const written = S.writeCase(cc, bt);
for (const line of ['owner: Pat Lee # QA lead', 'links:', '  - https://example.com/a', '  - https://example.com/b', 'reviewed: [2026-10-01, "x, y"]']) {
  assert.ok(written.split('\n').includes(line), 'kept ' + line);
}
assert.strictEqual(S.writeCase(S.parseCase('custom', written), bt), written);
const cb = S.parseBlock('b', `---\ntitle: Block\nversion: 3\n---\n\n## Steps\n\n1. One \`#bk01\`\n`);
assert.match(S.writeBlock(cb), /^---\ntitle: Block\nversion: 3\n---/);
console.log('unknown frontmatter ok');
