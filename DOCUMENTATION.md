# Storezn — Technical Documentation

This document provides architectural context for developers and coding agents working on Storezn.

It explains how the application is organized, where important functionality lives, and the architectural principles that should be preserved when making changes.

This document is a guide.

The current application code and database schema are the final source of truth if implementation details differ from this document.

---

# 1. What is Storezn?

Storezn is a multi-tenant commerce platform that allows merchants/vendors to create and operate online stores.

The platform contains multiple major surfaces:

* Storezn public/marketing experience
* Vendor account/dashboard
* Merchant storefronts
* Customer shopping experience
* Product management
* Order management
* Checkout and payments
* POS functionality
* Merchant settings
* Store/domain management

Storezn should be treated as a multi-tenant application.

Changes involving merchant data must preserve tenant isolation.

---

# 2. Technology Stack

Core application technologies include:

* Next.js 16
* React 19
* Next.js App Router
* JavaScript
* PostgreSQL
* Drizzle ORM
* Zod
* Paystack
* Cloudinary / storage infrastructure
* SendPulse / email infrastructure

Additional dependencies and implementation details should always be confirmed from `package.json`.

Do not assume a package or service is still used solely because it appears in an old migration or historical file.

---

# 3. Repository Structure

Important top-level areas include:

```text
storezn/
├── app/
├── components/
├── lib/
├── public/
├── tests/
├── drizzle/
├── proxy.js
├── drizzle.config.js
├── package.json
├── AGENTS.md
└── DOCUMENTATION.md
```

The exact repository structure may evolve.

Search the repository before assuming a file location.

---

# 4. Application Directory

The main Next.js application lives under:

```text
app/
```

Storezn uses the Next.js App Router.

This directory contains application routes, layouts, pages, API endpoints and route-specific components.

When modifying a page, begin from the relevant route rather than scanning the entire `app/` directory.

---

# 5. Vendor Account / Dashboard

The vendor account is the merchant-facing management interface.

It allows merchants to manage areas such as:

* dashboard/overview
* products
* orders
* store configuration
* account/settings
* commerce operations
* POS functionality
* other merchant tools

The exact routes should be discovered from the current `app/` structure.

## Vendor UI principles

The vendor area should behave as one consistent application.

Shared patterns should be used for:

* page headers
* primary actions
* secondary actions
* navigation
* forms
* cards
* tables
* filters
* search
* pagination
* modals
* dropdowns
* loading states
* empty states
* error states
* destructive actions

Do not independently redesign individual vendor pages in ways that make them inconsistent with the rest of the dashboard.

When possible, improve shared components rather than duplicating implementations across pages.

---

# 6. Merchant Storefronts

Merchant storefronts are customer-facing stores belonging to individual Storezn merchants.

Storefront behavior is separate from the vendor dashboard.

A UI change requested for the vendor dashboard should not automatically affect storefront pages.

Storefront requests must resolve the correct merchant/store before exposing store-specific data.

---

# 7. Multi-Tenant Architecture

Multi-tenancy is one of the most important architectural characteristics of Storezn.

Stores may be resolved through mechanisms such as:

* Storezn subdomains
* custom domains
* store identifiers

Important store-resolution logic includes:

```text
proxy.js
lib/resolveStore.js
```

Always inspect the current implementation before modifying tenant routing.

## Tenant isolation

A request involving merchant-owned resources must only operate on resources the requester is authorized to access.

Examples include:

* products
* orders
* customers
* POS data
* settings
* payment information
* store configuration

Queries must preserve appropriate store/user ownership constraints.

Never remove tenant filtering simply because it appears redundant.

---

# 8. API Architecture

Storezn's primary application API routes live under:

```text
app/api/v1/
```

Before creating a new endpoint, search for an existing endpoint that already provides the required functionality.

API routes should generally follow existing Storezn conventions for:

* authentication
* authorization
* validation
* error handling
* response formatting
* database access

Avoid introducing a second API style when an established pattern exists.

---

# 9. Database

Storezn uses PostgreSQL.

Application database access is handled using Drizzle ORM.

The primary schema definition should be located under:

```text
lib/db/
```

with the current schema represented by:

```text
lib/db/schema.js
```

The current schema is the primary source of truth for application database structure.

Before using a database field, verify that it exists.

Do not invent table or column names based on assumptions.

---

# 10. Database Migrations

Database migrations should live under:

```text
drizzle/migrations/
```

Migration files should not normally be placed in the repository root.

Example:

```text
drizzle/
└── migrations/
    ├── 0001_*.sql
    ├── 0002_*.sql
    └── ...
```

The repository may contain historical SQL migrations from earlier Storezn development.

A historical migration describes a change made at a particular point in time.

It should NOT automatically be treated as a description of the current database.

When determining current database structure:

1. Inspect `lib/db/schema.js`.
2. Inspect current application queries.
3. Inspect relevant newer migrations if necessary.
4. Use historical migrations only when historical context is needed.

Do not edit already-applied historical migrations to make a new schema change.

Create a new migration instead.

---

# 11. Database Change Policy

Schema changes should be intentional.

Do not change the database schema simply because doing so makes a frontend implementation easier.

When a schema change is actually required:

1. Understand the existing schema.
2. Identify all affected queries.
3. Identify API consumers.
4. Create the appropriate migration.
5. Update the Drizzle schema.
6. Update relevant application code.
7. Verify backwards compatibility where appropriate.
8. Test affected functionality.

Database changes involving payments, orders or merchant ownership require additional care.

---

# 12. Validation

Shared validation logic lives under:

```text
lib/validate.js
```

and potentially related validation modules.

Use existing validation utilities before creating new ones.

Validation should happen at trust boundaries.

Client-side validation improves UX but must not replace server-side validation.

Never assume client-submitted data is trustworthy.

---

# 13. Authentication

Authentication protects access to user/vendor functionality.

Before modifying authentication behavior, inspect the current implementation and existing helpers.

Do not implement another authentication mechanism simply because it is convenient for one feature.

Authentication answers:

> Who is this user?

Authorization answers:

> Is this user allowed to perform this action?

Both must be considered for protected operations.

---

# 14. Authorization

Authorization is particularly important in a multi-tenant application.

Protected operations should verify appropriate ownership or permissions.

Do not trust IDs submitted by the client as proof of ownership.

Examples:

A vendor submitting a product ID does not automatically mean that vendor owns the product.

A vendor submitting an order ID does not automatically mean that vendor has permission to modify the order.

Follow existing Storezn authorization patterns.

---

# 15. Products

Products belong to stores/vendors.

Product functionality may include:

* creation
* editing
* deletion
* inventory
* images
* pricing
* variants/options
* availability
* storefront display
* POS integration

Before changing product behavior, inspect both the vendor-management implementation and any customer/POS consumers affected by the change.

Do not assume the vendor product page is the only consumer of product data.

---

# 16. Orders

Orders are important commerce records.

Order functionality may be consumed by:

* vendor dashboard
* customer checkout
* payment processing
* POS
* reporting
* email/notification systems

Changes to order structure or status behavior should therefore be treated as cross-cutting changes.

Before changing order logic, search for all important consumers of the relevant fields/statuses.

---

# 17. Payments

Storezn uses Paystack for payment functionality.

Relevant shared payment logic includes:

```text
lib/paystack.js
```

Always inspect the current implementation before modifying payment behavior.

Payment flows can involve:

```text
Customer
   ↓
Storefront
   ↓
Checkout API
   ↓
Paystack
   ↓
Verification / webhook
   ↓
Storezn database
   ↓
Order/payment state
```

The exact implementation must be confirmed from current code.

## Payment rules

Never expose secret Paystack credentials to the browser.

Never trust client-side payment success as authoritative.

Server-side verification/webhook logic should determine authoritative payment state according to the existing implementation.

Preserve payment references and idempotency behavior.

Avoid creating duplicate transactions or orders.

Payment-related changes require stronger testing than ordinary UI changes.

---

# 18. Paystack Merchant Payments

Storezn may use Paystack merchant/sub-account or split-payment functionality.

Before modifying:

* merchant payment configuration
* subaccounts
* split payments
* settlement behavior
* platform fees

inspect the complete existing payment implementation.

Do not infer current financial behavior from old documentation.

Payment behavior must match current code and Paystack integration logic.

---

# 19. Storage

Shared storage functionality lives under:

```text
lib/storage/
```

Storezn may use Cloudinary and/or other storage infrastructure depending on the feature.

Use the existing storage abstraction rather than integrating directly with another provider from individual pages.

Before implementing uploads:

1. Find existing upload functionality.
2. Follow existing storage patterns.
3. Follow existing file validation rules.
4. Preserve security restrictions.
5. Handle failures appropriately.

Do not expose server-side storage credentials.

---

# 20. Email

Shared email functionality lives under:

```text
lib/email/
```

Storezn uses existing email infrastructure for transactional communication.

Before adding a new email provider or client, inspect the existing email implementation.

Prefer extending the current email system.

Email failures should not silently corrupt commerce operations.

For example, failure to send an order notification should not automatically mean the underlying successful order/payment should be reversed unless the existing business logic explicitly requires that behavior.

---

# 21. POS

Storezn contains Point of Sale functionality.

POS is related to commerce but may have different requirements from normal online storefront checkout.

POS functionality can involve:

* products
* inventory
* orders
* payments
* devices
* cash movements
* transaction synchronization
* transaction idempotency
* history/auditing

The repository contains migrations related to different stages of POS development.

Do not determine current POS behavior solely from migration filenames.

Inspect current POS application code, schema and tests.

---

# 22. POS Reliability

POS changes should pay special attention to:

* duplicate transactions
* inventory consistency
* cash movement accuracy
* synchronization
* device identity
* order state
* transaction history

Operations that may be retried should preserve idempotency where the current architecture supports it.

Financial records should not be duplicated because a client retried a request.

---

# 23. UI Architecture

Reusable UI components live primarily under:

```text
components/
```

Before creating a component, search for an existing equivalent.

The application should avoid having multiple slightly different implementations of the same basic interface.

Examples:

* buttons
* dialogs
* inputs
* cards
* tables
* dropdowns
* loading states
* pagination
* filters

Shared components should remain flexible enough for their actual consumers without becoming unnecessarily abstract.

---

# 24. UI/UX Principles

Storezn interfaces should prioritize usability over decoration.

The vendor dashboard should feel:

* professional
* modern
* lightweight
* consistent
* responsive
* easy to scan

Primary actions should be obvious.

Secondary actions should not compete visually with primary actions.

Destructive actions should be clearly distinguished.

Users should receive feedback when operations:

* start
* succeed
* fail
* are unavailable

Loading and disabled states should prevent accidental repeated actions where appropriate.

---

# 25. Responsive Design

Storezn should remain usable across:

* desktop
* tablet
* mobile

Responsive design should consider behavior, not just dimensions.

A desktop toolbar may need to reorganize on mobile.

A large table may require a different presentation or controlled horizontal scrolling.

Important actions should remain discoverable.

Forms should remain easy to complete.

Modals should remain usable on small screens.

Avoid creating desktop-only workflows.

---

# 26. Forms

Forms should provide:

* clear labels
* understandable validation
* appropriate input types
* useful error messages
* loading states
* disabled states when appropriate
* success/failure feedback

Avoid clearing user input unexpectedly after errors.

Prevent duplicate submissions where appropriate.

Client-side validation is for usability.

Server-side validation is required for security and correctness.

---

# 27. Loading States

Users should understand when the application is working.

Use appropriate existing patterns such as:

* button loading indicators
* skeletons
* progress indicators
* disabled controls

Avoid blocking the entire interface unnecessarily.

Avoid allowing the same important action to be submitted repeatedly while already processing.

---

# 28. Empty States

Empty states should explain what is missing and, where useful, provide the next logical action.

Example:

Instead of only:

```text
No products
```

a product page could communicate:

```text
You haven't added any products yet.

[Add product]
```

Follow existing Storezn tone and component patterns.

---

# 29. Error Handling

Errors should be useful to both users and developers.

User-facing errors should explain what the user can reasonably do next without exposing internal system details.

Server errors should not expose:

* credentials
* SQL details
* internal stack traces
* secrets

Use existing error handling patterns.

---

# 30. Destructive Actions

Actions such as deleting important resources should be clearly distinguishable from normal actions.

Where appropriate, require confirmation.

Examples include:

* deleting products
* removing important settings
* destructive POS actions
* deleting store resources

Do not introduce unnecessary confirmations for harmless actions.

---

# 31. Performance

Avoid unnecessary client-side work.

Prefer server-side functionality when consistent with the existing architecture.

Do not add `"use client"` to large trees merely because one small interaction requires client state.

Avoid unnecessary requests and duplicate data fetching.

Reuse existing data where appropriate.

Do not prematurely optimize without evidence of a problem.

---

# 32. Dependencies

Before installing a package, check whether:

* an existing dependency already provides the functionality
* an existing Storezn helper already solves the problem
* the feature can reasonably be implemented without another dependency

Avoid dependencies for trivial functionality.

Do not upgrade unrelated packages during feature work.

---

# 33. Testing

Tests live primarily under:

```text
tests/
```

The available commands are defined in:

```text
package.json
```

Use the smallest relevant test scope first.

Examples:

```text
UI change
→ relevant lint/static checks

API behavior
→ relevant API/unit tests

POS change
→ relevant POS tests

Shared commerce/payment change
→ targeted tests + broader relevant regression tests
```

Do not automatically run every available test for a trivial styling change.

Do run stronger verification for shared or high-risk functionality.

---

# 34. Security

Security-sensitive areas include:

* authentication
* authorization
* tenant isolation
* payments
* database queries
* file uploads
* merchant data
* customer data
* POS transactions

Never expose:

* environment secrets
* API secret keys
* database credentials
* JWT secrets
* payment secret keys

Do not move server-only logic into browser code.

Do not weaken authorization simply to resolve an application error.

---

# 35. Environment Variables

Environment variables are used for external services and infrastructure.

Exact variable names should be discovered from:

* existing code
* environment examples if available
* deployment configuration

Never hardcode production credentials.

Never commit `.env` contents.

Public/client environment variables must only contain values safe to expose to the browser.

---

# 36. Source of Truth

When information conflicts, use this priority:

1. Current database/application behavior
2. Current application code
3. Current Drizzle schema
4. Current configuration
5. Current tests
6. This documentation
7. Historical migrations or outdated comments

Documentation should be updated when significant architectural behavior changes.

---

# 37. Architecture Change Policy

Do not introduce a new architecture for a single feature without a strong reason.

Prefer existing Storezn patterns.

Examples:

If Storezn already has:

```text
lib/storage/
```

extend it instead of integrating storage directly into a page.

If Storezn already has:

```text
lib/paystack.js
```

extend it instead of creating another Paystack implementation.

If Storezn already has shared validation, use it.

Consistency reduces bugs and maintenance cost.

---

# 38. Feature Development Workflow

For normal feature development:

```text
Understand request
      ↓
Find existing implementation
      ↓
Identify relevant files
      ↓
Check shared helpers
      ↓
Implement smallest change
      ↓
Verify
      ↓
Review diff
```

Avoid:

```text
Request
   ↓
Create entirely new implementation
   ↓
Discover existing implementation later
   ↓
Refactor everything
```

---

# 39. High-Risk Changes

Treat these as high-risk:

* payment logic
* authentication
* authorization
* tenant resolution
* database schema
* order state
* inventory integrity
* POS financial records
* webhooks
* destructive operations

For high-risk changes:

1. Trace the complete relevant flow.
2. Understand existing safeguards.
3. Make the smallest safe change.
4. Run targeted tests.
5. Run broader relevant tests when appropriate.
6. Inspect the final diff carefully.

---

# 40. Low-Risk Changes

Examples:

* spacing
* button positioning
* typography
* copy
* responsive layout
* minor component styling

These generally should not trigger exploration of:

* database schema
* payments
* authentication
* migrations
* unrelated APIs

Keep investigation proportional to the task.

This is important for both development speed and coding-agent context efficiency.

---

# 41. Relationship With AGENTS.md

`AGENTS.md` and `DOCUMENTATION.md` serve different purposes.

## AGENTS.md

Defines:

> How should a coding agent behave while working in this repository?

It contains rules about:

* exploration
* editing
* verification
* scope
* safety
* context efficiency

## DOCUMENTATION.md

Defines:

> How is Storezn organized and how do its major systems relate?

Agents should not need to read this entire document for every task.

Read only the relevant sections when architectural understanding is required.

---

# 42. Maintaining This Documentation

Update this document when major architectural changes occur.

Examples:

* payment provider changes
* authentication architecture changes
* storage provider changes
* database architecture changes
* tenant resolution changes
* major vendor dashboard restructuring
* POS architecture changes

Do not update documentation for every minor UI change.

Keep documentation useful and reasonably concise.

---

# 43. Core Storezn Principles

When making technical decisions, preserve these principles:

### Tenant isolation

One merchant must not accidentally access another merchant's private resources.

### Commerce integrity

Orders, inventory and payments must remain consistent.

### Security

Sensitive operations must be authenticated, authorized and validated.

### Reuse

Use existing Storezn infrastructure before creating another implementation.

### Consistency

Vendor-facing interfaces should feel like one application.

### Minimal change

Solve the requested problem without unnecessarily changing unrelated systems.

### Verification

Changes are not complete until relevant behavior has been checked.
