# Companion CRM — Deep Dive Audit Findings

Comprehensive cross-tab audit of data flow, UI/UX, and functionality inconsistencies across all pages, components, hooks, and database operations.

---

## 🔴 BUGS (Will cause incorrect behavior)

### 1. Recurring Bookings Don't Copy `venueId`
**Location:** `useAutoStatusTransitions.ts` lines 115–135  
**Impact:** When a recurring incall booking completes and spawns the next occurrence, `venueId` is NOT included in the `createBooking()` call. The new booking loses its associated incall venue.  
**Fix:** Add `venueId: b.venueId` to the createBooking call on ~line 119.

### 2. Recurring Bookings Don't Copy `depositMethod`
**Location:** `useAutoStatusTransitions.ts` lines 115–135  
**Impact:** Same spawn logic — `depositMethod` isn't copied. The next occurrence has no deposit payment method, so the swipe-to-record-deposit action won't know what method to default to.  
**Fix:** Add `depositMethod: b.depositMethod` to the createBooking call.

### 3. `client.notes` Field Exists But Is Invisible
**Location:** Schema in `types/index.ts:43`, `db/index.ts:284`, sample data uses it  
**Impact:** The `Client` type has a `notes` field, `createClient()` defaults it to `''`, sample data populates it with notes like *"Always punctual. Prefers evening appointments."* — but **neither ClientEditor nor ClientDetail ever reads or writes it**. The field is encrypted at rest but completely inaccessible through the UI. Any notes entered via sample data are silently lost.  
**Fix:** Either (a) add a "General Notes" textarea to ClientEditor and a display section in ClientDetail, or (b) remove the field and migrate existing data into `preferences`.

### 4. Telegram/Signal/WhatsApp Fields NOT Encrypted
**Location:** `db/fieldCrypto.ts` lines 25–29  
**Impact:** The `SENSITIVE_FIELDS.clients` array encrypts `phone` and `email` but **does not include `telegram`, `signal`, or `whatsapp`**. These are direct contact identifiers that could link back to a client's real identity. They're stored in plaintext in IndexedDB even when PIN encryption is enabled.  
**Fix:** Add `'telegram', 'signal', 'whatsapp'` to `SENSITIVE_FIELDS.clients`. Will need a migration to encrypt existing values.

### 5. `Pending Deposit → Confirmed` Has No Auto-Transition
**Location:** `useAutoStatusTransitions.ts` — missing case  
**Impact:** When the user records a deposit via the swipe panel (SwipeableBookingRow), `recordBookingPayment()` correctly syncs `depositReceived = true`. However, **the booking status remains "Pending Deposit"** — the user must manually change it to "Confirmed". The auto-transitions hook checks `Screening → Pending Deposit/Confirmed` and `Confirmed → In Progress`, but there's no `Pending Deposit → Confirmed` transition when `depositReceived` becomes true.  
**Fix:** Add a check in `useAutoStatusTransitions`: if `b.status === 'Pending Deposit' && b.depositReceived`, update to `Confirmed` with `confirmedAt`.

---

## 🟡 UX GAPS (Functional but confusing or incomplete)

### 6. "Screening" Booking Status Is Unreachable
**Location:** BookingEditor line 19, line 135  
**Impact:** The `BookingStatus` type includes `'Screening'`, and `useAutoStatusTransitions` handles `Screening → Pending Deposit/Confirmed`. However, new bookings can only be created for **screened** clients (validation on line 135), and `'Screening'` is not in the BookingEditor's status dropdown options. There's no path to reach this status. The auto-transition code for it is dead code.  
**Recommendation:** Either (a) allow creating bookings for unscreened clients with initial status 'Screening', or (b) remove the Screening status from BookingStatus and the auto-transition code.

### 7. Unscreening a Client Doesn't Affect Existing Bookings
**Location:** SwipeableBookingRow screening pills, auto-transitions  
**Impact:** If a user changes a client from "Screened" back to "Unscreened" via the swipe panel, existing bookings for that client remain at whatever status they're at. The swipe panel switches to showing only screening pills (hiding deposit/status rows), but the booking status doesn't revert to "Screening" or "To Be Confirmed". This could lead to confirmed bookings for unscreened clients.  
**Recommendation:** When client screening status changes to non-Screened, downgrade any future bookings (status before "In Progress") to "To Be Confirmed" or add a warning badge.

### 8. Booking History in ClientDetail Capped at 10, No "Show More"
**Location:** `ClientDetail.tsx` line 541  
**Impact:** `pastBookings.slice(0, 10)` hard-caps the visible history. For long-term clients with many bookings, older history is invisible with no way to view more.  
**Fix:** Add a "Show all" button or virtualized scroll.

### 9. No Confirmation Before Blacklisting a Client
**Location:** `ClientDetail.tsx` line 573  
**Impact:** The "Blacklist Client" button directly calls `toggleBlock()` with no confirmation dialog. Blacklisting hides the client from the main list and prevents new bookings. One accidental tap could be disruptive.  
**Fix:** Add a confirmation dialog before blacklisting (similar to the delete confirmation pattern used elsewhere).

### 10. `costNotes` Type Field Is Orphaned
**Location:** `types/index.ts:188`  
**Impact:** `costNotes?: string` exists on some type but isn't used in any component, not in the DB schema's sensitive fields, and not in any editor. Dead type field.  
**Fix:** Remove from types.

---

## 🔵 CODE QUALITY / CONSISTENCY

### 11. Inline bookingTotal Calculation Instead of Helper
**Location:** `FinancesPage.tsx` line 1466  
**Impact:** Uses `booking.baseRate + booking.extras + booking.travelFee` instead of the existing `bookingTotal(booking)` helper. Functionally identical but creates a maintenance risk if the total calculation ever changes.  
**Fix:** Replace with `bookingTotal(booking)`.

### 12. Sample Data `client.notes` Creates Misleading Demo
**Location:** `data/sampleData.ts` lines 59, 79, 96, 113  
**Impact:** Sample clients have detailed notes like *"Business traveler. Sees me when he's in town every few weeks."* but since `client.notes` has no UI (Bug #3), users testing the demo data will never see this content and may wonder where it went.  
**Fix:** Move sample data notes into `preferences` field, or fix Bug #3 first.

### 13. ContactActionBar Falls Back Phone→Messaging Apps Silently
**Location:** `ClientDetail.tsx` lines 735–767  
**Impact:** WhatsApp, Telegram, and Signal action buttons fall back to the client's phone number when their dedicated field is empty. This is helpful but could be confusing — e.g., if a client has a phone but no Telegram, tapping "Telegram" opens a `t.me/` link with the phone number, which may not be their Telegram handle. No visual indication that it's using a fallback.  
**Recommendation:** Add a subtle "(via phone)" label or dim the button when using fallback.

---

## Summary by Priority

| Priority | # | Description |
|----------|---|-------------|
| 🔴 Bug | 1 | Recurring bookings lose venueId |
| 🔴 Bug | 2 | Recurring bookings lose depositMethod |
| 🔴 Bug | 3 | client.notes field invisible |
| 🔴 Bug | 4 | Telegram/Signal/WhatsApp not encrypted |
| 🔴 Bug | 5 | No auto-transition Pending Deposit → Confirmed |
| 🟡 UX | 6 | "Screening" status unreachable |
| 🟡 UX | 7 | Unscreening client doesn't affect bookings |
| 🟡 UX | 8 | History capped at 10 items |
| 🟡 UX | 9 | No blacklist confirmation dialog |
| 🟡 UX | 10 | Orphaned costNotes type |
| 🔵 Code | 11 | Inline total instead of helper |
| 🔵 Code | 12 | Sample data uses invisible notes |
| 🔵 Code | 13 | Messaging fallback not indicated |
