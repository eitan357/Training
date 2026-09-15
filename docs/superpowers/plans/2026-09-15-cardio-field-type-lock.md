# Lock Cardio Field Type After Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the cardio template editor, only show the text/number/checkbox type picker on a field the user is actively creating (added this session, not yet saved) — every other field (already-saved, or one of a new type's 8 auto-seeded defaults) is permanently locked to its type with no picker at all.

**Architecture:** A transient `_isNew` marker (never written to Firestore) is set on a field the moment it's created via `addCardioEditField()`, mirrored onto its row's `data-is-new` DOM attribute so it survives the existing collect/re-render round-trips (`collectEdits('cardio')`), and read by `renderItemRow`/`collectItemFromRow` to decide whether that one row shows the picker. `buildSaveDoc()` strips the marker before every write, and `saveCardioTemplates()` re-renders the field list immediately after a successful save so a just-saved field's picker disappears without leaving the page.

**Tech Stack:** Vanilla JS, single file (`public/index.html`), Firebase Firestore (client SDK, no custom backend), Playwright for tests (no unit-test framework in this repo — all testing is E2E against the real `test@gmail.com` production account, no emulator).

**Spec:** [`docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md`](../specs/2026-09-15-cardio-field-type-lock-design.md)

## Global Constraints

- No Firestore emulator exists for this project — every test runs against the real `test@gmail.com` account's real production Firestore data via `tests/helpers/auth.ts`'s `loginWithEmailPassword`.
- **Every `npx playwright test` invocation must be preceded by `export $(grep -v '^#' .env.test | xargs)` in the same command** (this repo does not auto-load `.env.test`; without it, `requiresCredentials()` silently skips ~280+ tests and reports a misleading "0 failures"). Verify the skip count is small (single/low-double digits) after every run, not just "0 failed".
- Any structural test change (adding/removing a cardio type) must use a throwaway type (`CTLOCK_<timestamp>` naming) and clean it up in a `finally` block — never touch Eitan's real "Running"/"Elliptical" types. Before any destructive action in a script/test against this shared account, verify actual DOM/data state matches assumed state; log what's about to be deleted before deleting it.
- Reuse existing i18n keys (`edit.ftype_text`, `edit.ftype_number`, `edit.ftype_checkbox`) — no new translation strings needed for this feature.
- The strength (workout) template editor is out of scope — it has no field-type concept. Do not touch `WORKOUT_DOMAINS.strength` or its tests beyond running them for regression.
- End every commit message with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

---

## File Structure

- Modify: `public/index.html` — the only source file in this app (no build step, no bundler). All 7 code changes across both tasks land here.
- Modify: `tests/running.spec.ts` — extend one existing test, replace one existing test, add one new test.
- Modify: `docs/product/07-running-cardio.md` — update the "עורך תבניות אירובי" section to describe the new locked/new-only behavior, incrementally as each task's behavior is verified.

---

### Task 1: Lock existing/pre-existing cardio fields; show the type picker only on a freshly-added, unsaved field

**Files:**
- Modify: `public/index.html:3309` (`WORKOUT_DOMAINS.cardio.newItem`)
- Modify: `public/index.html:4772-4790` (`renderEditList`, shared with strength)
- Modify: `public/index.html:3310-3342` (`WORKOUT_DOMAINS.cardio.renderItemRow`)
- Modify: `public/index.html:3343-3363` (`WORKOUT_DOMAINS.cardio.collectItemFromRow`)
- Modify: `public/index.html:3364-3370` (`WORKOUT_DOMAINS.cardio.buildSaveDoc`)
- Modify: `public/index.html:4978-4997` (`setCardioFieldType`)
- Modify: `tests/running.spec.ts:306-320` (extend existing test)
- Modify: `tests/running.spec.ts:322-328` (replace existing test)
- Modify: `docs/product/07-running-cardio.md` (the "עורך תבניות אירובי" section, around its `field-type-picker`/target-input bullet)

**Interfaces:**
- Consumes: `WORKOUT_DOMAINS.cardio` object shape (existing), `renderEditList(domain, type)` generic dispatcher (existing), `cardioFieldDisplayLabel(f)` / `_cardioFieldSaveLabel(id, value)` (existing, unchanged).
- Produces: every cardio field object gains an optional transient `_isNew` boolean property (never persisted); every `.edit-card` DOM node gains `data-field-type` and `data-is-new` attributes (both domains, harmless no-op for strength since its items never carry `fieldType`/`_isNew`).

- [ ] **Step 1: Extend the existing "add type seeds the 8 default fields" test with a locked-fields assertion**

In `tests/running.spec.ts`, replace lines 306-320:

```ts
  test('add type seeds the 8 default fields including a locked date field', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    // Scoped to #cardioEditTabs: the strength edit panel's own (hidden but
    // DOM-present) add-type tab button shares the same class combination,
    // which would otherwise hit Playwright's strict mode.
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill('טסט' + Date.now());
    // Scoped to #cardioAddTypeForm: the strength edit panel's own (hidden
    // but DOM-present) confirm-add button shares the exact same "הוסף"
    // text, which would otherwise hit Playwright's strict mode.
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    await expect(page.locator('#cardioEditListContainer .edit-card')).toHaveCount(8);
    await expect(page.locator('#cardioEditListContainer .edit-card').first().locator('input[disabled]')).toBeVisible();
  });
```

with:

```ts
  test('add type seeds the 8 default fields including a locked date field', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    // Scoped to #cardioEditTabs: the strength edit panel's own (hidden but
    // DOM-present) add-type tab button shares the same class combination,
    // which would otherwise hit Playwright's strict mode.
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill('טסט' + Date.now());
    // Scoped to #cardioAddTypeForm: the strength edit panel's own (hidden
    // but DOM-present) confirm-add button shares the exact same "הוסף"
    // text, which would otherwise hit Playwright's strict mode.
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    await expect(page.locator('#cardioEditListContainer .edit-card')).toHaveCount(8);
    await expect(page.locator('#cardioEditListContainer .edit-card').first().locator('input[disabled]')).toBeVisible();
    // Auto-seeded default fields are locked from the moment they're created
    // — same as any already-saved field, never shown a type picker. This is
    // a confirmed design decision (not an oversight): see
    // docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md.
    await expect(page.locator('#cardioEditListContainer .edit-card .field-type-picker')).toHaveCount(0);
  });
```

- [ ] **Step 2: Replace the now-invalid "field type picker toggles" test**

In `tests/running.spec.ts`, replace lines 322-328:

```ts
  test('field type picker toggles between text/number/checkbox', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    const secondField = page.locator('#cardioEditListContainer .edit-card').nth(1);
    await secondField.locator('.ftype-btn[data-ftype="checkbox"]').click();
    await expect(secondField.locator('.ftype-btn[data-ftype="checkbox"]')).toHaveClass(/active/);
  });
```

with:

```ts
  test('only a newly-added field shows the type picker; existing fields never do', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();

    // Baseline: whatever real, already-saved fields exist on the currently
    // active type must show zero pickers.
    const existingCount = await page.locator('#cardioEditListContainer .edit-card').count();
    expect(existingCount).toBeGreaterThan(1); // at least the locked date field + one real field
    await expect(page.locator('#cardioEditListContainer .edit-card .field-type-picker')).toHaveCount(0);

    // Add a field this session — only THIS row shows the picker.
    await page.locator('#cardioEditPanel button[onclick="addCardioEditField()"]').click();
    const newField = page.locator('#cardioEditListContainer .edit-card').last();
    await expect(newField.locator('.field-type-picker')).toBeVisible();
    await expect(page.locator('#cardioEditListContainer .edit-card').first().locator('.field-type-picker')).toHaveCount(0);

    // It can still be toggled between types before saving, and the target
    // input (text/number/none) follows the current selection exactly as
    // before this change.
    await newField.locator('.ftype-btn[data-ftype="checkbox"]').click();
    await expect(newField.locator('.ftype-btn[data-ftype="checkbox"]')).toHaveClass(/active/);
    await expect(newField.locator('.cardio-field-target-input')).toHaveCount(0);
    await newField.locator('.ftype-btn[data-ftype="number"]').click();
    await expect(newField.locator('.ftype-btn[data-ftype="number"]')).toHaveClass(/active/);
    await expect(newField.locator('.cardio-field-target-input')).toHaveAttribute('type', 'number');

    // Never saved — remove the unsaved row so this test leaves no trace on
    // the real account (nothing was ever written to Firestore; the type's
    // template in memory reverts on next page load regardless, but removing
    // it explicitly keeps this test's intent self-evident).
    await newField.locator('.edit-remove').click();
  });
```

- [ ] **Step 3: Add the regression test for the riskiest part of this change — an existing field's type must survive further edits**

This is the single most dangerous failure mode this whole feature introduces: once a field's picker is gone, `collectItemFromRow` must read its type from the stamped `data-field-type` attribute, never fall through to a `'text'` default. A field that looks right immediately after being saved but silently flips back to `text` the next time *any* `collectEdits('cardio')` runs (switching tabs, adding another field, saving again) would be a serious, easy-to-miss data-corrupting regression — it needs its own direct test, not just inline reasoning in a code comment.

In `tests/running.spec.ts`, add this test to the `Cardio Template Editor` describe block, directly after the test added in Step 2:

```ts
  test('an existing (already-saved) field keeps its number type across further edits in the same session', async ({ page }) => {
    await page.locator('#mainGearBtn').click();
    await page.locator('.settings-item', { hasText: 'אימוני אירובי' }).click();
    const typeName = 'CTLOCK3_' + Date.now();
    let typeId = '';
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill(typeName);
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#cardioEditTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();

    try {
      // Add and save a NUMBER field — this becomes "existing" and locked.
      await page.locator('#cardioEditPanel button[onclick="addCardioEditField()"]').click();
      const numberField = page.locator('#cardioEditListContainer .edit-card').last();
      await numberField.locator('.cardio-field-label-input').fill('NumLockTest');
      await numberField.locator('.ftype-btn[data-ftype="number"]').click();
      await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');

      // Identify it by its stable data-id (not position — a second field
      // added below shifts what .last() means) so the same locator keeps
      // pointing at the right row throughout the rest of this test.
      const savedFieldId = await page.locator('#cardioEditListContainer .edit-card').last().getAttribute('data-id');
      expect(savedFieldId).toBeTruthy();
      const savedNumberField = page.locator(`#cardioEditListContainer .edit-card[data-id="${savedFieldId}"]`);
      await expect(savedNumberField.locator('.cardio-field-target-input')).toHaveAttribute('type', 'number');
      await expect(savedNumberField.locator('.field-type-picker')).toHaveCount(0);

      // Add a second, still-unsaved field — this forces a collectEdits('cardio')
      // round-trip (the exact call every add/remove/switch-tab/save makes)
      // that must NOT coerce the first field's type back to 'text'.
      await page.locator('#cardioEditPanel button[onclick="addCardioEditField()"]').click();
      await expect(savedNumberField.locator('.cardio-field-target-input')).toHaveAttribute('type', 'number');
      await expect(savedNumberField.locator('.field-type-picker')).toHaveCount(0);

      // Remove the second (never-saved) field so only NumLockTest is left
      // to clean up below.
      await page.locator('#cardioEditListContainer .edit-card').last().locator('.edit-remove').click();
    } finally {
      const removeBtn = page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
      }
    }
  });
```

- [ ] **Step 4: Run all three tests and verify they fail against current code**

Run: `export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/running.spec.ts -g "add type seeds the 8 default fields|only a newly-added field shows the type picker|keeps its number type across further edits"`

Expected: FAIL — the `toHaveCount(0)` assertions on `.field-type-picker` fail because every field, including already-saved ones, currently renders the picker unconditionally. (The third test may also fail differently once the picker-hiding lands ahead of the `collectItemFromRow` fix — that's expected mid-implementation, not just before it; Step 11 is what must show all three green.)

- [ ] **Step 5: Implement the `_isNew` marker on `newItem()`**

In `public/index.html`, line 3309, replace:

```js
    newItem: () => ({ id: genId(), label: '', fieldType: 'text', target: '' }),
```

with:

```js
    newItem: () => ({ id: genId(), label: '', fieldType: 'text', target: '', _isNew: true }),
```

- [ ] **Step 6: Stamp `data-field-type` and `data-is-new` on every edit-card row**

In `public/index.html`, inside `renderEditList` (around line 4772-4790), replace:

```js
  items.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className            = 'edit-card';
    card.dataset.id           = ex.id           || '';
    card.dataset.legacyTarget = ex._legacyTarget || '';
    card.innerHTML = D.renderItemRow(ex, idx);
    el.appendChild(card);
  });
```

with:

```js
  items.forEach((ex, idx) => {
    const card = document.createElement('div');
    card.className            = 'edit-card';
    card.dataset.id           = ex.id           || '';
    card.dataset.legacyTarget = ex._legacyTarget || '';
    // Cardio-only (harmless no-op for strength, whose items never carry
    // fieldType/_isNew): data-field-type is the stable, locked-in source of
    // truth for an existing row's type once its picker is gone; data-is-new
    // marks a row created this session and not yet saved, per
    // docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md.
    card.dataset.fieldType    = ex.fieldType     || '';
    card.dataset.isNew        = ex._isNew ? '1' : '';
    card.innerHTML = D.renderItemRow(ex, idx);
    el.appendChild(card);
  });
```

- [ ] **Step 7: Only render the picker for a new (unsaved) field**

In `public/index.html`, inside `WORKOUT_DOMAINS.cardio.renderItemRow` (around line 3310-3342), replace the non-date branch:

```js
      const targetInputHtml = f.fieldType === 'checkbox' ? '' :
        `<input class="cardio-field-target-input" type="${f.fieldType === 'number' ? 'number' : 'text'}" value="${escHtml(f.target || '')}" placeholder="${t('col.target')}">`;
      return `
      <span class="drag-handle">⠿</span>
      <div class="edit-fields">
        <input class="cardio-field-label-input" value="${escHtml(cardioFieldDisplayLabel(f))}" placeholder="${t('edit.field_label_ph')}">
        <div class="field-type-picker" data-idx="${idx}">
          <button type="button" class="ftype-btn${f.fieldType==='text'?' active':''}" data-ftype="text" onclick="setCardioFieldType(${idx},'text')">${t('edit.ftype_text')}</button>
          <button type="button" class="ftype-btn${f.fieldType==='number'?' active':''}" data-ftype="number" onclick="setCardioFieldType(${idx},'number')">${t('edit.ftype_number')}</button>
          <button type="button" class="ftype-btn${f.fieldType==='checkbox'?' active':''}" data-ftype="checkbox" onclick="setCardioFieldType(${idx},'checkbox')">${t('edit.ftype_checkbox')}</button>
        </div>
        ${targetInputHtml}
      </div>
      <button class="edit-remove" onclick="removeCardioEditField(${idx})">✕</button>`;
```

with:

```js
      const targetInputHtml = f.fieldType === 'checkbox' ? '' :
        `<input class="cardio-field-target-input" type="${f.fieldType === 'number' ? 'number' : 'text'}" value="${escHtml(f.target || '')}" placeholder="${t('col.target')}">`;
      // The type picker only ever appears on a field the user is actively
      // creating (added this session via addCardioEditField, never yet
      // saved) — see
      // docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md.
      // Once a field has been through one successful saveCardioTemplates(),
      // it's reloaded from Firestore without this flag and is locked
      // forever after — the only way to change its type is to delete it
      // (removeCardioEditField) and add a fresh one.
      const typePickerHtml = f._isNew ? `
        <div class="field-type-picker" data-idx="${idx}">
          <button type="button" class="ftype-btn${f.fieldType==='text'?' active':''}" data-ftype="text" onclick="setCardioFieldType(${idx},'text')">${t('edit.ftype_text')}</button>
          <button type="button" class="ftype-btn${f.fieldType==='number'?' active':''}" data-ftype="number" onclick="setCardioFieldType(${idx},'number')">${t('edit.ftype_number')}</button>
          <button type="button" class="ftype-btn${f.fieldType==='checkbox'?' active':''}" data-ftype="checkbox" onclick="setCardioFieldType(${idx},'checkbox')">${t('edit.ftype_checkbox')}</button>
        </div>` : '';
      return `
      <span class="drag-handle">⠿</span>
      <div class="edit-fields">
        <input class="cardio-field-label-input" value="${escHtml(cardioFieldDisplayLabel(f))}" placeholder="${t('edit.field_label_ph')}">
        ${typePickerHtml}
        ${targetInputHtml}
      </div>
      <button class="edit-remove" onclick="removeCardioEditField(${idx})">✕</button>`;
```

- [ ] **Step 8: Make `collectItemFromRow` read a locked row's type from the stamped attribute, not the (now-absent) picker**

In `public/index.html`, inside `WORKOUT_DOMAINS.cardio.collectItemFromRow` (around line 3343-3363), replace:

```js
    collectItemFromRow: c => {
      const labelInput = c.querySelector('.cardio-field-label-input');
      // The date field's picker never renders an `.active` ftype-btn (none of the
      // text/number/checkbox buttons match fieldType 'date'), so falling through to
      // the field-type-picker lookup would silently rewrite it to 'text' on every
      // collectEdits() call — defeating removeCardioEditField's date-is-protected
      // guard entirely. renderItemRow's own `disabled` marker on this input is the
      // one reliable signal that survives the round-trip, so read fieldType off of it.
      const isDate = labelInput.disabled;
      const fieldType = isDate ? 'date' : (c.querySelector('.field-type-picker .ftype-btn.active')?.dataset.ftype || 'text');
      // renderItemRow shows the TRANSLATED text for an untouched default
      // field (cardioFieldDisplayLabel) — reverse that back to the
      // canonical stored label here, or a plain save while the UI happens
      // to be in English would permanently overwrite e.g. "מרחק" with
      // "Distance".
      const label = _cardioFieldSaveLabel(c.dataset.id || '', labelInput.value);
      const result = { id: c.dataset.id || '', label, fieldType };
      if (isDate) result.hidden = !c.querySelector('.cardio-date-hidden-toggle').checked;
      else result.target = c.querySelector('.cardio-field-target-input')?.value || '';
      return result;
    },
```

with:

```js
    collectItemFromRow: c => {
      const labelInput = c.querySelector('.cardio-field-label-input');
      // The date field's picker never renders an `.active` ftype-btn (none of the
      // text/number/checkbox buttons match fieldType 'date'), so falling through to
      // the field-type-picker lookup would silently rewrite it to 'text' on every
      // collectEdits() call — defeating removeCardioEditField's date-is-protected
      // guard entirely. renderItemRow's own `disabled` marker on this input is the
      // one reliable signal that survives the round-trip, so read fieldType off of it.
      const isDate = labelInput.disabled;
      const isNew  = c.dataset.isNew === '1';
      // A new (unsaved) row's picker is the live source of truth for its
      // fieldType — the user can still be clicking between text/number/
      // checkbox. A locked (already-saved) row has no picker in the DOM at
      // all (see renderItemRow), so its fieldType must come from the value
      // stamped on the card at render time (renderEditList) instead —
      // falling through to the old `|| 'text'` default here would silently
      // rewrite every existing number/checkbox field back to 'text' on the
      // very next collectEdits() call (switch tab, add/remove a field, or
      // Save itself). See
      // docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md.
      const fieldType = isDate ? 'date'
        : isNew ? (c.querySelector('.field-type-picker .ftype-btn.active')?.dataset.ftype || 'text')
        : c.dataset.fieldType;
      // renderItemRow shows the TRANSLATED text for an untouched default
      // field (cardioFieldDisplayLabel) — reverse that back to the
      // canonical stored label here, or a plain save while the UI happens
      // to be in English would permanently overwrite e.g. "מרחק" with
      // "Distance".
      const label = _cardioFieldSaveLabel(c.dataset.id || '', labelInput.value);
      const result = { id: c.dataset.id || '', label, fieldType };
      if (isDate) result.hidden = !c.querySelector('.cardio-date-hidden-toggle').checked;
      else result.target = c.querySelector('.cardio-field-target-input')?.value || '';
      if (isNew) result._isNew = true;
      return result;
    },
```

- [ ] **Step 9: Strip `_isNew` before writing to Firestore**

In `public/index.html`, inside `WORKOUT_DOMAINS.cardio.buildSaveDoc` (around line 3364-3370), replace:

```js
    buildSaveDoc: (types, templates) => {
      const templateData = { types };
      types.forEach(type => {
        templateData[type.id] = (templates[type.id] || []).filter(f => f.label.trim());
      });
      return templateData;
    },
```

with:

```js
    buildSaveDoc: (types, templates) => {
      const templateData = { types };
      types.forEach(type => {
        templateData[type.id] = (templates[type.id] || [])
          .filter(f => f.label.trim())
          // Strip the transient _isNew marker (renderItemRow/collectItemFromRow's
          // own in-memory "still being created, not yet saved" flag) — it must
          // never reach Firestore. Built as a fresh object (not an in-place
          // `delete`) so a failed setDoc() doesn't leave the in-memory
          // cardioEditTemplates state mutated as if it had already saved.
          .map(f => { const { _isNew, ...rest } = f; return rest; });
      });
      return templateData;
    },
```

- [ ] **Step 10: Preserve `_isNew` through a manual type switch in `setCardioFieldType`**

In `public/index.html`, inside `setCardioFieldType` (around line 4978-4997), replace:

```js
  const label  = _cardioFieldSaveLabel(card.dataset.id || '', card.querySelector('.cardio-field-label-input')?.value || '');
  const target = card.querySelector('.cardio-field-target-input')?.value || '';
  card.innerHTML = WORKOUT_DOMAINS.cardio.renderItemRow({ id: card.dataset.id, label, fieldType: ftype, target }, idx);
}
```

with:

```js
  const label  = _cardioFieldSaveLabel(card.dataset.id || '', card.querySelector('.cardio-field-label-input')?.value || '');
  const target = card.querySelector('.cardio-field-target-input')?.value || '';
  // This function is only ever reachable by clicking a .ftype-btn, which
  // renderItemRow only renders when f._isNew is true — so card.dataset.isNew
  // is always '1' here in practice. Reading it back explicitly (rather than
  // hardcoding true) keeps the row's picker visible for further clicks
  // without assuming why this function was called.
  const isNew = card.dataset.isNew === '1';
  card.innerHTML = WORKOUT_DOMAINS.cardio.renderItemRow({ id: card.dataset.id, label, fieldType: ftype, target, _isNew: isNew }, idx);
}
```

- [ ] **Step 11: Re-run all three tests from Steps 1-3 and verify they pass**

Run: `export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/running.spec.ts -g "add type seeds the 8 default fields|only a newly-added field shows the type picker|keeps its number type across further edits"`

Expected: PASS (3 passed).

- [ ] **Step 12: Update the product doc for this section, now that the behavior is verified working**

In `docs/product/07-running-cardio.md`, find this bullet (inside "## עורך תבניות אירובי (Template Editor)"):

```
- **לכל שדה בתבנית של הסוג הפעיל:** קלט תווית (label) לעריכה, ובורר סוג שדה (text/number/checkbox) שלושה כפתורים. שדות `text`/`number` מקבלים גם קלט יעד (ראו "יעד לשדות אירובי" למעלה).
```

Replace it with:

```
- **לכל שדה בתבנית של הסוג הפעיל:** קלט תווית (label) לעריכה. שדות `text`/`number` מקבלים גם קלט יעד (ראו "יעד לשדות אירובי" למעלה).
- **בורר סוג שדה (text/number/checkbox), חדש 2026-09-15:** מוצג **אך ורק** על שדה שנוסף הרגע דרך "+ הוסף שדה" באותו סשן עריכה, ולפני שנשמר בפועל. לכל שדה אחר — כולל שדות שכבר נשמרו בעבר בהיסטוריה של התבנית, **וגם** שמונת שדות ברירת המחדל שנזרעים אוטומטית ביצירת סוג אימון חדש (ראו למעלה) — הסוג נעול לצמיתות ואינו ניתן לשינוי במקום. הדרך היחידה לשנות את סוגו של שדה קיים היא למחוק אותו (✕) וליצור שדה חדש עם הסוג הרצוי (החלטת עיצוב מכוונת, לא מגבלה טכנית — ראו `docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md`). אין אינדיקציה חזותית נפרדת לסוג של שדה נעול — הסוג ניתן להיסק מנוכחות/צורת שדה היעד (מספרי/טקסטואלי/נעדר לגמרי עבור checkbox).
```

- [ ] **Step 13: Commit**

```bash
git add public/index.html tests/running.spec.ts docs/product/07-running-cardio.md docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md docs/superpowers/plans/2026-09-15-cardio-field-type-lock.md
git commit -m "$(cat <<'EOF'
feat: lock cardio field type after first save

The text/number/checkbox picker in the cardio template editor now only
shows on a field just added via "+ הוסף שדה", before it's saved. Every
other field — including already-saved ones and a new type's 8
auto-seeded defaults — is locked to its type permanently; the only way
to change it is to delete and recreate the field.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Lock a field immediately upon successful Save, without needing to leave the page

**Files:**
- Modify: `public/index.html:5042-5057` (`saveCardioTemplates`)
- Modify: `tests/running.spec.ts` (new test, placed in the `Cardio Template Editor` describe block after the test added in Task 1 Step 2)
- Modify: `docs/product/07-running-cardio.md` (append one sentence to the bullet edited in Task 1 Step 12)

**Interfaces:**
- Consumes: `cardioEditPanelOpen` (existing module-level boolean), `cardioEditTab` (existing module-level string), `renderEditList(domain, type)` (existing generic dispatcher, unchanged signature).
- Produces: no new exports — this task only changes `saveCardioTemplates()`'s internal behavior (adds one re-render call after a successful save).

- [ ] **Step 1: Write the new test for immediate post-save locking**

In `tests/running.spec.ts`, insert this test into the `Cardio Template Editor` describe block, directly after the test added in Task 1 Step 2 (after its closing `});`, before the describe block's own closing `});`):

```ts
  test('a saved field is locked immediately after Save — no reload or navigation needed', async ({ page }) => {
    await openCardioEditPanel(page);
    const typeName = 'CTLOCK_' + Date.now();
    let typeId = '';
    await page.locator('#cardioEditTabs .tab-btn.add-tab-btn').click();
    await page.locator('#cardioNewTypeName').fill(typeName);
    await page.locator('#cardioAddTypeForm button', { hasText: 'הוסף' }).click();
    typeId = (await page.locator('#cardioEditTabs .tab-item.active').getAttribute('data-id')) || '';
    expect(typeId).toBeTruthy();

    try {
      // Add one genuinely new field to the throwaway type — it shows the
      // picker before saving, exactly like the read-only test above.
      await page.locator('#cardioEditPanel button[onclick="addCardioEditField()"]').click();
      const newField = page.locator('#cardioEditListContainer .edit-card').last();
      await newField.locator('.cardio-field-label-input').fill('LockTest');
      await expect(newField.locator('.field-type-picker')).toBeVisible();

      // Save — the picker must be gone from THIS SAME row immediately,
      // without a reload or navigating away and back.
      await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
      const savedField = page.locator('#cardioEditListContainer .edit-card').last();
      await expect(savedField.locator('.field-type-picker')).toHaveCount(0);
      // Still a text field underneath (its target input is still shown,
      // just with no way left to change the type in place).
      await expect(savedField.locator('.cardio-field-target-input')).toBeVisible();
    } finally {
      const removeBtn = page.locator(`#cardioEditTabs .tab-item[data-id="${typeId}"] .tab-remove`);
      if (await removeBtn.count() > 0) {
        await removeBtn.click();
        await clickSaveAndSettle(page, '#cardioEditPanel button[onclick="saveCardioTemplates()"]');
      }
    }
  });
```

- [ ] **Step 2: Run the new test and verify it fails against current code**

Run: `export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/running.spec.ts -g "a saved field is locked immediately after Save"`

Expected: FAIL — the picker is still visible on the just-saved field because `saveCardioTemplates()` doesn't yet re-render `#cardioEditListContainer` after `reloadAppData()`.

- [ ] **Step 3: Make `saveCardioTemplates()` re-render the list immediately after a successful save**

In `public/index.html`, inside `saveCardioTemplates` (around line 5042-5057), replace:

```js
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'runningTemplates'), templateData);
    toast(t('edit.saved_ok'), 'success');
    await reloadAppData();
  } catch (err) {
    toast(t('error.save') + firestoreErrMsg(err), 'error');
  }
```

with:

```js
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'config', 'runningTemplates'), templateData);
    toast(t('edit.saved_ok'), 'success');
    await reloadAppData();
    // reloadAppData() -> loadRunData() rebuilds cardioEditTemplates fresh
    // from what was just written to Firestore, which never carries the
    // transient _isNew marker (buildSaveDoc strips it before the write) —
    // so any field the user just added and saved is now "existing" in that
    // in-memory data. But nothing re-draws #cardioEditListContainer itself
    // (reloadAppData()'s own selectType() call only touches the strength
    // daily-entry page) — without this, a just-saved field's type picker
    // would keep showing, stale, until the user did something else that
    // happened to re-render the list. Re-render explicitly so it disappears
    // immediately, while still on this screen — see
    // docs/superpowers/specs/2026-09-15-cardio-field-type-lock-design.md.
    if (cardioEditPanelOpen && cardioEditTab) renderEditList('cardio', cardioEditTab);
  } catch (err) {
    toast(t('error.save') + firestoreErrMsg(err), 'error');
  }
```

- [ ] **Step 4: Re-run the test from Step 2 and verify it passes**

Run: `export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/running.spec.ts -g "a saved field is locked immediately after Save"`

Expected: PASS (1 passed).

- [ ] **Step 5: Append the immediate-lock nuance to the product doc**

In `docs/product/07-running-cardio.md`, in the bullet added in Task 1 Step 12 (starting "**בורר סוג שדה (text/number/checkbox), חדש 2026-09-15:**"), append this sentence at the end of the bullet (after the existing "...נעדר לגמרי עבור checkbox)." sentence):

```
 שדה שנוסף ואז נשמר בהצלחה ('שמור שינויים') הופך נעול **מיידית — גם בלי לצאת מהעמוד** — ולא רק בביקור הבא בעורך.
```

- [ ] **Step 6: Commit**

```bash
git add public/index.html tests/running.spec.ts docs/product/07-running-cardio.md
git commit -m "$(cat <<'EOF'
feat: lock cardio field immediately after successful save

saveCardioTemplates() now re-renders the field list right after a
successful save, so a just-added field's type picker disappears
immediately instead of only after leaving and reopening the editor.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Full regression pass

**Files:** none modified (verification only, unless a regression is found — in that case, fix it in the file it lives in and note the fix in this task's own commit).

**Interfaces:** none — this task only runs existing suites.

- [ ] **Step 1: Run the full cardio suite**

Run: `export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/running.spec.ts`

Expected: same pass/fail counts as this repo's known pre-existing baseline (roughly 11-14 "exercise-card timing race" failures and 2-3 "#darkModeToggle" failures under full-suite load — both unrelated to this feature and pre-existing before this plan started) **plus** the 3 tests touched/added by Tasks 1-2 passing. No *new* failure beyond that baseline is acceptable — if one appears, treat it as a real regression from this plan's changes and fix it before proceeding (do not dismiss it as "probably pre-existing" without checking git history / re-running against `main` first).

- [ ] **Step 2: Run the full strength template-editor suite (shared `renderEditList`/`collectEdits`/drag-and-drop code)**

Run: `export $(grep -v '^#' .env.test | xargs) && npx playwright test tests/workout.spec.ts`

Expected: same pass/fail counts as this repo's known pre-existing baseline. `renderEditList` gained two new `dataset` assignments in Task 1 Step 6 that are no-ops for strength items (`ex.fieldType`/`ex._isNew` are always `undefined` there) — this run is what actually confirms that assumption instead of just trusting the reasoning.

- [ ] **Step 3: If both runs match baseline, no further action. If a new failure appears, fix it and re-run before considering this plan complete.**
