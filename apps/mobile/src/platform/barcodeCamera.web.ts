import type { CameraViewProps, useCameraPermissions as NativePermissions } from 'expo-camera';
import type { ComponentType } from 'react';

// Expo Camera's web module eagerly starts a CDN-backed QR worker at import time,
// even though this app offers barcode camera capture only on native platforms.
// Do not import that implementation for typing, local OCR or manual barcodes.
const unavailable = async (): Promise<never> => { throw new Error('Barcode camera capture is available in the native app.'); };
export const useCameraPermissions: typeof NativePermissions = () => [null, unavailable, unavailable];
export const CameraView: ComponentType<CameraViewProps> = () => { throw new Error('Barcode camera capture is available in the native app.'); };
