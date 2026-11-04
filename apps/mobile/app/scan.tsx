import { router } from 'expo-router';
import { Screen } from '../src/ui/components';
import { Scanner } from '../src/ui/Scanner';
export default function Scan() { return <Screen title="Scan a barcode" back><Scanner onAdded={() => router.dismissTo('/entry')} /></Screen>; }
