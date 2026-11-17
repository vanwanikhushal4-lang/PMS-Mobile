import { useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Icon } from './Primitives';
import { useReducedMotion } from './motion';
import { color } from './theme';

const ease = Easing.out(Easing.cubic);
export function Phase({ children, shift = 0 }: PropsWithChildren<{ shift?: number }>) {
  const reduced = useReducedMotion();
  const [phase] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { phase.setValue(1); return; }
    const animation = Animated.timing(phase, { toValue: 1, duration: 340, easing: ease, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [phase, reduced]);
  return <Animated.View style={[styles.phase, { opacity: reduced ? 1 : phase,
    transform: [
      { translateX: reduced || !shift ? 0 : phase.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) },
      { translateY: reduced ? 0 : phase.interpolate({ inputRange: [0, 1], outputRange: [shift ? 4 : 12, 0] }) },
    ],
  }]}>{children}</Animated.View>;
}

export function AccessRail({ labels, index }: { labels: readonly string[]; index: number }) {
  const reduced = useReducedMotion();
  const [current] = useState(() => new Animated.Value(index));
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (reduced) { current.setValue(index); return; }
    const movement = Animated.timing(current, { toValue: index, duration: 340, easing: ease, useNativeDriver: true });
    movement.start();
    return () => movement.stop();
  }, [current, index, reduced]);
  const part = width / labels.length;
  const translateX = reduced ? part * index : current.interpolate({ inputRange: [0, 1], outputRange: [0, part] });
  return <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} accessibilityLabel={`Step ${index + 1} of ${labels.length}: ${labels[index]}`} accessible>
    <View style={styles.railLabels} aria-hidden>{labels.map((label, position) => <Text key={label} style={[styles.railLabel, { color: position === index ? color.text : color.subtle }]}>{label}</Text>)}</View>
    <View style={styles.rail}><Animated.View style={[styles.railMarker, { width: part, transform: [{ translateX }] }]} /></View>
  </View>;
}

export function Field({ label, secret = false, ...props }: TextInputProps & { label: string; secret?: boolean }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(false);
  const [focus] = useState(() => new Animated.Value(0));
  useEffect(() => () => { focus.stopAnimation(); }, [focus]);
  const focusBorder = (on: boolean) => {
    const toValue = on ? 1 : 0;
    if (reduced) focus.setValue(toValue);
    else Animated.timing(focus, { toValue, duration: 180, easing: ease, useNativeDriver: true }).start();
  };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputFrame}>
      <Animated.View pointerEvents="none" style={[styles.focus, { opacity: focus }]} />
      <TextInput placeholderTextColor={color.subtle} selectionColor={color.blue} autoCapitalize="none" autoCorrect={false}
        {...props} accessibilityLabel={label} secureTextEntry={secret && !shown}
        style={[styles.input, props.style]}
        onFocus={(event) => { focusBorder(true); props.onFocus?.(event); }}
        onBlur={(event) => { focusBorder(false); props.onBlur?.(event); }} />
      {secret && <Pressable accessibilityRole="button" accessibilityLabel={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        style={({ pressed }) => [styles.iconButton, pressed && styles.dim]} onPress={() => setShown((value) => !value)}>
        <Icon name={shown ? 'eye-off' : 'eye'} />
      </Pressable>}
    </View>
  </View>;
}

export function TextAction({ label, onPress, disabled = false, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const [focused, setFocused] = useState(false);
  return <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.textButton, focused && styles.focused, (pressed || disabled) && styles.dim]}>
    <Text style={styles.textAction}>{label}</Text>
  </Pressable>;
}

export function SearchField({ label, placeholder, value, onChange, onSubmit, onClear, testID }: {
  label: string; placeholder: string; value: string; onChange: (value: string) => void;
  onSubmit: () => void; onClear?: () => void; testID: string;
}) {
  return <View style={styles.inputFrame}>
    <View style={styles.searchIcon}><Icon name="search" /></View>
    <TextInput style={[styles.input, styles.searchInput]} accessibilityLabel={label} placeholder={placeholder}
      placeholderTextColor={color.subtle} selectionColor={color.blue} maxLength={120} testID={testID}
      autoCapitalize="none" autoCorrect={false} value={value} onChangeText={onChange}
      returnKeyType="search" onSubmitEditing={onSubmit} />
    {onClear ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={onClear}
      style={({ pressed }) => [styles.searchAction, pressed && styles.dim]}>
      <Text style={styles.clear}>Clear</Text>
    </Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onSubmit}
      style={({ pressed }) => [styles.searchAction, styles.submitSearch, pressed && styles.dim]}>
      <Text style={styles.textAction}>Search</Text>
    </Pressable>
  </View>;
}

export function FormMessage({ message }: { message: string }) {
  const reduced = useReducedMotion();
  const [arrival] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { arrival.setValue(1); return; }
    const entry = Animated.timing(arrival, { toValue: 1, duration: 180, easing: ease, useNativeDriver: true });
    entry.start();
    return () => entry.stop();
  }, [arrival, reduced]);
  return <Animated.Text testID="auth-error" accessibilityRole="alert" accessibilityLiveRegion="assertive"
    style={[styles.error, { opacity: reduced ? 1 : arrival }]}>{message}</Animated.Text>;
}

const styles = StyleSheet.create({
  phase: { gap: 20 }, railLabels: { flexDirection: 'row', paddingBottom: 8 },
  railLabel: { flex: 1, fontSize: 13, fontWeight: '500', paddingEnd: 4 },
  rail: { height: 2, backgroundColor: color.edge }, railMarker: { backgroundColor: color.blue, height: 2 },
  field: { gap: 8 }, label: { color: color.text, fontSize: 14, fontWeight: '500' },
  inputFrame: { minHeight: 52, flexDirection: 'row', alignItems: 'stretch', borderRadius: 8, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
  focus: { ...StyleSheet.absoluteFill, borderRadius: 8, borderWidth: 1, borderColor: color.blue },
  input: { flex: 1, minHeight: 48, color: color.text, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  searchInput: { minWidth: 0, paddingStart: 2, paddingEnd: 6 },
  searchIcon: { width: 37, justifyContent: 'center', alignItems: 'center' },
  searchAction: { minWidth: 44, paddingHorizontal: 9, justifyContent: 'center', alignItems: 'center' },
  submitSearch: { borderStartWidth: 1, borderColor: color.edge, paddingHorizontal: 12 },
  clear: { color: color.muted, fontSize: 13 },
  iconButton: { width: 48, alignItems: 'center', justifyContent: 'center' }, dim: { opacity: 0.65 },
  textButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  focused: { borderColor: color.blue },
  textAction: { color: color.blue, fontSize: 15, fontWeight: '500' },
  error: { color: color.error, backgroundColor: color.panel, padding: 12, fontSize: 14, lineHeight: 20, borderRadius: 8, borderLeftWidth: 2, borderLeftColor: color.error },
});
