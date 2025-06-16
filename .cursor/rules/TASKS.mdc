# LENGOLF VIP Feature - Development Tasks

This document outlines the development tasks for implementing the LENGOLF VIP feature. Tasks are divided between Backend (BE) and Frontend (FE) developers.

## Task Tracking Format

Each task will follow this format:

```
**Task ID:** VIP-[BE/FE]-XXX
**Title:** Brief description of the task
**Assignee:** BE Developer / FE Developer
**Status:** To Do | In Progress | In Review | Done
**Priority:** High | Medium | Low
**Description:** Detailed explanation of the task, referencing relevant documents (e.g., TECHNICAL_DESIGN_LENGOLF_VIP.md, DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md, UI_INSTRUCTIONS_VIP_LANDING_PAGE.md) and existing code where applicable.
**Dependencies:** Task IDs this task depends on (e.g., VIP-BE-001)
**Acceptance Criteria:**
  - AC1
  - AC2
```

## Backend Tasks (BE Developer)

**Note:** All new API endpoints should be created under the `app/api/vip/` directory to maintain consistency with the existing project structure.

---

**Task ID:** VIP-BE-001
**Title:** Database Schema Modifications - `profiles` Table
**Assignee:** BE Developer
**Status:** Done
**Priority:** High
**Description:** Add `marketing_preference` column to the `profiles` table as specified in `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 3.1). Includes writing and applying the SQL migration script.
**Dependencies:** None
**Acceptance Criteria:**
  - `profiles` table has a `marketing_preference` column (BOOLEAN, NOT NULL, DEFAULT TRUE).
  - Migration script correctly updates existing rows and sets default for new rows.

---

**Task ID:** VIP-BE-002
**Title:** Implement RLS Policies
**Assignee:** BE Developer
**Status:** Done
**Priority:** High
**Description:** Implement and apply Row Level Security (RLS) policies for `profiles`, `bookings`, `crm_customer_mapping`, `customers`, and `crm_packages` tables as detailed in `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 3.4). Verify `auth.uid()` usage. Review impact on `anon` role.
**Dependencies:** VIP-BE-001
**Acceptance Criteria:**
  - RLS policies are active on the specified tables.
  - Users can only access/modify their own data as per policy definitions.
  - Access for `service_role` is maintained.
  - `anon` role access is reviewed and configured appropriately.

---

**Task ID:** VIP-BE-003
**Title:** Develop API Endpoint - `GET /api/vip/status`
**Assignee:** BE Developer
**Status:** Done
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/status/route.ts` to check user's CRM linking status as specified in `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.1). Requires NextAuth authentication.
**Dependencies:** VIP-BE-001, VIP-BE-002
**Acceptance Criteria:**
  - Endpoint returns `linked_matched`, `linked_unmatched`, or `not_linked` status correctly.
  - Returns `crmCustomerId` and `stableHashId` when matched.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-004
**Title:** Develop API Endpoint - `POST /api/vip/link-account`
**Assignee:** BE Developer
**Status:** Done
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/link-account/route.ts` for manual account linking via phone number, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.2). Implement matching logic.
**Dependencies:** VIP-BE-001, VIP-BE-002
**Acceptance Criteria:**
  - Endpoint accepts `phoneNumber` in the request body.
  - Successfully links account and updates `crm_customer_mapping` if a high-confidence match is found.
  - Returns appropriate success or error (not found) response.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-005
**Title:** Develop API Endpoint - `GET /api/vip/profile`
**Assignee:** BE Developer
**Status:** Done
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/profile/route.ts` to fetch authenticated user's profile data, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.3). Combines data from `profiles` and linked `customers` table.
**Dependencies:** VIP-BE-001, VIP-BE-002, VIP-BE-003
**Acceptance Criteria:**
  - Endpoint returns user's name, email, phone number (from `customers` if matched), `pictureUrl`, and `marketingPreference`.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-006
**Title:** Develop API Endpoint - `PUT /api/vip/profile`
**Assignee:** BE Developer
**Status:** Done
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/profile/route.ts` (using PUT method) to update user's editable profile data (`name`, `email`, `marketingPreference`), as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.4).
**Dependencies:** VIP-BE-001, VIP-BE-002, VIP-BE-005
**Acceptance Criteria:**
  - Endpoint accepts optional `name`, `email`, `marketingPreference` in the request body.
  - Updates the `profiles` table for the authenticated user.
  - Returns success response with a list of updated fields.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-007
**Title:** Develop API Endpoint - `GET /api/vip/bookings`
**Assignee:** BE Developer
**Status:** Done
**Priority:** High
**Description:** Create the endpoint at `app/api/vip/bookings/route.ts` to fetch user's past and future bookings, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.5). Implement pagination and filtering.
**Dependencies:** VIP-BE-002
**Acceptance Criteria:**
  - Endpoint returns bookings for the authenticated user.
  - Supports `page`, `limit`, and `filter` (future, past, all) query parameters.
  - Returns pagination metadata.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-008
**Title:** Develop API Endpoint - `PUT /api/vip/bookings/{bookingId}/modify`
**Assignee:** BE Developer
**Status:** Done
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/bookings/[bookingId]/modify/route.ts` to modify a future, confirmed booking, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.6). Includes availability check and async tasks for calendar/notifications.
**Dependencies:** VIP-BE-002, VIP-BE-007, VIP-BE-014
**Acceptance Criteria:**
  - Endpoint accepts `date`, `startTime`, `duration` in the request body.
  - Verifies booking ownership, status, and future date.
  - Calls availability check; returns 409 if slot unavailable.
  - Updates booking details if available.
  - Triggers async Google Calendar update and Staff Notification.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-009
**Title:** Develop API Endpoint - `POST /api/vip/bookings/{bookingId}/cancel`
**Assignee:** BE Developer
**Status:** Done
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/bookings/[bookingId]/cancel/route.ts` to cancel a future, confirmed booking, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.7). Includes async tasks for calendar/notifications.
**Dependencies:** VIP-BE-002, VIP-BE-007
**Acceptance Criteria:**
  - Verifies booking ownership, status, and future date.
  - Updates booking status to 'cancelled'.
  - Triggers async Google Calendar update and Staff Notification.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-010
**Title:** Develop API Endpoint - `GET /api/vip/packages`
**Assignee:** BE Developer
**Status:** Done
**Priority:** Medium
**Description:** Create the endpoint at `app/api/vip/packages/route.ts` to fetch user's active and past packages, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 4.8). Requires linked CRM customer.
**Dependencies:** VIP-BE-002, VIP-BE-003
**Acceptance Criteria:**
  - Returns active and past packages if user is linked and matched.
  - Returns empty lists if user is not matched.
  - Endpoint is protected and requires authentication.

---

**Task ID:** VIP-BE-011
**Title:** Core Logic - Adapt `getOrCreateCrmMapping` for Placeholder Creation
**Assignee:** BE Developer
**Status:** Done
**Priority:** High
**Description:** Modify `utils/customer-matching.ts` (function `getOrCreateCrmMapping` or similar logic called from NextAuth callbacks in `app/api/auth/options.ts`) to create placeholder `crm_customer_mapping` records (`is_matched = false`) if no CRM match is found during user sign-in/session validation. See `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 6) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.1, Step 5).
**Dependencies:** VIP-BE-001
**Acceptance Criteria:**
  - When a new user signs in and no CRM match is found, a placeholder record is created in `crm_customer_mapping`.
  - `is_matched` is set to `false`, `crm_customer_id` and `stable_hash_id` are `NULL`.
  - If a match is found, `is_matched` is `true` and IDs are populated.

---

**Task ID:** VIP-BE-012
**Title:** Core Logic - Staff Notifications for Booking Changes
**Assignee:** BE Developer
**Status:** Done
**Priority:** Medium
**Description:** Implement or adapt functions in `lib/lineNotifyService.ts` to send staff notifications for VIP booking modifications and cancellations, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 6).
**Dependencies:** VIP-BE-008, VIP-BE-009
**Acceptance Criteria:**
  - Staff receive LINE notifications when a VIP modifies a booking.
  - Staff receive LINE notifications when a VIP cancels a booking.
  - Notifications are triggered asynchronously.

---

**Task ID:** VIP-BE-013
**Title:** Core Logic - Google Calendar Updates for Booking Changes
**Assignee:** BE Developer
**Status:** Done
**Priority:** Medium
**Description:** Implement or adapt async handlers for Google Calendar updates (event move/resize/delete) when VIPs modify or cancel bookings, as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 6). This might involve reusing or adapting logic related to `app/api/bookings/calendar/create/route.ts`.
**Dependencies:** VIP-BE-008, VIP-BE-009
**Acceptance Criteria:**
  - Google Calendar events are updated/deleted when a VIP modifies/cancels a booking.
  - Updates are handled asynchronously.
  - Robust error handling for calendar API interactions.

---

**Task ID:** VIP-BE-014
**Title:** Review and Adapt Existing Availability Check API
**Assignee:** BE Developer
**Status:** Done
**Priority:** Medium
**Description:** Review `app/api/availability/check/route.ts` for use by the booking modification logic (`VIP-BE-008`). Ensure it correctly handles the `duration` parameter and other requirements for VIP modifications.
**Dependencies:** VIP-BE-008
**Acceptance Criteria:**
  - Availability check API (`app/api/availability/check/route.ts`) is suitable and correctly integrated for VIP booking modifications.

---

## Frontend Tasks (FE Developer)

**Note on Integration:** The VIP feature frontend will be integrated into the main `lengolf-booking-refactor` Next.js application. Code from the `lengolf-vip-dashboard-view` project (likely a UI prototype) should be migrated and adapted to fit this structure:
*   **Pages:** Under `app/(features)/vip/` (e.g., `app/(features)/vip/dashboard/page.tsx`, `app/(features)/vip/profile/page.tsx`). The main landing page for VIP could be `app/(features)/vip/page.tsx`.
*   **Layout:** A main layout for the VIP section at `app/(features)/vip/layout.tsx`.
*   **Reusable Components:** In `components/vip/` (at the project root, alongside existing `components/ui/`, `components/shared/`).
*   **Page-Specific Components:** Can be co-located within the respective page directories under `app/(features)/vip/` or placed in `components/vip/` if preferred.

---

**Task ID:** VIP-FE-000
**Title:** Scaffold VIP Feature Structure and Migrate UI Code
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the necessary directory structure for the VIP feature within the `lengolf-booking-refactor` project (i.e., `app/(features)/vip/`, `components/vip/`). Migrate relevant React components and page structures from `lengolf-vip-dashboard-view` into this new structure. Adapt imports and basic configurations as needed for Next.js compatibility.
**Dependencies:** None
**Acceptance Criteria:**
  - VIP feature directories (`app/(features)/vip/`, `components/vip/`) are created.
  - Core UI components and page layouts from `lengolf-vip-dashboard-view` are moved to the new structure.
  - Basic rendering of migrated components within the Next.js environment is functional (data integration will follow).

---

**Task ID:** VIP-FE-001
**Title:** Setup API Service Layer for VIP Endpoints
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create or update services (e.g., in a new `lib/vipService.ts` or adapt `lengolf-vip-dashboard-view/src/services/vipService.ts` and place it appropriately) to interact with all new BE VIP API endpoints (`/api/vip/*`).
**Dependencies:** All VIP-BE API tasks (VIP-BE-003 to VIP-BE-010), VIP-FE-000
**Acceptance Criteria:**
  - Functions exist to call each VIP backend API.
  - Handles request/response typing according to API specifications.
  - Includes error handling.

---

**Task ID:** VIP-FE-002
**Title:** Implement VIP Layout (`app/(features)/vip/layout.tsx`) Authentication and Status Handling
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create and implement `app/(features)/vip/layout.tsx`. This layout should handle NextAuth authentication checks for all VIP pages. Fetch VIP status (`GET /api/vip/status`) and make it available (e.g., via context or props) to child pages to control content visibility based on `is_matched` status as per `TECHNICAL_DESIGN_LENGOLF_VIP.md` (Section 5) and `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md`.
**Dependencies:** VIP-BE-003, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Users are redirected if not authenticated when accessing VIP routes.
  - VIP status is fetched and stored appropriately.
  - The layout provides a consistent structure for VIP pages (e.g., navigation specific to VIP area).
  - Content within VIP sections dynamically changes based on `is_matched` status.

---

**Task ID:** VIP-FE-003
**Title:** Integrate VIP Landing Page / Dashboard View (`app/(features)/vip/page.tsx` or `/dashboard/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Adapt the `DashboardView` component (migrated from `lengolf-vip-dashboard-view/src/components/vip/DashboardView.tsx` to `components/vip/DashboardView.tsx`) and use it in the main VIP landing page (e.g., `app/(features)/vip/page.tsx`). Connect with live data from `GET /api/vip/status`, `GET /api/vip/profile` (for username), `GET /api/vip/bookings` (for next booking), and `GET /api/vip/packages` (for active packages count). Ensure it reflects Scenarios A & B from `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 3.2).
**Dependencies:** VIP-BE-003, VIP-BE-005, VIP-BE-007, VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Dashboard displays "Welcome back, [User's Display Name]!".
  - If `is_matched = true`:
    - Shows "Next Upcoming Booking" snippet or "No upcoming bookings" message.
    - Shows "Active Packages" snippet or "No active packages" message.
    - Shows navigation CTAs to Profile, Bookings, Packages (using `DashboardCard.tsx` component from `components/vip/`).
  - If `is_matched = false`:
    - Shows "Link Your Account" prompt (using `LinkAccountPrompt.tsx` from `components/vip/`) prominently.
    - CTA links to the manual account linking page (`app/(features)/vip/link-account/page.tsx`).
    - Shows limited navigation (e.g., Profile).

---

**Task ID:** VIP-FE-004
**Title:** Implement/Integrate Manual Account Linking Page (`app/(features)/vip/link-account/page.tsx`)
**Assignee:** FE Developer
**Status:** To Do
**Priority:** High
**Description:** Create the `app/(features)/vip/link-account/page.tsx` page. Adapt `ManualLinkAccountForm` (or `LinkAccount.tsx` from `lengolf-vip-dashboard-view/src/pages/`, placing the form component in `components/vip/ManualLinkAccountForm.tsx` or co-locating). This page allows users with `is_matched = false` to attempt linking via phone number using `POST /api/vip/link-account`. Handle loading, success (redirect), and error states. See `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Scenario B) and `DESIGN_LENGOLF_VIP_LINE_INTEGRATION.md` (Section 2.1, Step 6).
**Dependencies:** VIP-BE-004, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Page is accessible, especially when `is_matched = false`.
  - Form submits phone number to the backend.
  - Displays loading state during API call.
  - On success, redirects to VIP dashboard or main VIP page.
  - Displays error messages from backend if linking fails (e.g., "No matching customer account found.").

---

**Task ID:** VIP-FE-005
**Title:** Integrate Profile View and Edit Page (`app/(features)/vip/profile/page.tsx`)
**Assignee:** FE Developer
**Status:** Done
**Priority:** Medium
**Description:** Create `app/(features)/vip/profile/page.tsx`. Adapt `ProfileView` (or `VipProfile.tsx` from `lengolf-vip-dashboard-view`, potentially placing the view/form component in `components/vip/ProfileView.tsx`) to connect with `GET /api/vip/profile` to display user data and `PUT /api/vip/profile` to update name, email, and marketing preference. Ensure phone number from linked CRM (if available) is displayed but not editable.
**Dependencies:** VIP-BE-005, VIP-BE-006, VIP-FE-000, VIP-FE-001
**Acceptance Criteria:**
  - Profile page displays data fetched from the backend.
  - User can edit their name, email, and marketing preference (and potentially a separate VIP phone number).
  - Changes are saved via the backend API.
  - Phone number is displayed correctly (from CRM if matched and available, non-editable by this form if it's the CRM primary).
  - (User Note: Requires installation of `react-hook-form`, `zod`, `@hookform/resolvers/zod` and ShadCN components: `input`, `form`, `checkbox`, `card`, `alert`)

---

**Task ID:** VIP-FE-006
**Title:** Integrate Bookings List Page (`app/(features)/vip/bookings/page.tsx`)
**Assignee:** FE Developer
**Status:** Done
**Priority:** High
**Description:** Create `app/(features)/vip/bookings/page.tsx`. Adapt `BookingsView` (or `pages/vip-bookings.tsx` from `lengolf-vip-dashboard-view`, consider `components/vip/BookingsList.tsx`) to connect with `GET /api/vip/bookings`. Implement filters (future/past/all) and pagination. Display `EmptyState` (VIP-FE-010) if no bookings or if `is_matched = false`. "Modify" / "Cancel" buttons for relevant bookings should trigger modals (VIP-FE-007, VIP-FE-008).
**Dependencies:** VIP-BE-007, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Page lists bookings fetched from the backend.
  - Filtering by future/past/all works correctly.
  - Pagination is functional.
  - Displays an empty state when no bookings are available or if the user is not matched.
  - Modify/Cancel buttons are present for applicable bookings (e.g., future, confirmed).
  - (User Note: Requires installation of ShadCN components: `tabs`, `table`, `pagination` for the `BookingsList` component, and `button` if not already added globally for the page.)

---

**Task ID:** VIP-FE-007
**Title:** Implement/Integrate Booking Modification Modal
**Assignee:** FE Developer
**Status:** Done
**Priority:** Medium
**Description:** Develop/Integrate `BookingModifyModal` (likely as a component in `components/vip/BookingModifyModal.tsx`). The modal should inform the user that to modify a booking, they need to cancel the current one and create a new one. It should offer a button like "Cancel Booking & Rebook". Clicking this button will:
    1. Initiate the cancellation process for the current booking (potentially reusing `BookingCancelModal` logic or directly calling `POST /api/vip/bookings/{id}/cancel`).
    2. On successful cancellation, redirect the user to the main booking page (`/bookings`) to make a new reservation.
    Handle loading/error states for the cancellation part.
**Dependencies:** VIP-BE-009, VIP-FE-000, VIP-FE-001, VIP-FE-006, VIP-FE-008
**Acceptance Criteria:**
  - Modal clearly explains the cancel-and-rebook process.
  - "Cancel Booking & Rebook" button triggers booking cancellation using `POST /api/vip/bookings/{id}/cancel`.
  - Handles success (booking is cancelled, user is redirected to `/bookings`) and error messages for the cancellation.
  - UI on the bookings list is updated or refetched after successful cancellation and redirection.

---

**Task ID:** VIP-FE-008
**Title:** Implement/Integrate Booking Cancellation Modal
**Assignee:** FE Developer
**Status:** Done
**Priority:** Medium
**Description:** Develop/Integrate `BookingCancelModal` (component in `components/vip/BookingCancelModal.tsx`). This modal should confirm cancellation with the user. On confirmation, call `POST /api/vip/bookings/{id}/cancel`. Handle loading/error states. On success, it should update the UI (e.g., refetch bookings list, show a success message).
**Dependencies:** VIP-BE-008, VIP-FE-000, VIP-FE-001, VIP-FE-006
**Acceptance Criteria:**
  - Modal shows confirmation prompt for cancellation.
  - Cancellation request is submitted to the backend.
  - Handles success (update UI) and error messages.

---

**Task ID:** VIP-FE-009
**Title:** Integrate Packages List Page (`app/(features)/vip/packages/page.tsx`)
**Assignee:** FE Developer
**Status:** Done
**Priority:** Medium
**Description:** Create `app/(features)/vip/packages/page.tsx`. Adapt `PackagesView` (or relevant component from prototype, possibly `components/vip/PackagesList.tsx`) to connect with `GET /api/vip/packages`. Display current/active packages and past/expired packages (potentially using tabs).
**Dependencies:** VIP-BE-010, VIP-FE-000, VIP-FE-001, VIP-FE-002
**Acceptance Criteria:**
  - Page lists packages fetched from the backend.
  - Distinction between active and past packages is clear.
  - If no packages, an appropriate message (`EmptyState` from VIP-FE-010) is shown.
  - Displays relevant package details (name, credits/sessions remaining, expiry).
  - User Note: Requires ShadCN components: `tabs`, `card`.

---

**Task ID:** VIP-FE-010
**Title:** Implement `EmptyState` Component (`components/vip/EmptyState.tsx`)
**Assignee:** FE Developer
**Status:** Done
**Priority:** Medium
**Description:** Create a reusable `EmptyState` component. It should accept props for title, message, and an optional action (e.g., a button with a link or onClick handler). This will be used in Bookings, Packages, etc., when no data is available for the current view/filters.
**Dependencies:** VIP-FE-000
**Acceptance Criteria:**
  - `EmptyState` component is well-defined and reusable in `components/vip/`.
  - Correctly displayed in relevant sections with appropriate messages and CTAs (e.g., "Link your account").

---

**Task ID:** VIP-FE-011
**Title:** Styling and Responsiveness Review
**Assignee:** FE Developer
**Status:** In Progress
**Priority:** Medium
**Description:** Review all VIP pages and components against `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` for styling (Tailwind CSS, brand consistency, colors, typography) and responsiveness (especially for LIFF mobile view). Ensure consistency with the main `lengolf-booking-refactor` project's `tailwind.config.ts` and `app/globals.css`.
**Dependencies:** All other VIP-FE integration tasks (VIP-FE-002 to VIP-FE-010).
**Acceptance Criteria:**
  - UI adheres to `tailwind.config.ts` and `app/globals.css` of the main project.
  - All pages are responsive and work well on desktop, tablet, and mobile (LIFF).
  - Visual style matches design document requirements (modern, clean, Lengolf branding).

---

**Task ID:** VIP-FE-012
**Title:** Error Handling and Loading States
**Assignee:** FE Developer
**Status:** In Progress
**Priority:** Medium
**Description:** Implement consistent loading indicators (spinners, skeleton screens) and user-friendly error messages for all data fetching and mutation operations across the VIP section, as per `UI_INSTRUCTIONS_VIP_LANDING_PAGE.md` (Section 4). Utilize existing UI components from `components/ui` or ShadCN if applicable and consistent.
**Dependencies:** All data-dependent VIP-FE tasks.
**Acceptance Criteria:**
  - Loading states are shown during API calls.
  - User-friendly error messages are displayed for API failures or validation issues.
  - Toasts or inline messages are used consistently for feedback.

---

**Task ID:** VIP-FE-013
**Title:** LIFF Integration Considerations
**Assignee:** FE Developer
**Status:** In Progress
**Priority:** Medium
**Description:** Ensure that the VIP pages within `lengolf-booking-refactor` are compatible with being rendered inside a LINE LIFF view. This includes testing navigation, responsiveness, and any LIFF-specific API interactions if necessary.
**Dependencies:** VIP-FE-011
**Acceptance Criteria:**
  - VIP pages render correctly within a LIFF environment.
  - UI is optimized for mobile view within LIFF.

--- 

## Deployment Tasks for VIP Feature & RLS

These tasks focus on the deployment and RLS finalization for the VIP feature, drawing from `RLS_IMPLEMENTATION_TASKS.md` and `AUTH_RLS_DISCOVERY_LOG.md`.

---

**Task ID:** VIP-DEPLOY-001
**Title:** Finalize RLS Policies for Production VIP Tables
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** Review and confirm the RLS policies for `public.vip_customer_data` and `public.vip_tiers` (as defined in `TECHNICAL_DESIGN_LENGOLF_VIP.md`, Section 3.6) are production-ready. Ensure they correctly use `auth.uid()` and provide appropriate access for users and service roles.
**Dependencies:** VIP-BE-002 (general RLS setup)
**Acceptance Criteria:**
  - RLS policies for `vip_customer_data` and `vip_tiers` are finalized and scriptable for production.
  - Policies cover SELECT, INSERT, UPDATE, DELETE for authenticated users on their own data (via `vip_customer_data_id` link in `profiles_vip_staging`) and appropriate access to `vip_tiers` (e.g., authenticated read).

---

**Task ID:** VIP-DEPLOY-002
**Title:** Verify Production Application Compatibility with RLS on Core Tables
**Assignee:** BE Developer / QA Team
**Status:** To Do
**Priority:** Critical
**Description:** Before VIP launch, ensure the *existing production application* correctly populates user identifier columns (e.g., `user_id` in `bookings`, `profile_id` in `crm_customer_mapping`) that are used by RLS policies. This aligns with Phase 1 of `RLS_IMPLEMENTATION_TASKS.md`.
**Dependencies:** RLS-P1-001, RLS-P1-002, RLS-P1-003 (from `RLS_IMPLEMENTATION_TASKS.md`)
**Acceptance Criteria:**
  - Confirmation that the current live application sets all necessary foreign keys/user IDs required by RLS policies on core tables (`profiles`, `bookings`, `crm_customer_mapping`).

---

**Task ID:** VIP-DEPLOY-003
**Title:** Prepare RLS Rollback Scripts for All Relevant Production Tables
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** Create and test SQL scripts to quickly disable and remove RLS policies from all relevant production tables (`profiles`, `bookings`, `crm_customer_mapping`, `vip_customer_data`, `vip_tiers`) in case of emergency during or post-deployment. (Ref: `RLS-P4.1-001`)
**Dependencies:** VIP-DEPLOY-001
**Acceptance Criteria:**
  - Rollback scripts are documented, tested in a non-prod environment, and readily available.

---

**Task ID:** VIP-DEPLOY-004
**Title:** Schedule Maintenance Window for VIP Launch & RLS Finalization
**Assignee:** Project Lead / Platform Team
**Status:** To Do
**Priority:** High
**Description:** Plan and communicate a maintenance window for VIP feature deployment and the final application of RLS policies to production tables. (Ref: `RLS-P4.1-002`)
**Dependencies:** None
**Acceptance Criteria:**
  - Maintenance window scheduled and communicated to stakeholders.

---

**Task ID:** VIP-DEPLOY-005
**Title:** Execute Database Migrations & Apply RLS to Production Tables
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** During the maintenance window:
  1. Apply migrations for `vip_customer_data`, `vip_tiers`, and `profiles_vip_staging.vip_customer_data_id`.
  2. Apply finalized RLS policies to `public.profiles`, `public.bookings`, `public.crm_customer_mapping_vip_staging` (if updates are needed beyond initial RLS setup).
  3. Apply RLS policies to `public.vip_customer_data` and `public.vip_tiers`.
  4. Enable and Force RLS on all these tables. (Ref: `RLS-P4.2-001`)
**Dependencies:** VIP-DEPLOY-001, VIP-DEPLOY-003, VIP-DEPLOY-004, All VIP-BE database schema tasks
**Acceptance Criteria:**
  - All schema migrations are applied successfully to production.
  - RLS policies are active and forced on all specified production tables.

---

**Task ID:** VIP-DEPLOY-006
**Title:** Deploy VIP Application Code to Production
**Assignee:** FE Developer / BE Developer
**Status:** To Do
**Priority:** Critical
**Description:** Deploy the VIP feature application code (frontend and backend APIs) to production. Ensure it is configured to use the RLS-enabled production tables. (Ref: `RLS-P4.2-003`)
**Dependencies:** VIP-DEPLOY-005, All VIP-FE tasks, All VIP-BE API tasks
**Acceptance Criteria:**
  - VIP feature code is deployed to production.
  - Configuration points to production database tables.

---

**Task ID:** VIP-DEPLOY-007
**Title:** Conduct Post-Launch Testing & Monitoring
**Assignee:** QA Team / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:**
  1. Test critical flows of the existing production application after RLS changes. (Ref: `RLS-P4.2-002`)
  2. Conduct thorough testing of all LENGOLF VIP functionalities in production. (Ref: `RLS-P4.2-004`)
  3. Closely monitor application logs, database performance, and error rates. (Ref: `RLS-P4.2-005`)
**Dependencies:** VIP-DEPLOY-006
**Acceptance Criteria:**
  - Existing application and new VIP features function correctly in production.
  - RLS policies provide correct data access and isolation.
  - Systems are stable with no unexpected RLS-related errors.

---

**Task ID:** VIP-DEPLOY-008
**Title:** Review and Harden `anon` RLS Policies Post-VIP Launch
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Critical
**Description:** After the VIP launch is stable, critically review any RLS policies for the `anon` role on ALL production tables. Remove or significantly restrict them to enforce the principle of least privilege. (Ref: `AUTH_RLS_DISCOVERY_LOG.md` reminders, `RLS-P4.3-001`)
**Dependencies:** VIP-DEPLOY-007
**Acceptance Criteria:**
  - Temporary or overly permissive anonymous read policies are removed or appropriately restricted.
  - Data exposure to anonymous users is minimized across the application.

---

**Task ID:** VIP-DEPLOY-009
**Title:** Decommission VIP Staging Artifacts
**Assignee:** BE Developer / Platform Team
**Status:** To Do
**Priority:** Medium
**Description:** Once the production VIP deployment is stable, decommission and drop any temporary `_vip_staging` tables and related artifacts that are no longer needed. (Ref: `RLS-P4.3-002`)
**Dependencies:** VIP-DEPLOY-008
**Acceptance Criteria:**
  - Temporary staging tables and resources are backed up (if required) and removed from the system.

--- 