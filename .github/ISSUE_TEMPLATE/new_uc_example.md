---
name: New UC example submission
about: Propose adding a new User Control example to the repository
labels: new-uc
assignees: ''
---

## UC name

<!-- e.g. UcDateRangePicker -->

## CSS prefix (3-4 chars)

<!-- e.g. drp- -->

## Control type

<!-- e.g. input, display, navigation, notification -->

## What it does

<!-- Brief description of the UC's purpose and behavior -->

## Contribution checklist

- [ ] `.view` file follows the structure in `examples/user-controls/`
- [ ] `README.md` includes Properties table, Events, and a WebPanel integration example
- [ ] JavaScript uses ES5 only — no `let`, `const`, arrow functions, or template literals
- [ ] CSS uses BEM kebab-case with the declared prefix
- [ ] `decimal` Properties use `Type="string"`
- [ ] Tested with 2+ instances on the same page
- [ ] No customer names, proprietary logic, or credentials

## Are you submitting a PR?

- [ ] Yes, I'll open a PR with the files
- [ ] No, I'm requesting someone else build it
