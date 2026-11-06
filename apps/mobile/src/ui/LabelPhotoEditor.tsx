import { useMemo, useRef, useState } from 'react';
import { Image, PanResponder, View } from 'react-native';
import { CropBox, cropFromMargins, fullLabelImage, LabelImageEdit, moveCropCorner, rotatedSize } from '../domain/labelImage';
import { LabelPhotoView } from '../platform/labelPhoto.types';
import { Button, Field, TextButton } from './components';
import { Text } from './Text';
import { colors } from './theme';

type Corner = Parameters<typeof moveCropCorner>[1];
function CropHandle({ corner, crop, width, height, onChange, disabled }: { corner: Corner; crop: CropBox; width: number; height: number; onChange: (crop: CropBox) => void; disabled: boolean }) {
  const props = useRef({ crop, width, height, onChange, disabled }); props.current = { crop, width, height, onChange, disabled };
  const start = useRef({ crop, width, height });
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !props.current.disabled,
    onMoveShouldSetPanResponder: () => !props.current.disabled,
    onPanResponderGrant: () => { start.current = props.current; },
    onPanResponderMove: (_, gesture) => {
      const value = start.current;
      props.current.onChange(moveCropCorner(value.crop, corner, gesture.dx / value.width, gesture.dy / value.height));
    },
    onPanResponderTerminationRequest: () => false,
  }), [corner]);
  const left = (corner.endsWith('left') ? crop.left : crop.right) * width, top = (corner.startsWith('top') ? crop.top : crop.bottom) * height;
  return <View testID={`crop-${corner}`} {...pan.panHandlers} accessible={false} style={{ position: 'absolute', left: left - 22, top: top - 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><View style={{ width: 17, height: 17, borderRadius: 9, borderWidth: 3, borderColor: colors.copper, backgroundColor: colors.background }} /></View>;
}
const marginsFor = (crop: CropBox) => [crop.left, crop.top, 1 - crop.right, 1 - crop.bottom].map(value => String(Math.round(value * 1000) / 10));
export function LabelPhotoEditor({ photo, initial, busy, onApply, onCancel }: { photo: LabelPhotoView; initial: LabelImageEdit; busy: boolean; onApply: (edit: LabelImageEdit) => void; onCancel: () => void }) {
  const [rotation, setRotation] = useState(initial.rotation), [margins, setMargins] = useState(() => marginsFor(initial.crop)), [precise, setPrecise] = useState(false), [width, setWidth] = useState(300);
  const lastValid = useRef(initial.crop); let error = '';
  try { lastValid.current = cropFromMargins(margins); } catch (reason) { error = reason instanceof Error ? reason.message : 'Check the crop edges.'; }
  const crop = lastValid.current, size = rotatedSize(photo, rotation), scale = Math.min(Math.max(1, width - 44) / size.width, 300 / size.height), fitted = { width: size.width * scale, height: size.height * scale };
  function rotate(direction: number) { setRotation(((rotation + direction + 360) % 360) as LabelImageEdit['rotation']); setMargins(['0', '0', '0', '0']); lastValid.current = fullLabelImage().crop; }
  return <View testID="label-photo-editor" style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.line }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Text style={{ fontSize: 15, fontWeight: '600' }}>Crop nutrition table</Text>
    <Text style={{ fontSize: 12, color: colors.secondary }}>Keep the reference amount and units inside the frame.</Text>
    <View style={{ padding: 22, alignItems: 'center', backgroundColor: colors.surface }}>
      <View testID="crop-image-frame" style={{ width: fitted.width, height: fitted.height }}>
        <View style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><Image accessibilityLabel="Original label photo for cropping" source={{ uri: photo.uri }} resizeMode="contain" style={{ position: 'absolute', width: photo.width * scale, height: photo.height * scale, left: (fitted.width - photo.width * scale) / 2, top: (fitted.height - photo.height * scale) / 2, transform: [{ rotate: `${rotation}deg` }] }} /></View>
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: fitted.width, height: crop.top * fitted.height, backgroundColor: '#0009' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: crop.bottom * fitted.height, width: fitted.width, height: (1 - crop.bottom) * fitted.height, backgroundColor: '#0009' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: crop.top * fitted.height, width: crop.left * fitted.width, height: (crop.bottom - crop.top) * fitted.height, backgroundColor: '#0009' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: crop.right * fitted.width, top: crop.top * fitted.height, width: (1 - crop.right) * fitted.width, height: (crop.bottom - crop.top) * fitted.height, backgroundColor: '#0009' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: crop.left * fitted.width, top: crop.top * fitted.height, width: (crop.right - crop.left) * fitted.width, height: (crop.bottom - crop.top) * fitted.height, borderWidth: 1, borderColor: colors.copper }} />
        {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as Corner[]).map(corner => <CropHandle key={corner} corner={corner} crop={crop} width={fitted.width} height={fitted.height} onChange={value => setMargins(marginsFor(value))} disabled={busy} />)}
      </View>
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' }}><TextButton label="Rotate left" accessibilityLabel="Rotate label photo left" disabled={busy} onPress={() => rotate(-90)} /><TextButton label="Rotate right" accessibilityLabel="Rotate label photo right" disabled={busy} onPress={() => rotate(90)} /><TextButton label="Reset" accessibilityLabel="Reset label photo crop" disabled={busy} onPress={() => { setRotation(0); setMargins(['0', '0', '0', '0']); lastValid.current = fullLabelImage().crop; }} /></View>
    <TextButton label={precise ? 'Hide edge controls' : 'Adjust edges precisely'} onPress={() => setPrecise(!precise)} />
    {precise && <View><Text style={{ color: colors.secondary, fontSize: 11 }}>Percent trimmed from each edge</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['Left', 'Top', 'Right', 'Bottom'].map((name, index) => <View key={name} style={{ width: '47%' }}><Field compact label={`${name} trim · %`} value={margins[index]} keyboardType="decimal-pad" selectTextOnFocus maxLength={6} editable={!busy} onChangeText={value => setMargins(old => old.map((item, i) => i === index ? value : item))} /></View>)}</View></View>}
    {!!error && <Text accessibilityRole="alert" style={{ fontSize: 12, color: colors.error }}>{error}</Text>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}><Button compact primary label="Read cropped photo" disabled={busy || !!error} onPress={() => onApply({ rotation, crop })} /><TextButton label="Cancel crop" disabled={busy} onPress={onCancel} /></View>
  </View>;
}
