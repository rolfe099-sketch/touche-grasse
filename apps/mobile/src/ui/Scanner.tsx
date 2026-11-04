import { useCallback, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useApp } from '../state/AppContext';
import { Button, Field } from './components';
import { Text } from './Text';
import { colors } from './theme';
export function Scanner({ onAdded }: { onAdded: () => void }) {
  const app = useApp(), [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(false), [code, setCode] = useState(''), [message, setMessage] = useState('');
  const scanned = useRef(false);
  useFocusEffect(useCallback(() => { scanned.current = false; return () => { scanned.current = true; setActive(false); }; }, []));
  function lookup(value: string) {
    setActive(false); setCode(value);
    const food = app.repo.foods.find(item => item.barcode === value.trim());
    if (food) { app.setDraft({ ...app.draft, lines: [...app.draft.lines, { id: app.repo.id(), query: food.name, food, quantityText: '100', unit: food.referenceUnit }] }); onAdded(); }
    else setMessage('No saved product for this barcode. Add the verified label values to keep it.');
  }
  return <View testID="inline-scanner" style={{ paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 12 }}>
    <Text style={{ fontSize: 14, color: colors.secondary }}>Scan a saved product or enter its barcode.</Text>
    {Platform.OS !== 'web' && <>{active && permission?.granted ? <CameraView style={{ height: 220, borderRadius: 8 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }} onBarcodeScanned={event => { if (!scanned.current) { scanned.current = true; lookup(event.data); } }} /> : <Button label="Open camera" icon="camera" onPress={() => void (async () => { const granted = permission?.granted || (await requestPermission()).granted; if (granted) { scanned.current = false; setActive(true); } else setMessage('Camera access is off. Type the barcode below.'); })()} />}{active && <Button label="Stop camera" onPress={() => setActive(false)} />}</>}
    <Field label="Barcode" keyboardType="number-pad" value={code} onChangeText={setCode} /><Button label="Find saved product" onPress={() => lookup(code)} disabled={!/^\d{8,14}$/.test(code)} />
    {!!message && <><Text style={{ fontSize: 13, color: colors.secondary }}>{message}</Text><Button label="Add this product" onPress={() => router.push({ pathname: '/manual', params: { barcode: code } })} /></>}
    <Text style={{ fontSize: 11, color: colors.secondary }}>{Platform.OS === 'web' ? 'Camera scanning is available on your phone. ' : ''}New barcodes need verified nutrition; remote lookup and label OCR are not connected.</Text>
  </View>;
}
