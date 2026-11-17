import QRCode from 'qrcode';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { color } from './theme';

export function SetupCode({ uri }: { uri: string }) {
  const cells = useMemo(() => {
    const qr = QRCode.create(uri, { errorCorrectionLevel: 'M' }).modules;
    let path = '';
    for (let row = 0; row < qr.size; row++) {
      for (let col = 0; col < qr.size; col++) if (qr.get(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
    return { path, size: qr.size + 8 };
  }, [uri]);
  const key = new URL(uri).searchParams.get('secret');
  return <View style={styles.panel}>
    <View accessible accessibilityLabel="Authenticator setup QR code" accessibilityRole="image">
      <Svg width="100%" height={176} viewBox={`0 0 ${cells.size} ${cells.size}`} aria-hidden>
        <Rect width={cells.size} height={cells.size} fill="#ffffff" /><Path d={cells.path} fill="#12171d" />
      </Svg>
    </View>
    <Text style={styles.label}>Manual setup key</Text>
    <Text selectable style={styles.value}>{key}</Text>
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 8, padding: 12, backgroundColor: color.panel, borderColor: color.edge, borderWidth: 1, borderRadius: 12 },
  label: { color: color.muted, fontSize: 13 }, value: { color: color.text, fontSize: 15, lineHeight: 20 },
});
