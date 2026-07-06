# Draft UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline draft banners with a focused modal popup, and preserve in-memory tab state during the same browser session.

**Architecture:** All changes are in `public/index.html` (single-file app). New session detection uses `sessionStorage`. In-memory tab state is a plain JS object (`_tabState`). The modal replaces `#draftBanners` and `#draftIndicator` with a full-screen overlay triggered per-tab only on new sessions.

**Tech Stack:** Vanilla JS, HTML/CSS, Firebase Firestore, localStorage, sessionStorage. No build step — edit the file and refresh the browser to test.

## Global Constraints

- RTL layout (`dir="rtl"`) — new UI elements must work in RTL
- Existing CSS variables: `--primary`, `--surface`, `--border`, `--text`, `--sub`, `--radius`, `--shadow`, `--red`
- No external dependencies may be added
- All user-facing strings must match the existing pattern (Hebrew hardcoded or via `t()` where a translation key exists)
- Keep `_draftDelete`, `_draftQualifies`, `_draftHasBannerData`, `_draftSaveLocal`, `_draftLoadLocal`, `_draftSaveFirestore`, `_draftApplyToForm`, `_draftOnInput`, `_draftAttachListeners`, `_draftStartFirestoreTimer`, `checkAndAutoSavePreviousDrafts` — these are unchanged

---

### Task 1: Add Modal HTML and CSS

**Files:**
- Modify: `public/index.html:250-263` (CSS — replace banner styles with modal styles)
- Modify: `public/index.html:674-675` (HTML — replace inline banners with modal)

- [ ] **Step 1: Replace draft banner CSS with modal CSS**

Find and replace the entire `/* ── DRAFT AUTO-SAVE ── */` block (lines 250–263):

```css
/* ── DRAFT AUTO-SAVE ── */
.draft-indicator { font-size: 12px; color: var(--sub); padding: 6px 16px 0; text-align: start; }
.draft-banners   { display: flex; flex-direction: column; gap: 8px; padding: 8px 16px 0; }
.draft-banner {
  background: var(--surface); border: 1.5px solid var(--primary); border-radius: var(--radius);
  padding: 12px 14px; display: flex; align-items: flex-start; justify-content: space-between;
  gap: 10px; box-shadow: 0 2px 8px rgba(99,102,241,.12);
}
.draft-banner-info { font-size: 13px; color: var(--text); flex: 1; display: flex; flex-direction: column; gap: 3px; line-height: 1.4; }
.draft-banner-time { font-size: 11px; color: var(--sub); }
.draft-banner-actions { display: flex; flex-direction: column; gap: 6px; align-items: stretch; flex-shrink: 0; }
.draft-btn-resume  { background: var(--primary); color: white; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.draft-btn-discard { background: none; color: var(--sub); border: none; font-size: 12px; cursor: pointer; text-decoration: underline; padding: 4px 0; }
.auto-save-badge   { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; color: var(--sub); background: var(--border); direction: ltr; line-height: 1.3; }
```

Replace with:

```css
/* ── DRAFT AUTO-SAVE ── */
.auto-save-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; color: var(--sub); background: var(--border); direction: ltr; line-height: 1.3; }
@keyframes draftFadeIn { from { opacity: 0; } to { opacity: 1; } }
.draft-modal-overlay {
  position: fixed; inset: 0; z-index: 500;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: draftFadeIn .2s ease;
}
.draft-modal-card {
  background: var(--surface); border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0,0,0,.18);
  padding: 24px 20px; width: 100%; max-width: 340px;
  display: flex; flex-direction: column; gap: 12px;
}
.draft-modal-title   { font-size: 17px; font-weight: 800; color: var(--text); }
.draft-modal-details { font-size: 13px; color: var(--sub); line-height: 1.5; }
.draft-modal-btn-resume {
  width: 100%; padding: 13px; border: none; border-radius: var(--radius);
  background: var(--primary); color: white; font-size: 15px; font-weight: 700; cursor: pointer;
}
.draft-modal-btn-resume:active { opacity: .85; }
.draft-modal-btn-discard {
  width: 100%; padding: 8px; border: none; background: none;
  font-size: 13px; color: var(--sub); cursor: pointer; text-decoration: underline;
}
```

- [ ] **Step 2: Replace inline banner HTML with modal HTML**

Find (lines 674–675):
```html
  <div id="draftIndicator" class="draft-indicator" style="display:none;"></div>
  <div id="draftBanners"   class="draft-banners"></div>
```

Replace with:
```html
  <div id="draftModal" class="draft-modal-overlay" style="display:none;" aria-modal="true" role="dialog">
    <div class="draft-modal-card">
      <div class="draft-modal-title"></div>
      <div class="draft-modal-details"></div>
      <button class="draft-modal-btn-resume"  onclick="_draftModalResume()"></button>
      <button class="draft-modal-btn-discard" onclick="_draftModalDiscard()"></button>
    </div>
  </div>
```

- [ ] **Step 3: Manually verify**

Open `public/index.html` in a browser (or refresh if already open). The page should load normally with no visible change — the modal is hidden. Check DevTools console for errors. No banners should appear above the workout form.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add draft modal HTML and CSS, remove inline banner markup"
```

---

### Task 2: Add New JS Globals and Functions

**Files:**
- Modify: `public/index.html:1053-1059` (globals — add `_tabState`, `_isNewSession`, `_draftModalType`; remove obsolete vars)
- Modify: `public/index.html` — add five new functions after the existing draft functions section (after `checkAndAutoSavePreviousDrafts`, before the `// ─── MAIN — WORKOUT FORM` comment)

- [ ] **Step 1: Replace the DRAFT STATE globals block**

Find (lines 1053–1059):
```js
// ─── DRAFT STATE ──────────────────────────────────────────────
let _draftDirty          = {};   // { type: boolean }
let _draftSaveDebounce   = {};   // { type: timeoutId }
let _draftFirestoreTimer = null;
let _draftLastSavedTime  = null;
let _draftIndicatorTimer = null;
let _draftAutoLoading    = false;
```

Replace with:
```js
// ─── DRAFT STATE ──────────────────────────────────────────────
let _draftDirty          = {};   // { type: boolean }
let _draftSaveDebounce   = {};   // { type: timeoutId }
let _draftFirestoreTimer = null;
let _tabState            = {};   // { type: serialized form state }
let _draftModalType      = null;
const _isNewSession      = !sessionStorage.getItem('session_active');
if (_isNewSession) sessionStorage.setItem('session_active', '1');
```

- [ ] **Step 2: Add new tab-state and modal functions**

Find the line:
```js
// ─── MAIN — WORKOUT FORM ──────────────────────────────────────
```

Insert the following block **immediately before** that comment:

```js
// ─── TAB STATE & DRAFT MODAL ─────────────────────────────────
function _tabSnapshotCurrent() {
  if (!selectedType) return;
  _tabState[selectedType] = _draftSerialize();
}

function _tabRestoreOrDraft(type) {
  if (_tabState[type]) {
    _draftApplyToForm(_tabState[type]);
    return;
  }
  const draft = _draftLoadLocal(type);
  if (!draft || !_draftHasBannerData(draft)) return;
  const today = new Date().toISOString().slice(0, 10);
  if ((draft.createdAt || '').slice(0, 10) !== today) return;
  if (_isNewSession) {
    _draftShowModal(type, draft);
  } else {
    // Refresh within same session — restore silently
    _draftApplyToForm(draft);
    _tabState[type] = _draftSerialize();
  }
}

function _draftShowModal(type, draft) {
  _draftModalType = type;
  const exCount = (draft.exercises || []).filter(e => e.weight || e.sets || e.reps).length;
  const timeStr = draft.lastModified
    ? new Date(draft.lastModified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const nameStr = draft.workoutName ? `"${escHtml(draft.workoutName)}" · ` : '';
  const modal = document.getElementById('draftModal');
  modal.querySelector('.draft-modal-title').textContent = `נמצאה טיוטה לאימון ${escHtml(type)}`;
  modal.querySelector('.draft-modal-details').innerHTML =
    `${nameStr}${exCount} ${t('workout.exercises')}<br><span style="font-size:11px;">${t('draft.found_today')} ${timeStr}</span>`;
  modal.querySelector('.draft-modal-btn-resume').textContent  = t('draft.resume');
  modal.querySelector('.draft-modal-btn-discard').textContent = t('draft.discard');
  modal.style.display = 'flex';
}

function _draftModalResume() {
  const type  = _draftModalType;
  const draft = _draftLoadLocal(type);
  if (draft) {
    _draftApplyToForm(draft);
    _tabState[type] = _draftSerialize();
  }
  document.getElementById('draftModal').style.display = 'none';
  _draftModalType = null;
}

async function _draftModalDiscard() {
  const type = _draftModalType;
  document.getElementById('draftModal').style.display = 'none';
  _draftModalType = null;
  await _draftDelete(type);
}

```

- [ ] **Step 3: Verify no console errors**

Refresh the browser. Open DevTools → Console. There should be no errors. The new functions are defined but not yet wired in; behavior is unchanged so far.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat: add _tabState, session detection, and draft modal JS functions"
```

---

### Task 3: Wire Up New Logic into selectType and submitData

**Files:**
- Modify: `public/index.html:1565-1614` (`selectType`)
- Modify: `public/index.html:1682-1683` (`submitData` — remove indicator call, add tabState cleanup)
- Modify: `public/index.html:2778` (window exports)

- [ ] **Step 1: Update selectType**

Find the block at the start of `selectType` (lines 1565–1570):
```js
function selectType(type) {
  // Save draft for current type before switching
  if (selectedType && selectedType !== type && _draftHasFormData()) {
    _draftSaveLocal(selectedType);
    _draftDirty[selectedType] = true;
  }
  selectedType = type;
```

Replace with:
```js
function selectType(type) {
  // Snapshot current tab into memory, then save to localStorage as safety net
  _tabSnapshotCurrent();
  if (selectedType && selectedType !== type && _draftHasFormData()) {
    _draftSaveLocal(selectedType);
    _draftDirty[selectedType] = true;
  }
  selectedType = type;
```

- [ ] **Step 2: Replace the banner call at the end of selectType**

Find (line 1612–1613, the last two lines of `selectType` body):
```js
  // Show draft recovery banner if there's a today-draft for this type
  _draftCheckAndShowBanner(type);
```

Replace with:
```js
  _tabRestoreOrDraft(type);
```

- [ ] **Step 3: Update submitData — remove indicator call, clear tabState**

Find (lines 1682–1683 inside `submitData`):
```js
    await _draftDelete(selectedType);
    _draftIndicatorHide();
```

Replace with:
```js
    await _draftDelete(selectedType);
    delete _tabState[selectedType];
```

- [ ] **Step 4: Update window exports**

Find (line 2778):
```js
  _draftResume, _draftDiscard,
```

Replace with:
```js
  _draftModalResume, _draftModalDiscard,
```

- [ ] **Step 5: Manual test — same session tab switching**

1. Open the app, log in, navigate to the workout section.
2. Enter some data in tab A (e.g., put "80" in the first exercise's weight field).
3. Switch to tab B — tab A data should disappear (B is blank).
4. Switch back to tab A — "80" should still be there (restored from `_tabState`).
5. Check DevTools Console — no errors.

- [ ] **Step 6: Manual test — new session draft modal**

1. Enter data in tab A, wait 2+ seconds (localStorage autosave debounce).
2. Close the browser tab completely.
3. Reopen the app and log in.
4. Click on tab A — a modal popup should appear: "נמצאה טיוטה לאימון A".
5. Click "המשך מהמקום שהפסקת" — the form fills with your previous data, modal closes.
6. Repeat steps 1–4, but this time click "התחל מחדש" — modal closes, form stays empty.

- [ ] **Step 7: Commit**

```bash
git add public/index.html
git commit -m "feat: wire tab state and draft modal into selectType and submitData"
```

---

### Task 4: Remove Old Banner Code and Obsolete Functions

**Files:**
- Modify: `public/index.html` — remove functions `_draftIndicatorShow`, `_draftIndicatorHide`, `_draftRenderBanner`, `_draftCheckAndShowBanner`, `_draftResume`, `_draftDiscard`; clean up calls inside `_draftDelete`, `_draftSaveFirestore`, `_draftOnInput`

- [ ] **Step 1: Clean up _draftSaveFirestore — remove indicator call**

Find inside `_draftSaveFirestore` (lines 1400–1403):
```js
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'drafts', type), local);
    _draftLastSavedTime = Date.now();
    _draftIndicatorShow('saved');
  } catch(e) { /* silent — localStorage is the fallback */ }
```

Replace with:
```js
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'drafts', type), local);
  } catch(e) { /* silent — localStorage is the fallback */ }
```

- [ ] **Step 2: Clean up _draftDelete — remove banner/indicator refs**

Find inside `_draftDelete` (lines 1409–1413):
```js
  delete _draftDirty[type];
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', type)); } catch(e) {}
  const banner = document.getElementById(`draftBanner_${type}`);
  if (banner) banner.remove();
  if (!document.querySelector('.draft-banner')) _draftIndicatorHide();
```

Replace with:
```js
  delete _draftDirty[type];
  try { await deleteDoc(doc(db, 'users', currentUser.uid, 'drafts', type)); } catch(e) {}
```

- [ ] **Step 3: Clean up _draftOnInput — remove indicator call**

Find inside `_draftOnInput` (lines 1454–1462):
```js
function _draftOnInput() {
  if (!selectedType) return;
  _draftIndicatorShow('saving');
  clearTimeout(_draftSaveDebounce[selectedType]);
  _draftSaveDebounce[selectedType] = setTimeout(() => {
    _draftSaveLocal(selectedType);
    _draftDirty[selectedType] = true;
  }, 2000);
}
```

Replace with:
```js
function _draftOnInput() {
  if (!selectedType) return;
  clearTimeout(_draftSaveDebounce[selectedType]);
  _draftSaveDebounce[selectedType] = setTimeout(() => {
    _draftSaveLocal(selectedType);
    _draftDirty[selectedType] = true;
  }, 2000);
}
```

- [ ] **Step 4: Remove _draftIndicatorShow function**

Find and delete the entire function (lines 1430–1446):
```js
function _draftIndicatorShow(state) {
  const el = document.getElementById('draftIndicator');
  if (!el) return;
  clearInterval(_draftIndicatorTimer);
  el.style.display = '';
  if (state === 'saving') {
    el.textContent = t('draft.saving');
    return;
  }
  _draftLastSavedTime = Date.now();
  const update = () => {
    const mins = Math.floor((Date.now() - _draftLastSavedTime) / 60000);
    el.textContent = mins < 1 ? t('draft.saved') : `${t('draft.saved')} · ${mins} ${t('draft.minutes_ago')}`;
  };
  update();
  _draftIndicatorTimer = setInterval(update, 60000);
}
```

- [ ] **Step 5: Remove _draftIndicatorHide function**

Find and delete the entire function (lines 1448–1452):
```js
function _draftIndicatorHide() {
  clearInterval(_draftIndicatorTimer);
  const el = document.getElementById('draftIndicator');
  if (el) el.style.display = 'none';
}
```

- [ ] **Step 6: Remove _draftRenderBanner function**

Find and delete the entire function (approximately lines 1479–1500):
```js
function _draftRenderBanner(type, draft) {
  if (document.getElementById(`draftBanner_${type}`)) return;
  const exCount = (draft.exercises || []).filter(e => e.weight || e.sets || e.reps).length;
  const timeStr = draft.lastModified
    ? new Date(draft.lastModified).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const nameStr = draft.workoutName ? ` · "${escHtml(draft.workoutName)}"` : '';
  const banner  = document.createElement('div');
  banner.className = 'draft-banner';
  banner.id        = `draftBanner_${type}`;
  banner.innerHTML = `
    <div class="draft-banner-info">
      <span><strong>${t('workout.badge')} ${escHtml(type)}</strong>${nameStr}</span>
      <span>${exCount} ${t('workout.exercises')}</span>
      <span class="draft-banner-time">${t('draft.found_today')} ${timeStr}</span>
    </div>
    <div class="draft-banner-actions">
      <button class="draft-btn-resume"  onclick="_draftResume('${escHtml(type)}')">${t('draft.resume')}</button>
      <button class="draft-btn-discard" onclick="_draftDiscard('${escHtml(type)}')">${t('draft.discard')}</button>
    </div>`;
  document.getElementById('draftBanners')?.appendChild(banner);
}
```

- [ ] **Step 7: Remove _draftCheckAndShowBanner function**

Find and delete the entire function:
```js
function _draftCheckAndShowBanner(type) {
  if (_draftAutoLoading) return;
  const draft = _draftLoadLocal(type);
  if (!draft || !_draftHasBannerData(draft)) return;
  const today = new Date().toISOString().slice(0, 10);
  if ((draft.createdAt || '').slice(0, 10) === today) _draftRenderBanner(type, draft);
}
```

- [ ] **Step 8: Remove _draftResume and _draftDiscard functions**

Find and delete:
```js
function _draftResume(type) {
  _draftAutoLoading = true;
  if (selectedType !== type) selectType(type);
  _draftAutoLoading = false;
  const draft = _draftLoadLocal(type);
  if (!draft) return;
  _draftApplyToForm(draft);
  document.getElementById(`draftBanner_${type}`)?.remove();
  _draftIndicatorShow('saved');
}

async function _draftDiscard(type) {
  await _draftDelete(type);
}
```

- [ ] **Step 9: Verify no console errors**

Refresh the browser, log in. Open DevTools → Console. There must be zero errors. Test tab switching, submit a workout — all should work normally.

- [ ] **Step 10: Commit**

```bash
git add public/index.html
git commit -m "refactor: remove inline draft banners and obsolete indicator functions"
```

---

## Self-Review

**Spec coverage check:**
- Session detection (`_isNewSession` via sessionStorage) — Task 2, Step 1 ✓
- `_tabState` in-memory snapshot — Task 2, Steps 1–2 ✓
- `_tabSnapshotCurrent` called on tab switch — Task 3, Step 1 ✓
- `_tabRestoreOrDraft` replaces `_draftCheckAndShowBanner` — Task 3, Step 2 ✓
- Modal HTML + CSS — Task 1 ✓
- Modal trigger: new session + today's draft + `_draftHasBannerData` — `_tabRestoreOrDraft` in Task 2 ✓
- "Continue" button calls `_draftApplyToForm` + caches in `_tabState` — `_draftModalResume` in Task 2 ✓
- "Start fresh" button calls `_draftDelete` — `_draftModalDiscard` in Task 2 ✓
- `submitData` clears `_tabState[selectedType]` — Task 3, Step 3 ✓
- Refresh within same session: `_isNewSession=false`, draft silently restored — `_tabRestoreOrDraft` else branch in Task 2 ✓
- Auto-save to history (previous days) — unchanged, no task needed ✓
- Remove `#draftBanners`, `#draftIndicator` — Task 1, Step 2 ✓
- Remove old CSS — Task 1, Step 1 ✓
- Remove old functions — Task 4 ✓

**No placeholders found.**

**Type consistency:** `_draftModalResume` / `_draftModalDiscard` named consistently throughout Tasks 2, 3, 4.
