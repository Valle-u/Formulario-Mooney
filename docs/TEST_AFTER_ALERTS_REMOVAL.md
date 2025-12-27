# Testing Guide - After Alerts System Removal

This document provides a checklist to verify that all functionality works correctly after removing the alerts system.

## ✅ Changes Made

### Frontend
- ✅ Deleted `frontend/public/alertas.html`
- ✅ Removed all alert navigation links from HTML pages (egreso.html, consulta-egresos.html, usuarios.html, logs.html)
- ✅ Removed alert badges from navigation
- ✅ Removed `updateAlertBadge()` function from `app.js`
- ✅ Removed `.alert-badge-nav` CSS styles from `styles.css`

### Backend
- ✅ Removed `/api/alerts` route from `server.js`
- ✅ Deleted `routes/alerts.js` file
- ✅ Created migration `009_remove_alerts_system.sql` to drop:
  - Triggers: `trg_check_high_amount`, `trg_check_similar_transfers`
  - Functions: `check_high_amount_alert()`, `check_similar_transfers_alert()`
  - Tables: `alerts`, `alert_config`
  - Indexes: alert-related indexes
- ✅ Renamed old migrations to `.removed`:
  - `007_add_alerts_system.sql.removed`
  - `008_update_alert_thresholds_and_duplicate_detection.sql.removed`

### Database
- ✅ All alert tables, triggers, and functions removed via migration 009
- ✅ Backend started successfully after migration

## 🧪 Manual Testing Checklist

### 1. Authentication & Authorization
- [ ] Login with admin user
- [ ] Login with cajero user
- [ ] Verify logout works
- [ ] Verify admin-only sections hidden for cajero

### 2. Egresos (Transfers) - Main Functionality
- [ ] Open `egreso.html`
- [ ] Fill form with all required fields
- [ ] Upload a comprobante (JPG/PNG/PDF)
- [ ] Submit form
- [ ] Verify success toast appears
- [ ] Verify NO errors in browser console related to alerts

### 3. Historial (History)
- [ ] Open `consulta-egresos.html`
- [ ] Verify page loads and shows egresos automatically
- [ ] Filter by empresa
- [ ] Filter by fecha
- [ ] Download CSV - verify it works
- [ ] Verify NO errors in browser console

### 4. Usuarios (Users) - Admin Only
- [ ] Open `usuarios.html` as admin
- [ ] View users list
- [ ] Create new user
- [ ] Edit existing user
- [ ] Verify NO errors in browser console
- [ ] Verify NO alert navigation link appears

### 5. Logs (Audit Logs) - Admin Only
- [ ] Open `logs.html` as admin
- [ ] View logs
- [ ] Filter by username
- [ ] Filter by action
- [ ] Verify pagination works
- [ ] Verify NO errors in browser console

### 6. Navigation
- [ ] Desktop navigation shows: Retiros, Historial, Usuarios (admin), Logs (admin)
- [ ] Mobile navigation (hamburger menu) shows same links
- [ ] NO "Alertas" link visible anywhere
- [ ] NO badge indicators visible
- [ ] All navigation links work correctly

### 7. Backend API
- [ ] Test health endpoint: `curl http://localhost:4000/health` → `{"ok":true}`
- [ ] Verify backend console shows NO errors
- [ ] Verify migrations completed: "✅ Database migrations finished"
- [ ] Create egreso via API - verify no trigger errors

### 8. Database Verification
Connect to PostgreSQL and run:

```sql
-- Verify alerts tables are gone
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('alerts', 'alert_config');
-- Expected: 0 rows

-- Verify triggers are gone
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name IN ('trg_check_high_amount', 'trg_check_similar_transfers');
-- Expected: 0 rows

-- Verify functions are gone
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('check_high_amount_alert', 'check_similar_transfers_alert');
-- Expected: 0 rows

-- Verify egresos table still works
SELECT COUNT(*) FROM egresos;
-- Expected: Should show your egresos count

-- Test insert (this should NOT trigger any alerts or errors)
-- Run from the app, not SQL directly
```

## 🎯 Expected Results

### ✅ What SHOULD Work
1. All egreso creation, editing, viewing
2. CSV downloads
3. User management (admin)
4. Audit logs viewing
5. Authentication and authorization
6. File uploads
7. All navigation (except alerts)

### ❌ What Should NOT Exist
1. No `/alertas.html` page (404 if accessed directly)
2. No alert badges in navigation
3. No alert API endpoints (`/api/alerts/*` should 404)
4. No alert-related database tables, triggers, or functions
5. No console errors related to `updateAlertBadge()`
6. No alert navigation links in any page

## 🚨 Common Issues to Check

1. **Console Errors**: Open browser DevTools → Console, look for:
   - ❌ "updateAlertBadge is not defined"
   - ❌ "Failed to fetch /api/alerts"
   - ❌ Any alert-related errors

2. **Backend Errors**: Check backend console for:
   - ❌ "Cannot find module './routes/alerts.js'"
   - ❌ Trigger errors when creating egresos
   - ❌ Migration errors

3. **Broken Navigation**:
   - ❌ Alert link still visible
   - ❌ Clicking alert link → 404
   - ❌ Badge showing numbers

## ✅ Success Criteria

All checkboxes above are checked AND:
- No errors in browser console
- No errors in backend console
- All core features (egresos, historial, usuarios, logs) work perfectly
- No references to alerts anywhere in the UI
- Database is clean (no alert tables/triggers/functions)

---

**Testing completed on**: _______________
**Tested by**: _______________
**Result**: ⬜ PASS | ⬜ FAIL
**Notes**: _______________
