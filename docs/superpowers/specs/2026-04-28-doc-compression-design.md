# Doc Compression Design — 2026-04-28

## Goal
Reduce tokens loaded by Claude each session by stripping non-coding-relevant and now-stale sections from PROJECT_REFERENCE.md and updating memory to reflect true project state (all 24 sprints complete).

## Changes to PROJECT_REFERENCE.md

### Remove entirely
- **§7 Sprint Roadmap** — 24-row sprint table + phase table are done; replace with one status line
- **§8 Team Structure** — pod composition / RACI are not relevant to coding tasks
- **§12 Document Index** — 24-row listing of docs Claude doesn't navigate to mid-session

### Trim
- **§1 Project Identity** — drop Budget and Document Classification rows (not coding-relevant)
- **§6 Product Modules** — drop the verbose Description column; keep module name, owner pod, sprint range

### Keep intact
§2 Tech Stack · §3 Architecture · §4 DB Schema · §5 API Spec · §9 Coding Standards · §10 Security · §11 NFRs

### Status line (replaces §7 content)
> **Status:** All 24 sprints delivered — GA ready (April 2026).

## Changes to Memory

### project_WBMSG.md
Update status from: *"Sprint 1 complete. Sprint 2 next."*
To: *"All 24 sprints complete. GA ready April 2026. Next work is post-launch iteration."*

### MEMORY.md
Update the description line for the project overview entry.

## Expected outcome
PROJECT_REFERENCE.md: ~311 lines → ~175 lines (~44% reduction).
Memory: accurate current status for future sessions.
