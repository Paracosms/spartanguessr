# Sanitized host snapshots

After each operator-side 'docker stats --no-stream' command, create only these
four small Markdown notes:

- 'baseline.md'
- 'run-1.md'
- 'run-2.md'
- 'run-3.md'

Each note may contain the UTC capture time, CPU percentage, memory usage, and
an operator observation. Remove the public host address, container IDs,
image IDs, command text, and any environment data before saving it here.

The values are supporting context for the result template; do not use them to
invent a capacity claim.
