# Real Repo Evaluation

## 2026-06-10

### TaskManager

Target: `ozbayorcun/TaskManager`

Result: useful domain inference, initially blocked by schema dialect variance.

What worked:

- Codex identified the product as a task-first desktop workflow assistant.
- Inferred entities were directionally useful: user, source/context, capture, task candidate, task, suggestion, meeting, support/recovery state.
- Inferred events matched the real workflow shape: capture triggered, candidate extracted/reviewed, task created/status changed, suggestion surfaced/handled, meeting lifecycle, recovery case updates.
- After normalization hardening, the inferred spec validated and generated demo data.

Product fixes made from this run:

- Evidence collection now skips `.planning`, `.github`, `.tmp`, `.bg-shell`, and `.demo-data-simulator` so inference focuses on product/source files instead of prior generated artifacts or internal planning notes.
- Inferred spec normalization now handles common agent type dialects:
  - `uuid`, `email`, `url`, `text`
  - `date`, `datetime`, `dateTime`, `timestamp_optional`
  - `foreign_key`, `foreign_key_optional`, `ref`
  - `array_string`, `array<string>`, `string_array`, `ref_array`
  - semantic strings like `person_name`, `company_name`, `task_title`, `paragraph`
- Normalization inserts a synthetic `id` for singleton/state entities with no ID field.
- Entity-derived metric dependencies are normalized away for MVP generation instead of failing the whole inferred spec.

Remaining product concern:

- Real Codex inference can take 1-3 minutes on larger repos with the current evidence budget. A future `--profile fast` or smarter source-priority collector would improve first-run UX.

### Promptcade MVP

Target: `ozbayorcun/promptcade-mvp`

Result: useful domain inference, initially polluted by agent-skill files.

What worked:

- Codex inferred the app as an AI prompt-to-game creation platform.
- Inferred entities were directionally useful: users, games, generation jobs, assets, follows.
- Inferred events matched useful demo flows: signup, prompt submitted, generation stage completed, game published, game played, game remixed, follow created.

Product fixes made from this run:

- Evidence collection now skips `.agent` directories, because agent skill/workflow files can consume the evidence budget while adding little product-domain signal.
- Inferred spec normalization now handles `_nullable` suffixes such as `uuid_nullable`, `timestamp_nullable`, and `enum_nullable`.

Remaining product concern:

- The collector still needs source-priority ordering. Even after skipping obvious metadata directories, the order is simple lexical traversal rather than "domain-bearing files first."
