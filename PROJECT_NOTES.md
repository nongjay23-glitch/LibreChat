# Project Notes

## Done / MVP

- Code context as temporary attachments
  - Status: MVP implemented.
  - Goal: avoid pasting hundreds or thousands of lines into the chat input.
  - Current flow:
    1. In `Code`, select one or more files.
    2. Attach the selected files as a `Code context` chip above the chat input.
    3. Click the chip to inspect the attached files.
    4. Click a file name inside the chip popover to preview the full text.
    5. On submit, the backend merges the attachment content into the model-facing prompt while the visible chat input stays short.
  - Safety:
    - Keep workspace read-only.
    - Keep secret-file blocking rules such as `.env`, token, password, credentials, database dumps, logs, uploads, `node_modules`, and `.git`.
    - Do not allow write/delete/terminal actions from this feature.

## Backlog

- Code diff preview and approve/reject before any write mode.
- Git checkpoint/backup before write mode.
- Undo/restore for approved file edits.
