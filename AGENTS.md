# Storezn — Codex Agent Instructions

This file defines how coding agents should work inside the Storezn repository.

The goals are:

1. Make correct changes.
2. Use as little unnecessary context as possible.
3. Avoid breaking existing functionality.
4. Avoid unnecessary refactors.
5. Follow existing Storezn architecture and patterns.
6. Verify changes before considering a task complete.

---

# 1. Core Rule

DO NOT immediately start editing code.

For every non-trivial task:

1. Understand the request.
2. Locate the smallest set of relevant files.
3. Read the existing implementation.
4. Identify existing patterns/helpers that can be reused.
5. Make the smallest necessary change.
6. Verify the change.
7. Review the final diff.

Do not scan or read the entire repository unless the task genuinely requires it.

Prefer targeted searches.

---

# 2. Project Overview

Storezn is a multi-tenant e-commerce/store platform.

Core stack:

* Next.js 16
* App Router
* React 19
* JavaScript
* PostgreSQL
* Drizzle ORM
* Zod
* Paystack
* Cloudinary / storage utilities
* SendPulse email
* Subdomain/custom-domain multi-tenancy

Always inspect the existing implementation before assuming how one of these systems works.

The repository is the source of truth.

Do not rely on generic Next.js patterns when Storezn already has an established implementation.

---

# 3. Important Files and Directories

Start investigations from the most relevant location instead of exploring the whole repository.

## Application

`app/`

Contains pages, layouts, server logic and API routes.

## API

`app/api/v1/`

Primary API implementation.

When modifying an API:

1. Find the existing route.
2. Inspect nearby routes for conventions.
3. Reuse existing validation/auth/database helpers.
4. Preserve existing response formats unless explicitly changing the API contract.

Do not create a new API pattern when an existing Storezn pattern already exists.

## Components

`components/`

Reusable UI components.

Before creating a component, search for an existing component that already solves the problem.

Do not create duplicate UI abstractions.

## Library / Core Logic

`lib/`

Contains shared Storezn infrastructure and business logic.

Important areas include:

* database
* authentication
* validation
* tenant/store resolution
* payments
* storage
* email
* shared utilities

Before creating a new helper, search `lib/`.

Prefer extending an existing helper over creating another implementation of the same concept.

## Database Schema

`lib/db/schema.js`

Treat the current Drizzle schema as the primary source of truth for application database structure.

DO NOT invent:

* tables
* columns
* relations
* enum values
* constraints

Verify them against the schema first.

## Validation

`lib/validate.js`

Use existing validation patterns.

Do not manually duplicate validation logic when an appropriate schema/helper already exists.

## Store Resolution

`proxy.js`

and

`lib/resolveStore.js`

Storezn is multi-tenant.

Changes involving:

* storefronts
* domains
* subdomains
* store IDs
* merchant data
* customer-facing store routes

must preserve tenant isolation.

Never assume the currently authenticated user automatically represents the store being requested.

Follow the existing store-resolution flow.

## Payments

`lib/paystack.js`

Payment-related changes require extra care.

Before changing checkout/payment logic:

1. Inspect the existing Paystack implementation.
2. Inspect the relevant API endpoint.
3. Inspect relevant database fields.
4. Inspect webhook handling if applicable.
5. Inspect relevant tests.

Never trust payment success solely from client-side state.

Do not expose Paystack secret credentials to client code.

Do not alter payment/reference/idempotency behavior unless required by the task.

## Storage

`lib/storage/`

Use the existing storage abstraction.

Do not introduce a new storage implementation unless explicitly requested.

## Email

`lib/email/`

Use existing email infrastructure and conventions.

Do not create another email client unnecessarily.

---

# 4. Documentation

`DOCUMENTATION.md` contains important Storezn architecture information.

Read relevant sections when architectural context is required.

Do NOT repeatedly read the entire document for small tasks.

Use targeted searches/headings instead.

Documentation helps explain the architecture, but current application code and database schema are authoritative when documentation and implementation differ.

---

# 5. Database and Migrations

The repository contains SQL migration files from different stages of Storezn development.

IMPORTANT:

Do not assume an old SQL migration represents the current database structure.

When determining current structure:

1. Check `lib/db/schema.js`.
2. Check newer/relevant migrations if necessary.
3. Inspect the code currently using the table/column.
4. Only then decide what needs changing.

Never edit historical migrations simply to change current behavior.

If a schema change is required, create or follow the project's current migration approach.

Do not silently modify database structure for a task that does not require it.

---

# 6. Multi-Tenant Safety

Tenant isolation is critical.

Every feature dealing with merchant/store data must preserve store boundaries.

Never:

* fetch another store's private data accidentally
* update records without the appropriate store/user scope
* trust client-provided tenant identifiers without following existing authorization patterns
* remove tenant filtering because it appears redundant

When changing queries, explicitly inspect how the relevant store/user ownership is enforced.

If tenant ownership is unclear, investigate before editing.

---

# 7. Authentication and Authorization

Authentication and authorization are different.

A logged-in user is not automatically authorized to modify every resource.

For protected operations:

1. Follow the existing authentication helper.
2. Verify ownership/authorization patterns.
3. Preserve existing role/store checks.
4. Never rely solely on client-provided IDs.

Do not weaken authorization to make a feature work.

---

# 8. Security Rules

Never expose or commit:

* API secrets
* database credentials
* JWT secrets
* Paystack secret keys
* storage secrets
* email credentials
* `.env` contents

Never move server secrets into client components.

Never log sensitive credentials.

Treat payment, authentication and merchant/customer information as sensitive.

Do not remove security checks without explicit justification.

---

# 9. Before Creating New Code

SEARCH FIRST.

Before creating:

* helper
* hook
* API endpoint
* component
* database query abstraction
* formatter
* validator
* payment function
* authentication function
* storage function

search the repository for an existing implementation.

Reuse existing patterns whenever reasonable.

Duplicate implementations make Storezn harder to maintain and increase agent mistakes.

---

# 10. Editing Rules

Make the smallest change necessary to satisfy the request.

DO NOT:

* refactor unrelated files
* rename unrelated variables
* reorganize folders unnecessarily
* rewrite working code because another style looks cleaner
* replace libraries without being asked
* convert unrelated JavaScript
* change formatting across entire files
* alter unrelated APIs
* change unrelated database schemas
* remove existing behavior without confirming it is obsolete

Avoid "while I'm here" changes.

A bug fix should normally remain a bug fix.

A UI change should normally remain a UI change.

A feature should not become an architecture rewrite.

---

# 11. Preserve Existing Contracts

Unless explicitly requested, preserve:

* API request formats
* API response formats
* database semantics
* component props
* URL structure
* query parameters
* authentication behavior
* checkout behavior
* webhook expectations
* existing environment variable names

If changing a contract is necessary, identify all consumers before changing it.

---

# 12. Frontend Changes

When working on UI:

1. Locate the existing page/component.
2. Inspect nearby components for styling conventions.
3. Reuse existing components.
4. Preserve responsive behavior.
5. Preserve loading/error/empty states.
6. Avoid unnecessary dependencies.

Do not rewrite an entire page to make a small visual change.

When changing client/server component boundaries, verify that the change is actually necessary.

Do not add `"use client"` to large component trees unnecessarily.

---

# 13. Backend/API Changes

For API changes:

1. Locate the existing endpoint.
2. Understand its authentication.
3. Understand its validation.
4. Understand its database queries.
5. Understand tenant/ownership restrictions.
6. Modify only what is necessary.
7. Preserve error/response conventions.

Validate external/client input.

Do not trust request payloads.

Do not expose internal errors or secrets unnecessarily.

---

# 14. Payment Changes

Payment code has a higher verification requirement.

For changes involving:

* Paystack
* checkout
* transactions
* webhooks
* merchant payouts
* split payments
* references
* order payment status
* refunds

inspect the complete relevant flow before editing.

Think through:

client
→ API
→ Paystack
→ webhook/verification
→ database
→ order/payment state

Do not change one part without checking its consumers.

Preserve idempotency.

Never mark an order as paid based only on a frontend callback.

---

# 15. POS Changes

Storezn contains POS-related functionality and migrations.

For POS work, search specifically for the current implementation and relevant tests before editing.

Be especially careful with:

* inventory
* cash movements
* transaction idempotency
* device registration
* synchronization
* order state

Do not infer current POS behavior solely from old migration filenames.

---

# 16. Dependency Policy

Do not install a package if the repository can reasonably accomplish the task using an existing dependency or a small amount of local code.

Before adding a dependency:

1. Check `package.json`.
2. Search for existing utilities.
3. Determine whether the dependency is actually necessary.

If adding one is necessary, explain why in the final summary.

Do not upgrade unrelated dependencies during feature work.

---

# 17. Context / Token Efficiency

Use repository context efficiently.

DO:

* search for exact symbols
* inspect relevant directories
* read targeted files
* follow imports only when needed
* inspect tests relevant to the changed behavior

DO NOT:

* recursively read every file
* repeatedly reopen files without reason
* read all documentation for small tasks
* inspect unrelated migrations
* explore unrelated features
* regenerate large files unnecessarily

Once enough information exists to safely implement the task, stop exploring and implement it.

---

# 18. Planning Policy

Small obvious changes can be implemented directly after inspecting the relevant code.

For larger or risky tasks, create a short internal implementation plan first.

A plan should identify:

* files likely involved
* existing implementation being reused
* required changes
* important risks
* verification steps

Do not spend excessive time producing elaborate plans for simple tasks.

Planning should reduce mistakes, not become another large task.

---

# 19. Handling Ambiguity

Do not guess important business behavior.

If the request is ambiguous but existing code clearly establishes the intended behavior, follow the existing pattern.

If there are multiple materially different implementations and choosing incorrectly could affect:

* payments
* customer data
* merchant data
* authentication
* authorization
* database structure
* destructive operations

ask for clarification before making the risky decision.

For minor implementation details, use the existing Storezn pattern instead of asking unnecessary questions.

---

# 20. Tests and Verification

Verification is mandatory.

After making changes, run the smallest relevant verification first.

Available commands should be confirmed from `package.json`.

Prefer:

1. Targeted relevant tests.
2. Relevant lint/type/static checks.
3. Broader tests only when the change warrants them.

Do not automatically run every test suite after every tiny UI edit.

For risky/shared changes, broader testing is appropriate.

Payment, authentication, database, tenant-resolution and shared infrastructure changes deserve stronger verification.

---

# 21. Existing Failures

If a test/lint/build failure existed before the change:

DO NOT modify unrelated code merely to make the entire repository green.

Determine whether the failure was introduced by your change.

Report unrelated pre-existing failures separately.

Only fix them when explicitly requested or when they block verification of the requested task.

---

# 22. Final Diff Review

Before considering the task complete, inspect the final diff.

Check for:

* accidental unrelated edits
* debug logs
* commented-out code
* unused imports
* duplicated logic
* accidental formatting churn
* secrets
* broken API contracts
* missing validation
* tenant isolation problems
* authorization regressions
* payment regressions

Remove accidental changes.

The final diff should contain only changes required for the task.

---

# 23. Do Not Hide Problems

If implementation reveals an architectural issue, security problem or unrelated bug:

Do not silently rewrite the system.

Complete the requested task safely if possible.

Then mention the discovered issue separately.

If the issue makes the requested implementation unsafe, stop and explain the blocker.

---

# 24. Git Rules

Do not:

* force push
* rewrite git history
* delete branches
* reset unrelated user changes
* discard existing uncommitted work
* commit secrets

Do not revert changes you did not create unless explicitly instructed.

Treat existing uncommitted changes as intentional user work.

---

# 25. Destructive Operations

Never perform destructive operations unless explicitly requested and clearly necessary.

Examples:

* dropping tables
* deleting production data
* deleting migrations
* removing user/store records
* resetting databases
* deleting storage objects
* destructive git commands

Prefer reversible changes.

---

# 26. Definition of Done

A task is complete only when:

* the requested behavior is implemented
* existing architecture was followed
* unrelated code was not modified
* relevant validation/security was preserved
* tenant isolation was preserved
* relevant verification was performed
* the final diff was reviewed

---

# 27. Final Response Format

Keep completion responses concise.

Report:

## Changed

Briefly explain what was implemented.

## Files

List the important files changed.

## Verification

State which tests/checks were run and their result.

## Notes

Only include this section when there are important limitations, assumptions, pre-existing failures or follow-up concerns.

Do not provide a long tutorial unless requested.

---

# 28. Task Priority

When instructions conflict, use this priority:

1. User's explicit request.
2. Security and data integrity.
3. Tenant isolation and authorization.
4. Existing Storezn architecture.
5. Existing API/database contracts.
6. Minimal change.
7. Code style/preferences.

Never sacrifice security, payment integrity or tenant isolation simply to minimize the diff.

---

# 29. Golden Rule

Understand first.

Reuse second.

Change the minimum necessary.

Verify afterward.

Do not "improve" unrelated parts of Storezn.

Do not run build, ask user to run build to save token.