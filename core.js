/*
 * Stepwise core: file format, parsing, flattening, exports and checks.
 * No DOM access here, so it runs in the browser and in Node (for tests).
 */
(function (root) {
  'use strict';

  const CASE_FIELDS = ['title', 'ado_id', 'suite', 'area', 'priority', 'state', 'assigned', 'tags', 'tests', 'related'];
  const LIST_FIELDS = new Set(['tags', 'tests', 'related']);
  const STATES = ['Design', 'Ready', 'Closed'];

  // ---------- ids ----------

  function stepId(taken) {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let id;
    do {
      id = '';
      for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)];
    } while (taken && taken.has(id));
    return id;
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'untitled';
  }

  function uniqueSlug(base, taken) {
    let slug = slugify(base), n = 2;
    const start = slug;
    while (taken.has(slug)) slug = `${start}-${n++}`;
    return slug;
  }

  // ---------- frontmatter ----------

  function unquote(v) {
    if (/^".*"$/.test(v)) { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    return v;
  }

  function quoteIfNeeded(v) {
    v = String(v ?? '');
    if (v === '') return '';
    if (/^[\[\]{}"'`>|*&!%@#,?-]|:\s|\s#|^\s|\s$/.test(v)) return JSON.stringify(v);
    return v;
  }

  function splitFrontmatter(text) {
    text = String(text).replace(/\r\n?/g, '\n');
    const m = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
    if (!m) return { meta: {}, body: text };
    const meta = {};
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      if (LIST_FIELDS.has(key)) {
        value = value.replace(/^\[/, '').replace(/\]$/, '');
        meta[key] = value ? value.split(',').map(s => unquote(s.trim())).filter(Boolean) : [];
      } else {
        meta[key] = unquote(value);
      }
    }
    return { meta, body: text.slice(m[0].length) };
  }

  function writeFrontmatter(pairs) {
    const lines = ['---'];
    for (const [key, value] of pairs) {
      if (Array.isArray(value)) {
        lines.push(`${key}: [${value.map(v => /[,\]\[]/.test(v) ? JSON.stringify(v) : v).join(', ')}]`);
      } else {
        lines.push(`${key}: ${quoteIfNeeded(value)}`.trimEnd());
      }
    }
    lines.push('---');
    return lines.join('\n');
  }

  // ---------- sections ----------

  function splitSections(body) {
    const sections = [];
    let current = null;
    for (const line of body.split('\n')) {
      const h = line.match(/^##\s+(.+?)\s*$/);
      if (h) { current = { heading: h[1], lines: [] }; sections.push(current); continue; }
      if (current) current.lines.push(line);
    }
    return sections.map(s => ({ heading: s.heading, content: trimBlank(s.lines).join('\n') }));
  }

  function trimBlank(lines) {
    let a = 0, b = lines.length;
    while (a < b && !lines[a].trim()) a++;
    while (b > a && !lines[b - 1].trim()) b--;
    return lines.slice(a, b);
  }

  // ---------- steps ----------

  const META_RE = /\s*`#([a-z0-9]+)((?:\s+[a-z]+:[^`\s]*)*)`\s*$/i;
  const EXPECTED_RE = /^(?:expected(?:\s+result)?\s*:|→)\s?(.*)$/i;

  function parseStepHead(text) {
    let id = null;
    const attrs = {};
    const m = text.match(META_RE);
    if (m) {
      id = m[1];
      text = text.slice(0, m.index);
      for (const kv of m[2].trim().split(/\s+/).filter(Boolean)) {
        const i = kv.indexOf(':');
        attrs[kv.slice(0, i)] = kv.slice(i + 1);
      }
    }
    text = text.trim();

    if ('use' in attrs) return { id, type: 'use', block: attrs.use };
    if ('repeat' in attrs) {
      const [from, to] = attrs.repeat.split('..');
      return { id, type: 'repeat', from, to: to || from, note: text.replace(/^\[[^\]]*\]\s*/, ''), expected: '' };
    }
    // Hand-written forms without metadata (e.g. written by Claude or a teammate).
    const use = text.match(/^\[?\s*use (?:block|shared steps)\s*:\s*([^\]]+?)\s*\]?$/i);
    if (use) return { id, type: 'use', block: use[1] };
    const rep = text.match(/^\[?\s*repeat steps?\s+(\d+)(?:\s*(?:–|-|to|through)\s*(\d+))?\s*\]?\s*(.*)$/i);
    if (rep) return { id, type: 'repeat', fromNum: +rep[1], toNum: +(rep[2] || rep[1]), note: rep[3], expected: '' };

    return { id, type: 'action', action: text, expected: '' };
  }

  function parseSteps(text) {
    const steps = [];
    let cur = null, field = 'action';
    for (const raw of text.split('\n')) {
      const num = raw.match(/^ {0,3}\d+[.)]\s+(.*)$/);
      if (num) {
        cur = parseStepHead(num[1]);
        steps.push(cur);
        field = 'action';
        continue;
      }
      if (!cur) continue;
      const line = raw.replace(/^ {1,4}/, '');
      const exp = field === 'action' && line.match(EXPECTED_RE);
      if (exp) {
        field = 'expected';
        cur.expected = exp[1];
        continue;
      }
      if (field === 'expected') {
        cur.expected += '\n' + line;
      } else if (cur.type === 'action') {
        cur.action += '\n' + line;
      } else if (cur.type === 'repeat') {
        cur.note = (cur.note + ' ' + line.trim()).trim();
      }
    }
    for (const s of steps) {
      if (s.type === 'action') s.action = trimBlank(s.action.split('\n')).join('\n');
      if ('expected' in s) s.expected = trimBlank(String(s.expected).split('\n')).join('\n');
    }
    // Give every step a unique id (missing or duplicated ones get a fresh one),
    // then resolve "Repeat steps 2-3" written by number.
    const all = new Set(steps.map(s => s.id).filter(Boolean));
    const used = new Set();
    for (const s of steps) {
      if (!s.id || used.has(s.id)) { s.id = stepId(all); all.add(s.id); }
      used.add(s.id);
    }
    for (const s of steps) {
      if (s.type === 'repeat' && s.fromNum) {
        s.from = steps[s.fromNum - 1]?.id || '';
        s.to = steps[s.toNum - 1]?.id || '';
        delete s.fromNum; delete s.toNum;
      }
    }
    return steps;
  }

  function indent(text) {
    return String(text).split('\n').map(l => (l ? '   ' + l : '')).join('\n');
  }

  function rangeLabel(steps, from, to) {
    const a = steps.findIndex(s => s.id === from) + 1;
    const b = steps.findIndex(s => s.id === to) + 1;
    if (!a || !b) return 'Repeat steps ?';
    return a === b ? `Repeat step ${a}` : `Repeat steps ${a}–${b}`;
  }

  function writeSteps(steps, blockTitle) {
    return steps.map((s, i) => {
      const n = `${i + 1}.`;
      if (s.type === 'use') {
        return `${n} [Use block: ${blockTitle(s.block) || s.block}] \`#${s.id} use:${s.block}\``;
      }
      if (s.type === 'repeat') {
        let out = `${n} [${rangeLabel(steps, s.from, s.to)}]${s.note ? ' ' + s.note.replace(/\s+/g, ' ') : ''} \`#${s.id} repeat:${s.from}..${s.to}\``;
        if (s.expected) out += '\n' + indent('Expected: ' + s.expected);
        return out;
      }
      const [first, ...rest] = String(s.action || '').split('\n');
      let out = `${n} ${first ? first + ' ' : ''}\`#${s.id}\``;
      if (rest.length) out += '\n' + indent(rest.join('\n'));
      if (s.expected) out += '\n' + indent('Expected: ' + s.expected);
      return out;
    }).join('\n');
  }

  // ---------- inline formatting ----------
  // Step text and descriptions may use **bold** and *italic*. \* is a literal asterisk.

  const STAR = '\u0000';
  function escapeHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inlineToHtml(md) {
    return escapeHtml(md || '').replace(/\\\*/g, STAR)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>')
      .split(STAR).join('*');
  }
  function inlineToPlain(md) {
    return String(md || '').replace(/\\\*/g, STAR)
      .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .split(STAR).join('*');
  }

  // ---------- documents ----------

  function parseCase(id, text) {
    const { meta, body } = splitFrontmatter(text);
    const sections = splitSections(body);
    const take = name => {
      const i = sections.findIndex(s => s.heading.toLowerCase() === name);
      return i < 0 ? null : sections.splice(i, 1)[0].content;
    };
    const description = take('description') || '';
    const preconditions = take('preconditions') || '';
    const stepsText = take('steps') || '';
    return {
      kind: 'case',
      id,
      title: meta.title || '',
      ado_id: meta.ado_id || '',
      suite: meta.suite || '',
      area: meta.area || '',
      priority: meta.priority || '2',
      state: meta.state || 'Design',
      assigned: meta.assigned || '',
      tags: meta.tags || [],
      tests: meta.tests || [],
      related: meta.related || [],
      description,
      preconditions,
      steps: parseSteps(stepsText),
      extra: sections,
    };
  }

  function writeCase(c, blockTitle) {
    const fm = writeFrontmatter(CASE_FIELDS.map(k => [k, c[k] ?? (LIST_FIELDS.has(k) ? [] : '')]));
    const parts = [fm, '', '## Description', '', c.description || '', '', '## Preconditions', '', c.preconditions || '', '', '## Steps', '', writeSteps(c.steps, blockTitle)];
    for (const s of c.extra || []) parts.push('', `## ${s.heading}`, '', s.content);
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }

  function parseBlock(id, text) {
    const { meta, body } = splitFrontmatter(text);
    const sections = splitSections(body);
    const get = name => (sections.find(s => s.heading.toLowerCase() === name) || {}).content || '';
    // Blocks hold plain steps only; nested references are flattened to text.
    const steps = parseSteps(get('steps')).map(s => s.type === 'action' ? s
      : { id: s.id, type: 'action', action: s.type === 'use' ? `Use block: ${s.block}` : (s.note || 'Repeat'), expected: s.expected || '' });
    return { kind: 'block', id, title: meta.title || id, description: get('description'), steps };
  }

  function writeBlock(b) {
    return [writeFrontmatter([['title', b.title]]), '', '## Description', '', b.description || '', '', '## Steps', '', writeSteps(b.steps, () => '')]
      .join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  }

  // ---------- project ----------

  function createProject() {
    return { cases: {}, blocks: {}, settings: { adoBaseUrl: '' } };
  }

  function blockTitleFn(project) {
    return id => project.blocks[id]?.title || '';
  }

  // Resolve hand-written block references ("Use block: Log in as admin") to block ids.
  function resolveReferences(project) {
    const byTitle = {};
    for (const b of Object.values(project.blocks)) byTitle[b.title.toLowerCase()] = b.id;
    for (const c of Object.values(project.cases)) {
      for (const s of c.steps) {
        if (s.type === 'use' && !project.blocks[s.block]) {
          const hit = byTitle[String(s.block).toLowerCase()] || (project.blocks[slugify(s.block)] && slugify(s.block));
          if (hit) s.block = hit;
        }
      }
    }
  }

  function newStep(type, taken, extra) {
    const id = stepId(taken);
    if (type === 'use') return { id, type, block: '', ...extra };
    if (type === 'repeat') return { id, type, from: '', to: '', note: '', expected: '', ...extra };
    return { id, type: 'action', action: '', expected: '', ...extra };
  }

  function relatedOf(project, c) {
    const out = new Set(c.related.filter(id => id !== c.id));
    for (const o of Object.values(project.cases)) if (o.id !== c.id && o.related.includes(c.id)) out.add(o.id);
    return [...out];
  }

  function blockUsage(project, blockId) {
    return Object.values(project.cases).filter(c => c.steps.some(s => s.type === 'use' && s.block === blockId));
  }

  function coverage(project) {
    const map = {};
    for (const c of Object.values(project.cases)) for (const t of c.tests) (map[t] = map[t] || []).push(c);
    return map;
  }

  // ---------- flatten (what ADO receives) ----------

  /**
   * opts.blocks:  'inline' (write the block's steps out every time)
   *             | 'once' (write them out the first time; later uses say "Repeat steps 3–5")
   *             | 'name' (one step naming the block)
   * opts.repeats: 'text' ("Repeat steps 4–6", numbered to match the export) | 'inline' (write them out again)
   */
  function flatten(project, c, opts = {}) {
    const blocks = opts.blocks || 'inline';
    const repeats = opts.repeats || 'text';
    const out = [];
    const span = {};
    const firstUse = {};
    const rangeText = (a, z) => (a === z ? `step ${a + 1}` : `steps ${a + 1}–${z + 1}`);
    c.steps.forEach(s => {
      const start = out.length;
      if (s.type === 'action') {
        out.push({ action: s.action, expected: s.expected, kind: 'action' });
      } else if (s.type === 'use') {
        const b = project.blocks[s.block];
        if (!b) out.push({ action: `[Missing block: ${s.block || 'none chosen'}]`, expected: '', kind: 'error' });
        else if (blocks === 'name') out.push({ action: `Perform shared steps: ${b.title}`, expected: '', kind: 'block', block: b.title });
        else if (blocks === 'once' && firstUse[b.id]) {
          const { start: a, end: z } = firstUse[b.id];
          out.push({ action: `Repeat ${rangeText(a, z)} (${b.title})`, expected: `Same results as ${rangeText(a, z)}`, kind: 'repeat', block: b.title });
        } else {
          b.steps.forEach(bs => out.push({ action: bs.action, expected: bs.expected, kind: 'block', block: b.title }));
          if (b.steps.length) firstUse[b.id] = { start: out.length - b.steps.length, end: out.length - 1 };
        }
      } else if (s.type === 'repeat') {
        const a = span[s.from], z = span[s.to];
        if (!a || !z || a.start > z.end) {
          out.push({ action: '[Broken repeat reference]', expected: '', kind: 'error' });
        } else if (repeats === 'inline') {
          const copied = out.slice(a.start, z.end + 1).map(r => ({ ...r, kind: 'repeat' }));
          if (s.note && copied.length) copied[0] = { ...copied[0], action: `(${s.note}) ${copied[0].action}` };
          if (s.expected && copied.length) {
            const last = copied[copied.length - 1];
            copied[copied.length - 1] = { ...last, expected: last.expected ? `${last.expected}\n${s.expected}` : s.expected };
          }
          out.push(...copied);
        } else {
          const range = rangeText(a.start, z.end);
          out.push({ action: `Repeat ${range}${s.note ? ' ' + s.note : ''}`, expected: s.expected || `Same results as ${range}`, kind: 'repeat' });
        }
      }
      span[s.id] = { start, end: out.length - 1 };
    });
    return out;
  }

  // ---------- exports ----------

  function cell(v, sep) {
    v = String(v ?? '');
    // Spreadsheets run CSV cells starting with these as formulas; a leading ' keeps them as text.
    if (sep === ',' && /^[=+\-@\t\r]/.test(v)) v = "'" + v;
    // CSV quotes any cell with quotes; pasted TSV only needs it for tabs and line breaks.
    const needs = sep === '\t' ? /[\t\n\r]/.test(v) : /[",\n\r]/.test(v);
    return needs ? `"${v.replace(/"/g, '""')}"` : v;
  }

  /** Tab-separated rows for pasting into the Azure Test Plans grid view. */
  function toGridTSV(c, rows, opts = {}) {
    rows = rows.map(r => ({ ...r, action: inlineToPlain(r.action), expected: inlineToPlain(r.expected) }));
    const lines = [];
    if (opts.header) lines.push(['Title', 'Step Action', 'Step Expected Result']);
    if (opts.titleRow === 'first' && rows.length) {
      rows.forEach((r, i) => lines.push([i === 0 ? c.title : '', r.action, r.expected]));
    } else {
      lines.push([c.title, '', '']);
      rows.forEach(r => lines.push(['', r.action, r.expected]));
    }
    return lines.map(l => l.map(v => cell(v, '\t')).join('\t')).join('\n');
  }

  const CSV_HEADER = ['ID', 'Work Item Type', 'Title', 'Test Step', 'Step Action', 'Step Expected', 'Area Path', 'Assigned To', 'State', 'Priority', 'Tags'];

  /** CSV in the shape Azure Test Plans' "Import test cases" expects (one row per step). */
  function toCSV(project, cases, opts = {}) {
    const lines = [CSV_HEADER];
    for (const c of cases) {
      lines.push([c.ado_id, 'Test Case', c.title, '', '', '', c.area, c.assigned, c.state, c.priority, c.tags.join('; ')]);
      flatten(project, c, opts).forEach((r, i) => lines.push(['', '', '', i + 1, inlineToPlain(r.action), inlineToPlain(r.expected), '', '', '', '', '']));
    }
    return '﻿' + lines.map(l => l.map(v => cell(v, ',')).join(',')).join('\r\n') + '\r\n';
  }

  // ---------- checks ----------

  function lintCase(project, c) {
    const issues = [];
    const add = (level, msg, step) => issues.push({ level, msg, step });
    if (!c.title.trim()) add('error', 'Test case has no title.');
    if (!c.steps.length) add('warn', 'No steps yet.');
    const seen = {};
    c.steps.forEach((s, i) => {
      seen[s.id] = i;
      const n = i + 1;
      if (s.type === 'action') {
        if (!s.action.trim()) add('warn', `Step ${n} has no action.`, s.id);
        else if (!s.expected.trim()) add('warn', `Step ${n} has no expected result.`, s.id);
      } else if (s.type === 'use') {
        if (!s.block) add('error', `Step ${n} doesn't say which block to use.`, s.id);
        else if (!project.blocks[s.block]) add('error', `Step ${n} uses a block that doesn't exist (${s.block}).`, s.id);
      } else if (s.type === 'repeat') {
        const a = seen[s.from], b = seen[s.to];
        if (a === undefined || b === undefined) {
          const gone = [s.from, s.to].some(id => !c.steps.some(o => o.id === id));
          add('error', gone ? `Step ${n} repeats steps that no longer exist.` : `Step ${n} repeats steps that come after it.`, s.id);
        } else if (a > b) add('error', `Step ${n} has its repeat range backwards.`, s.id);
      }
    });
    for (const r of c.related) {
      if (r === c.id) add('warn', 'Test case is related to itself.');
      else if (!project.cases[r]) add('warn', `Related case "${r}" doesn't exist.`);
    }
    const dupe = Object.values(project.cases).find(o => o.id !== c.id && o.title.trim() && o.title.trim().toLowerCase() === c.title.trim().toLowerCase());
    if (dupe) add('warn', `Another case has the same title (${dupe.id}).`);
    if (!c.tests.length) add('info', 'Not linked to a requirement.');
    return issues;
  }

  function lintBlock(project, b) {
    const issues = [];
    if (!b.title.trim()) issues.push({ level: 'error', msg: 'Block has no title.' });
    if (!b.steps.length) issues.push({ level: 'warn', msg: 'Block has no steps.' });
    b.steps.forEach((s, i) => {
      if (!s.action.trim()) issues.push({ level: 'warn', msg: `Step ${i + 1} has no action.`, step: s.id });
      else if (!s.expected.trim()) issues.push({ level: 'warn', msg: `Step ${i + 1} has no expected result.`, step: s.id });
    });
    if (!blockUsage(project, b.id).length) issues.push({ level: 'info', msg: 'Not used by any test case.' });
    return issues;
  }

  function worstLevel(issues) {
    if (issues.some(i => i.level === 'error')) return 'error';
    if (issues.some(i => i.level === 'warn')) return 'warn';
    return issues.length ? 'info' : 'ok';
  }

  // ---------- Claude ----------

  const AUDIT_PROMPT = `Please audit these manual test cases (Azure DevOps style). For each test case, check:
- Every step has one clear action and an observable, specific expected result (no "works correctly").
- Steps are in a sensible order and nothing needed to reach a state is missing.
- Preconditions cover the data, permissions and setup the steps assume.
- "Use block" and "Repeat steps" references make sense in context.
- Negative paths, boundaries and permissions are covered somewhere in the set; point out gaps.
- Duplicated or overlapping cases, and cases that should be related but aren't.
Reply with findings grouped by test case, most important first, and suggested rewrites for weak steps.`;

  function auditBundle(project, cases) {
    const bt = blockTitleFn(project);
    const parts = [AUDIT_PROMPT, '', 'The file format is described in CLAUDE.md. Files:', ''];
    const usedBlocks = new Set();
    for (const c of cases) c.steps.forEach(s => s.type === 'use' && usedBlocks.add(s.block));
    for (const c of cases) parts.push(`===== cases/${c.id}.md =====`, writeCase(c, bt));
    for (const id of usedBlocks) if (project.blocks[id]) parts.push(`===== blocks/${id}.md =====`, writeBlock(project.blocks[id]));
    return parts.join('\n');
  }

  const CLAUDE_MD = `# Stepwise test cases

This folder holds manual test cases written for Azure DevOps (ADO) Test Plans. They are edited
in the Stepwise app (a local HTML page) and exported to ADO by paste or CSV. You can read, audit
and edit these files directly; the app picks up changes when its window regains focus.

## Layout

- \`cases/<id>.md\`: one test case per file. The file name is the case id.
- \`blocks/<id>.md\`: reusable step blocks (like ADO Shared Steps). The file name is the block id.
- \`stepwise.json\`: app settings (ADO base URL).

## Test case format

\`\`\`markdown
---
title: Report over $500 requires manager approval
ado_id:                       # ADO work item id once it exists in ADO; blank for new cases
suite: Expenses / Approvals
area: Project\\Expenses
priority: 2                   # 1-4
state: Design                 # Design | Ready | Closed
assigned:
tags: [expenses, approvals]
tests: [1201]                 # ADO ids of requirements/user stories this case covers
related: [expense-approval-routing]   # ids of related test cases in cases/
---

## Description

Free text.

## Preconditions

Free text.

## Steps

1. Log in as an employee \`#k3f9\`
   Expected: The dashboard loads
2. [Use block: Create a basic expense report] \`#p2x1 use:create-basic-expense-report\`
3. Add a "Hotel" line for $600 \`#m8q4\`
   Expected: An "Approval required" banner appears
4. [Repeat steps 2–3] as a manager \`#t7w2 repeat:p2x1..m8q4\`
   Expected: No banner appears
\`\`\`

Rules for editing steps:

- The code span at the end of a step's first line holds its id (\`#k3f9\`) and, for references,
  what it points at. **Ids are the source of truth; step numbers and bracketed labels are
  regenerated by the app.** Don't change an existing id.
- For a new step, invent a new 4-character id (lowercase letters and digits) that is unique
  in the file, or omit the code span and the app will assign one.
- \`use:<block-id>\` inserts every step of \`blocks/<block-id>.md\` at that point.
- \`repeat:<from-id>..<to-id>\` repeats an earlier range of steps in the same case. The range
  must come before the repeat step. Text after the bracket is a note (e.g. "as a manager").
- Multi-line actions or expected results continue on lines indented by three spaces.
- You can also write \`Repeat steps 2-3\` or \`Use block: <block title>\` without a code span;
  the app resolves them when it loads the file.

## Block format

\`\`\`markdown
---
title: Create a basic expense report
---

## Description

## Steps

1. Select New report \`#a1b2\`
   Expected: A blank expense report opens
\`\`\`

Blocks contain plain steps only (no nested blocks or repeats).

## Auditing

When asked to audit, check that every step has a clear action and a specific, observable expected
result; that preconditions cover what the steps assume; that references point at the right steps;
and that negative paths, boundaries and permissions are covered across the set. Report findings
per case, most important first, and offer concrete rewrites. Ask before making edits.
`;

  const api = {
    CASE_FIELDS, STATES, stepId, slugify, uniqueSlug,
    inlineToHtml, inlineToPlain, parseCase, writeCase, parseBlock, writeBlock, parseSteps, writeSteps, rangeLabel,
    createProject, blockTitleFn, resolveReferences, newStep, relatedOf, blockUsage, coverage,
    flatten, toGridTSV, toCSV, lintCase, lintBlock, worstLevel, auditBundle, AUDIT_PROMPT, CLAUDE_MD,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Stepwise = api;
})(typeof window !== 'undefined' ? window : globalThis);
