# output/

This folder is the **staging area** for AI-generated GeneXus code.

When you ask your AI assistant to create a User Control, DSO, or Web Panel, it saves the generated files here. You then copy-paste them into your GeneXus IDE.

## Workflow

1. Ask your AI to generate a UC/DSO/WP
2. AI saves the file(s) to this folder
3. You open the file, copy the content
4. Paste into your GeneXus IDE (Screen Template / Properties / DSO editor)
5. Build and test

## This folder is NOT versioned

`/output/*` is in `.gitignore` (except this README and `.gitkeep`).
Your generated code stays local — don't commit it unless you intentionally move it to `examples/`.
