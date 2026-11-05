# Label capture and comparison

Label photos still go straight to recognition and the existing editable review. Optional rescue controls stay on that screen; ordinary scans do not require cropping or another confirmation step.

## Crop and rotate

Choose **Crop / rotate** beneath a photo. Rotate left/right in quarter turns, then drag the four crop handles. **Adjust edges precisely** provides labelled percentage fields as an alternative to dragging. Keep the reference amount (for example, per 100 g) and the nutrient units inside the frame. Invalid, inverted or tiny crops cannot be submitted.

**Read cropped photo** performs a real pixel rotation and crop, then runs local OCR again. Every edit starts from the original normalized photo, avoiding progressive cropping or repeated lossy compression. **Reset** restores the original framing and orientation inside the editor; it does not change any saved values until Read is pressed. **Cancel crop** leaves the image and nutrition review unchanged.

The new reading uses the same rescan safeguards: current values and corrections remain until the user reviews the new column. Compatible columns can fill missing values while preserving intentional blanks and explicit zero. Different units or preparation require explicit replacement. No density, cooking yield, absorbed oil or nutrition is inferred from the photo.

## Compare and correct

After choosing a reading, **Compare with photo** places its matching photo above one editable nutrient. Energy, Protein, Carbs, Fat and Fiber controls switch the active value. **Zoom photo** enlarges the image in a scrollable viewport; **All values** returns to the compact grid. Source text and explicit unit confirmations remain available. Corrections write to the existing retained label draft.

Comparison is offered only when the in-memory photo matches the selected scan. A pending rescan or a discarded newer reading cannot silently display a different photo as evidence for the older values. Reopening a label after losing the transient photo retains its text, readings and corrections; choose the photo again to compare it.

## Resource ownership and interruptions

Cancelling a replacement picker preserves the previous preview. Failed or cancelled recognition keeps its photo available for another crop or manual review. Backgrounding stops active recognition without automatically applying late results, retaining the preview while the screen remains mounted. Leaving the label screen releases its owned original and edited temporary images. Late picker/transform results are released rather than attached to a newer request.

Photos and crop controls are transient and are not included in diary exports or recovery copies. Existing label values, corrections, pending scan text and historical nutrition keep their normal persistence. Saving a food does not log it as eaten. Saved reviewed barcode records retain offline reuse.

The implementation uses the existing image manipulator on iPhone and a local canvas in the browser; it adds no native module or cloud image service. The installed development app can load it through a developer Reload.

## Verification

Pure geometry and session tests cover rotated axes, pixel bounds, accessible edge inputs, repeated edits from the original, cancelled pickers, OCR failures and late transformed-file cleanup. Browser tests use an actual sideways synthetic label image, real crop/rotate processing and real local Tesseract OCR. They verify the transformed dimensions, correction preservation, photo-linked comparison, explicit unknowns and exact per-100 nutrition scaling without eating the food.

Synthetic images establish that the pipeline works, not broad accuracy across packaging. Actual iPhone crop gestures, native image rendering, zoom/keyboard comfort, VoiceOver and several fresh Norwegian package photos remain physical-device acceptance checks.
