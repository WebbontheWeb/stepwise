/*
 * Fictional demo data for "Expense Hub", an expense-report app that doesn't exist.
 * Used by demo mode and by "Add sample cases too" when setting up a folder.
 * Keys are file paths. Real test cases never live here: they live in the folder you open.
 */
(function (root) {
  'use strict';
  const files = {
    'blocks/log-in-as-employee.md': `---
title: Log in as an employee
---

## Description

Signs in with the shared Employee test account.

## Steps

1. Go to the Expense Hub sign-in page \`#a1aa\`
   Expected: The sign-in page loads
2. Sign in as qa.employee (Employee role) \`#a1ab\`
   Expected: The dashboard shows "My reports"
`,
    'blocks/create-basic-expense-report.md': `---
title: Create a basic expense report
---

## Description

A one-line report with a small taxi expense, used as the starting point for most expense tests.

## Steps

1. Select New report \`#b1aa\`
   Expected: A blank expense report opens
2. Choose cost center "Marketing" \`#b1ab\`
   Expected: The approver and currency fill in
3. Add a "Taxi" line for $40 \`#b1ac\`
   Expected: The report total shows $40.00
`,
    'cases/expense-over-limit-approval.md': `---
title: Report over $500 requires manager approval
ado_id:
suite: Expenses / Approvals
area: Expense Hub\\Expenses
priority: 1
state: Design
assigned:
tags: [expenses, approvals]
tests: [1201]
related: [expense-approval-routing]
---

## Description

An employee can't submit a report totaling more than $500 without manager approval. A manager can.

## Preconditions

- qa.employee and qa.manager test accounts exist
- Approval limit is set to $500 in Settings

## Steps

1. [Use block: Log in as an employee] \`#k3f9 use:log-in-as-employee\`
2. [Use block: Create a basic expense report] \`#p2x1 use:create-basic-expense-report\`
3. Add a "Hotel" line for $600 \`#m8q4\`
   Expected: An "Approval required" banner appears above the total
4. Select Submit \`#r5d2\`
   Expected: Status changes to Pending approval
5. Sign out, then sign in as qa.manager \`#w3e8\`
   Expected: The dashboard shows "Team reports"
6. [Repeat steps 2–3] as the manager \`#t7w2 repeat:p2x1..m8q4\`
   Expected: No approval banner appears and the report can be submitted
`,
    'cases/expense-approval-routing.md': `---
title: Approval request goes to the submitter's manager
ado_id:
suite: Expenses / Approvals
area: Expense Hub\\Expenses
priority: 2
state: Design
assigned:
tags: [approvals, notifications]
tests: [1201, 1202]
related: [expense-over-limit-approval]
---

## Description

When a report needs approval, the request goes to the submitting employee's manager and nobody else.

## Preconditions

- qa.employee reports to qa.manager
- qa.othermanager exists and is not qa.employee's manager

## Steps

1. [Use block: Log in as an employee] \`#c4n1 use:log-in-as-employee\`
2. [Use block: Create a basic expense report] \`#c4n2 use:create-basic-expense-report\`
3. Add a "Flight" line for $800 and select Submit \`#c4n3\`
   Expected: Status changes to Pending approval
4. Open qa.manager's approval inbox \`#c4n4\`
   Expected: The report appears with the employee's name and the $840.00 total
5. Open qa.othermanager's approval inbox \`#c4n5\`
   Expected: The report does not appear
`,
    'cases/expense-limit-boundary.md': `---
title: Report of exactly $500 doesn't need approval
ado_id:
suite: Expenses / Approvals
area: Expense Hub\\Expenses
priority: 2
state: Design
assigned:
tags: [expenses, approvals, boundary]
tests: [1201]
related: [expense-over-limit-approval]
---

## Description

Boundary check for the approval limit.

## Preconditions

- Approval limit is set to $500 in Settings

## Steps

1. [Use block: Log in as an employee] \`#d5a1 use:log-in-as-employee\`
2. [Use block: Create a basic expense report] \`#d5a2 use:create-basic-expense-report\`
3. Add a "Meals" line for $460 \`#d5a3\`
   Expected: The total shows $500.00 and no approval banner appears
4. Select Submit \`#d5a4\`
   Expected: Status changes to Submitted
`,
    'cases/expense-pdf-export.md': `---
title: Report PDF matches the report lines
ado_id:
suite: Expenses / Documents
area: Expense Hub\\Documents
priority: 3
state: Design
assigned:
tags: [pdf]
tests: [1205]
related: []
---

## Description

## Preconditions

## Steps

1. [Use block: Log in as an employee] \`#e6b1 use:log-in-as-employee\`
2. [Use block: Create a basic expense report] \`#e6b2 use:create-basic-expense-report\`
3. Select Download PDF \`#e6b3\`
4. Open the PDF \`#e6b4\`
   Expected: Cost center, expense lines and total match the report on screen
`,
    'stepwise.json': `{
  "adoBaseUrl": ""
}
`,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = files;
  else root.StepwiseSample = files;
})(typeof window !== 'undefined' ? window : globalThis);
