import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '../state/AppContext';
import { Button, Field, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';
import { BarcodeCandidate, sameBarcode } from '../domain/barcode';
import { lookupBarcode } from '../platform/barcode';
import { BarcodeReview } from './BarcodeReview';
export function Scanner({ onAdded }: { onAdded: () => void }) {
  const app = useApp(), [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false), [code, setCode] = useState(''), [message, setMessage] = useState('');
  const scanned = useRef(false);
  const focused = useRef(false), permissionRequest = useRef(0), opening = useRef(false), capturing = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const [looking, setLooking] = useState(false), [candidate, setCandidate] = useState<BarcodeCandidate>();
  const lookupGeneration = useRef(0), lookupRequest = useRef<AbortController | undefined>(undefined);
  const cancelLookup = useCallback(() => { lookupGeneration.current++; lookupRequest.current?.abort(); lookupRequest.current = undefined; setLooking(false); }, []);
  const stopCamera = useCallback(() => { permissionRequest.current++; opening.current = false; capturing.current = false; setRequesting(false); setActive(false); }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true; scanned.current = false;
    return () => { focused.current = false; scanned.current = true; stopCamera(); cancelLookup(); };
  }, [stopCamera, cancelLookup]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background' || (state === 'inactive' && capturing.current)) { stopCamera(); cancelLookup(); }
    });
    return () => subscription.remove();
  }, [stopCamera, cancelLookup]);
  async function openCamera() {
    if (opening.current) return;
    cancelLookup(); setCandidate(undefined);
    opening.current = true; setRequesting(true); setMessage('');
    const request = ++permissionRequest.current;
    try {
      const granted = permission?.granted || (await requestPermission()).granted;
      if (request !== permissionRequest.current || !focused.current) return;
      if (granted && AppState.currentState === 'active') { scanned.current = false; capturing.current = true; setActive(true); }
      else if (!granted) setMessage('Camera access is off. Type the barcode below or enable access in device settings.');
    } catch {
      if (request === permissionRequest.current && focused.current) setMessage('The camera could not open. Type the barcode below.');
    } finally {
      if (request === permissionRequest.current) { opening.current = false; setRequesting(false); }
    }
  }
  async function lookup(value: string, type?: string) {
    stopCamera(); cancelLookup(); setCode(value); setMessage(''); setCandidate(undefined);
    const normalized = value.trim().replace(/[\s-]/g, ''), equivalent = app.repo.foods.filter(item => item.barcode && sameBarcode(item.barcode, value));
    const exact = app.repo.foods.find(item => item.barcode === normalized), food = exact ?? (equivalent.length === 1 ? equivalent[0] : undefined);
    if (!food && equivalent.length > 1) { setMessage('Several saved records share this barcode. Choose the correct product in Library.'); return; }
    if (food) { const ok = await app.run(() => app.repo.addBarcodeFood(food, app.draft), 'Saved product added', true); if (ok && focused.current) onAdded(); return; }
    if (type === 'upc_e') { setMessage('Enter the full UPC-A barcode or add the package label manually.'); return; }
    const generation = lookupGeneration.current, controller = new AbortController(); lookupRequest.current = controller; setLooking(true);
    try {
      const result = await lookupBarcode(value, controller.signal);
      if (!focused.current || generation !== lookupGeneration.current) return;
      if (result.kind === 'found') setCandidate(result.candidate);
      else setMessage('No product found. Add the package label to save it for next time.');
    } catch (reason) {
      if (focused.current && generation === lookupGeneration.current && !controller.signal.aborted) setMessage(reason instanceof Error ? reason.message : 'Could not find this product. Enter the label manually.');
    } finally { if (focused.current && generation === lookupGeneration.current) { setLooking(false); lookupRequest.current = undefined; } }
  }
  const cameraGeneration = permissionRequest.current;
  return <View testID="inline-scanner" style={{ paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 12 }}>
    {!candidate && <Text style={{ fontSize: 14, color: colors.secondary }}>Scan a package or enter its barcode.</Text>}
    {!candidate && <Button compact icon="photo" label={Platform.OS === 'web' ? 'Scan a nutrition label' : 'Photograph nutrition label'} disabled={app.busy || looking} onPress={() => { stopCamera(); cancelLookup(); router.push({ pathname: '/manual', params: { barcode: code.replace(/[\s-]/g, ''), ...(Platform.OS !== 'web' ? { capture: app.repo.id() } : {}) } }); }} />}
    {Platform.OS !== 'web' && !candidate && <>{active && permission?.granted ? <CameraView style={{ height: 220, borderRadius: 8 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onMountError={() => { if (focused.current && cameraGeneration === permissionRequest.current) { stopCamera(); setMessage('The camera could not open. Type the barcode below.'); } }} onBarcodeScanned={event => { if (focused.current && cameraGeneration === permissionRequest.current && capturing.current && !scanned.current) { scanned.current = true; void lookup(event.data, event.type); } }} /> : <Button label={requesting ? 'Opening camera…' : 'Scan barcode'} icon="camera" disabled={requesting || app.busy} onPress={() => void openCamera()} />}{active && <Button label="Stop camera" onPress={stopCamera} />}{permission && !permission.granted && !permission.canAskAgain && <TextButton label="Open device settings" onPress={() => void Linking.openSettings().catch(() => setMessage('Open Settings on your phone to enable camera access.'))} />}</>}
    <Field compact={!!candidate} label="Barcode" keyboardType="number-pad" value={code} editable={!app.busy} onChangeText={value => { cancelLookup(); setCandidate(undefined); setCode(value); setMessage(''); }} maxLength={30} />{!candidate && <Button label={looking ? 'Finding product…' : 'Find product'} onPress={() => void lookup(code)} disabled={looking || app.busy || !/^\d{8,14}$/.test(code.replace(/[\s-]/g, ''))} />}
    {looking && <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: colors.secondary }}>Looking up this barcode…</Text>}
    {candidate && <BarcodeReview key={`${candidate.barcode}:${candidate.retrievedAt}`} candidate={candidate} onAdded={onAdded} onCancel={() => { cancelLookup(); setCandidate(undefined); }} />}
    {!!message && <><Text accessibilityRole="alert" style={{ fontSize: 13, color: colors.secondary }}>{message}</Text><Button label="Add this product" disabled={app.busy} onPress={() => router.push({ pathname: '/manual', params: { barcode: code.replace(/[\s-]/g, '') } })} /></>}
    <Text style={{ fontSize: 11, color: colors.secondary }}>{Platform.OS === 'web' ? 'Camera scanning is available on your phone. ' : ''}New barcodes use Open Food Facts. Only the barcode is sent; your diary stays here.</Text>
  </View>;
}
