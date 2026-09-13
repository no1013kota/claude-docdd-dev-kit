---
type: regex
target: { source: file, path: .gitignore }
pattern: '^(node_modules/|/\.next/)$'
flags: m
match: not_contains
---
