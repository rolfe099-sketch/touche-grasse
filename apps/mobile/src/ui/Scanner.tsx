import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '../state/AppContext';
import { Button, Field, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';
export function Scanner({ onAdded }: { onAdded: () => void }) {
  const app = useApp(), [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false), [code, setCode] = useState(''), [message, setMessage] = useState('');
  const scanned = useRef(false);
  const focused = useRef(false), permissionRequest = useRef(0), opening = useRef(false), capturing = useRef(false);
  const [requesting, setRequesting] = useState(false);
  const stopCamera = useCallback(() => { permissionRequest.current++; opening.current = false; capturing.current = false; setRequesting(false); setActive(false); }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true; scanned.current = false;
    return () => { focused.current = false; scanned.current = true; stopCamera(); };
  }, [stopCamera]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background' || (state === 'inactive' && capturing.current)) stopCamera();
    });
    return () => subscription.remove();
  }, [stopCamera]);
  async function openCamera() {
    if (opening.current) return;
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
  function lookup(value: string) {
    stopCamera(); setCode(value); setMessage('');
    const food = app.repo.foods.find(item => item.barcode === value.trim());
    if (food) { app.setDraft({ ...app.draft, lines: [...app.draft.lines, { id: app.repo.id(), query: food.name, food, quantityText: '100', unit: food.referenceUnit }] }); onAdded(); }
    else setMessage('No saved product for this barcode. Add the verified label values to keep it.');
  }
  const cameraGeneration = permissionRequest.current;
  return <View testID="inline-scanner" style={{ paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 12 }}>
    <Text style={{ fontSize: 14, color: colors.secondary }}>Scan a saved product or enter its barcode.</Text>
    {Platform.OS !== 'web' && <>{active && permission?.granted ? <CameraView style={{ height: 220, borderRadius: 8 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onMountError={() => { if (focused.current && cameraGeneration === permissionRequest.current) { stopCamera(); setMessage('The camera could not open. Type the barcode below.'); } }} onBarcodeScanned={event => { if (focused.current && cameraGeneration === permissionRequest.current && capturing.current && !scanned.current) { scanned.current = true; lookup(event.data); } }} /> : <Button label={requesting ? 'Opening camera…' : 'Open camera'} icon="camera" disabled={requesting} onPress={() => void openCamera()} />}{active && <Button label="Stop camera" onPress={stopCamera} />}{permission && !permission.granted && !permission.canAskAgain && <TextButton label="Open device settings" onPress={() => void Linking.openSettings().catch(() => setMessage('Open Settings on your phone to enable camera access.'))} />}</>}
    <Field label="Barcode" keyboardType="number-pad" value={code} onChangeText={value => { setCode(value); setMessage(''); }} /><Button label="Find saved product" onPress={() => lookup(code)} disabled={!/^\d{8,14}$/.test(code)} />
    {!!message && <><Text accessibilityRole="alert" style={{ fontSize: 13, color: colors.secondary }}>{message}</Text>{message.startsWith('No saved product') && <Button label="Add this product" onPress={() => router.push({ pathname: '/manual', params: { barcode: code } })} />}</>}
    <Text style={{ fontSize: 11, color: colors.secondary }}>{Platform.OS === 'web' ? 'Camera scanning is available on your phone. ' : ''}New barcodes need verified nutrition; remote lookup and label OCR are not connected.</Text>
  </View>;
}
