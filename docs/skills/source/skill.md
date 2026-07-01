# Source Skill

## Purpose

Document the future runtime behavior for the Notebook source command. This file is documentation only and is not loaded or executed by the app yet.

## Trigger command

`/source`

## Allowed inputs

- Current conversation enabled and ready Notebook sources.
- The user question after removing the leading `/source` command.

## Forbidden inputs

- Disabled sources.
- Blocked, too_large, unsupported, or parse_error sources.
- Old chat history as substitute source evidence.
- Global notebooks or sources from other conversations.

## Behavior

- Answer only from the current enabled Notebook source context.
- If no enabled sources are available, return the deterministic no-source message.
- If the answer is not specified in enabled sources, say it is not specified in enabled Notebook sources.
- Cite source and section labels when available.

## Current status

- Documentation only.
- Not connected to runtime.
- Full Skill system remains deferred.
