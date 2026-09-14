---
type: regex
target: { source: file, path: .gitignore }
pattern: '^# docdd: Python'
flags: m
match: not_contains
---
