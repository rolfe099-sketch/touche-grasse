# Reviewed barcode lookup and on-device recovery

## Barcode workflow

Quick Log → Scan first checks saved products, including equivalent leading-zero GTINs. Saved products add immediately and work offline. New, checksum-valid barcodes are looked up through Open Food Facts API v3.6. Only the barcode, requested fields and application identification are sent. No diary, photos, account or label corrections are uploaded.

The first lookup shows an editable inline review. Check the product, reference unit, calories/macros/fiber and amount against the package. Confirming saves the product and adds its draft row in one storage transaction; it does not log food as eaten. The normal Log action records the reviewed amount. Unknown values remain unknown, including fiber. Saving or correcting a product never recalculates historical entries.

Barcode and direct product-selection rows keep their adapter origin. Scanning or selecting a packaged product does not teach a generic text query such as “chicken” to select that product. Provider text names/aliases need their own explicit product match; that confirmed text mapping is then remembered normally. Barcode reuse still uses the saved record immediately.

The importer chooses one explicit `as_sold` manufacturer/packaging input set per basis, favoring usable completeness, manufacturer data and then recency. If both g and ml sets exist, the user must choose the basis printed on the package. Switching loads the corresponding set, keeps edits separately and does not infer density or convert the amount. It does not combine sets or use aggregated estimates, prepared nutrition, macros-derived energy, cooking yields or serving sizes inferred from package weight. A serving is normalized only when its measured mass/volume is explicit. Reported kJ can be converted using 4.184 kJ/kcal, with a visible note. Missing/unsupported bases need manual label entry. New camera UPC-E codes require the full UPC-A code or manual entry; saved legacy codes continue to work.

Reviewed products retain Open Food Facts attribution, ODbL lineage, retrieval time, original imported values, review time and per-nutrient correction provenance. English and Norwegian product names are retained when provided. This is a reviewed community product record, not a Matvaretabellen record or a claim of independent verification.

Library → Foods → Edit updates a saved personal/package label for future additions. A selected ingredient also offers Edit label; that action updates only the specified draft row and the saved food atomically. Quantities and units stay as entered, so changing a nutrition basis never silently converts a consumed amount. Eaten food and existing recipe snapshots retain their original values.

Requests time out after ten seconds. Unconfirmed results are cached in memory for fifteen minutes, missing results for one minute, with at most 100 cache entries. Confirmed products persist in the existing local food store. The client permits at most twelve uncached requests per minute and pauses after HTTP 429. Editing the barcode, leaving Scan or backgrounding cancels an outstanding request; late results cannot add food. No automatic retry loop runs.

Provider documentation: [API introduction and limits](https://openfoodfacts.github.io/openfoodfacts-server/api/), [nutrition input-set schema](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/ref/schemas/product_nutrition_v3.yaml), [barcode normalization](https://openfoodfacts.github.io/openfoodfacts-server/api/ref-barcode-normalization/), [license guidance](https://openfoodfacts.github.io/openfoodfacts-server/api/tutorials/license-be-on-the-legal-side/).

## Recovery workflow

After three seconds without diary/draft changes, the app exports its acknowledged state to a separate recovery store. Empty new diaries do not replace meaningful copies. Settings → Backup → On-device recovery lists versions, allows creating/exporting a copy, and previews a recovery before merging it. Existing foods, recipes, confirmed matches, historical entries and an active unfinished meal win during recovery. This recovers missing records rather than rolling existing entries back. Inventory validation still rejects incompatible portion merges. Ordinary file import retains its existing behavior, including updating matching foods and recipes.

Native copies use the app's persistent document directory, outside the active SQLite database. Web copies use a separate IndexedDB database, outside the active diary store. Metadata is listed without loading every full archive. A new copy is read back and compared before older versions are removed. A noncryptographic checksum detects accidental corruption; full schema and nutrition validation also run before a merge. The checksum is not encryption or protection against deliberate tampering.

Up to six copies and 100 MB of JSON payload are retained, including the latest pre-restore image. Each copy is limited to 50 MB. Native writes publish a complete file before its metadata; interrupted partial/unpublished files are cleaned on the next write. Failed writes preserve prior copies and do not block ordinary logging. Settings reports recovery failures. Imports make a best-effort pre-restore copy while retaining the existing validated merge behavior if backup storage is unavailable.

These copies stay on the same device/origin. They do not protect against uninstalling, clearing all app/site data, device loss or complete storage failure. Save exports elsewhere for that. There is no cloud sync, scheduled OS background job or promise that a copy finishes if the app is killed during the three-second delay. Native file-port tests do not establish physical iOS Files behavior.

## Verification

Automated tests cover checked GTINs, normalized barcode identity, reviewed g/ml math, absent/zero fiber, prepared/estimated-data exclusion, label corrections, stale requests, outages, rate limiting, atomic product/draft writes, offline reuse, exact historical snapshots and Undo. Recovery tests exercise rotation, failed/partial writes, same-length corruption, reopening, a separate IndexedDB store, loss of an isolated primary test database, idempotent merge and draft preservation.

Deterministic browser tests use API fixtures. The optional `TG_LIVE_BARCODE=1` browser smoke uses the real provider without request fixtures. A successful response for one Norwegian product establishes that lookup path, not nationwide product coverage. The owner confirmed camera-to-review and recovery-copy creation/export to Files on iPhone 13 Pro. Camera permission/interruption cases and actual native recovery merge remain pending; see the physical acceptance table.
