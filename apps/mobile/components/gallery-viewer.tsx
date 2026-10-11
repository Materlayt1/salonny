import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type PanResponderInstance } from "react-native";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Real business photos only; no WebView or image-service dependency. */
export function GalleryViewer({ images, businessName, index, onIndexChange, onClose }: {
  images: string[];
  businessName: string;
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const visible = index !== null;
  const current = Math.min(Math.max(index ?? 0, 0), Math.max(images.length - 1, 0));
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "ArrowRight" && current < images.length - 1) { event.preventDefault(); onIndexChange(current + 1); }
      if (event.key === "ArrowLeft" && current > 0) { event.preventDefault(); onIndexChange(current - 1); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [current, images.length, onClose, onIndexChange, visible]);

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
      {visible ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.modal} accessibilityViewIsModal testID="business-gallery-viewer">
        <View style={styles.header}>
          <View style={styles.caption}>
            <Text style={styles.title} numberOfLines={1}>{businessName}</Text>
            <Text style={styles.counter} accessibilityLiveRegion="polite">Fotoğraf {current + 1} / {images.length}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fotoğraf galerisini kapat" onPress={onClose} style={styles.control}><X color="#fff" size={24} /></Pressable>
        </View>
        {visible && images[current] ? <GalleryPhoto key={`${current}-${images[current]}`} uri={images[current]} label={`${businessName}, fotoğraf ${current + 1}`} /> : null}
        <View style={styles.navigation}>
          <Pressable accessibilityRole="button" accessibilityLabel="Önceki fotoğraf" accessibilityState={{ disabled: current === 0 }} disabled={current === 0} onPress={() => onIndexChange(current - 1)} style={[styles.navigationButton, current === 0 && styles.disabled]}><ChevronLeft size={22} color="#fff" /><Text style={styles.controlText}>Önceki</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Sonraki fotoğraf" accessibilityState={{ disabled: current === images.length - 1 }} disabled={current === images.length - 1} onPress={() => onIndexChange(current + 1)} style={[styles.navigationButton, current === images.length - 1 && styles.disabled]}><Text style={styles.controlText}>Sonraki</Text><ChevronRight size={22} color="#fff" /></Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function GalleryPhoto({ uri, label }: { uri: string; label: string }) {
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [scale] = useState(() => new Animated.Value(1));
  const [translateX] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(0));
  const dimensions = useRef({ width: 1, height: 1 });
  const transform = useRef({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({ scale: 1, x: 0, y: 0, distance: 0, pinching: false });
  const lastTap = useRef(0);
  const responder = useRef<PanResponderInstance | null>(null);
  const apply = useCallback((nextScale: number, x: number, y: number) => {
    const next = clamp(nextScale, 1, 3);
    const nextX = clamp(x, -dimensions.current.width * (next - 1) / 2, dimensions.current.width * (next - 1) / 2);
    const nextY = clamp(y, -dimensions.current.height * (next - 1) / 2, dimensions.current.height * (next - 1) / 2);
    transform.current = { scale: next, x: nextX, y: nextY };
    scale.setValue(next); translateX.setValue(nextX); translateY.setValue(nextY);
  }, [scale, translateX, translateY]);
  const changeZoom = (next: number) => {
    apply(next, transform.current.x, transform.current.y);
    setZoom(transform.current.scale);
  };
  useEffect(() => {
    const distance = (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches;
      return touches.length > 1 ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) : 0;
    };
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => { gesture.current = { ...transform.current, distance: distance(event), pinching: event.nativeEvent.touches.length > 1 }; },
      onPanResponderMove: (event, state) => {
        const span = distance(event);
        if (span) {
          if (!gesture.current.pinching) gesture.current = { ...transform.current, distance: span, pinching: true };
          apply(gesture.current.scale * span / Math.max(gesture.current.distance, 1), gesture.current.x, gesture.current.y);
        } else if (gesture.current.pinching) {
          // Reset the anchor when a pinch becomes a one-finger gesture; avoid a jump.
          gesture.current = { ...transform.current, x: transform.current.x - state.dx, y: transform.current.y - state.dy, distance: 0, pinching: false };
        } else {
          apply(gesture.current.scale, gesture.current.x + state.dx, gesture.current.y + state.dy);
        }
      },
      onPanResponderRelease: (_event, state) => {
        if (!gesture.current.pinching && Math.abs(state.dx) + Math.abs(state.dy) < 8) {
          const now = Date.now();
          if (now - lastTap.current < 300) { apply(transform.current.scale > 1 ? 1 : 2, 0, 0); lastTap.current = 0; }
          else lastTap.current = now;
        }
        setZoom(transform.current.scale);
      },
      onPanResponderTerminate: () => setZoom(transform.current.scale),
    });
    return () => { responder.current = null; };
  }, [apply]);

  return (
    <View style={styles.photoContent}>
      <View
        testID="gallery-photo-viewport"
        style={styles.viewport}
        onLayout={({ nativeEvent }) => { dimensions.current = nativeEvent.layout; apply(transform.current.scale, transform.current.x, transform.current.y); }}
        onStartShouldSetResponder={(event) => !error && (responder.current?.panHandlers.onStartShouldSetResponder?.(event) ?? false)}
        onMoveShouldSetResponder={(event) => !error && (responder.current?.panHandlers.onMoveShouldSetResponder?.(event) ?? false)}
        onStartShouldSetResponderCapture={(event) => responder.current?.panHandlers.onStartShouldSetResponderCapture?.(event) ?? false}
        onMoveShouldSetResponderCapture={(event) => responder.current?.panHandlers.onMoveShouldSetResponderCapture?.(event) ?? false}
        onResponderGrant={(event) => responder.current?.panHandlers.onResponderGrant?.(event)}
        onResponderMove={(event) => responder.current?.panHandlers.onResponderMove?.(event)}
        onResponderStart={(event) => responder.current?.panHandlers.onResponderStart?.(event)}
        onResponderEnd={(event) => responder.current?.panHandlers.onResponderEnd?.(event)}
        onResponderRelease={(event) => responder.current?.panHandlers.onResponderRelease?.(event)}
        onResponderTerminate={(event) => responder.current?.panHandlers.onResponderTerminate?.(event)}
        onResponderTerminationRequest={(event) => responder.current?.panHandlers.onResponderTerminationRequest?.(event) ?? true}
        onResponderReject={(event) => responder.current?.panHandlers.onResponderReject?.(event)}
      >
        {error ? <View style={styles.photoError}><Text style={styles.controlText}>Fotoğraf yüklenemedi.</Text><Pressable accessibilityRole="button" onPress={() => { setError(false); setRevision((value) => value + 1); }} style={styles.navigationButton}><Text style={styles.controlText}>Yeniden dene</Text></Pressable></View> : <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX }, { translateY }, { scale }] }]}><Image key={revision} alt={label} accessible accessibilityRole="image" accessibilityLabel={label} source={{ uri }} resizeMode="contain" onError={() => setError(true)} style={styles.photo} /></Animated.View>}
      </View>
      <View style={styles.zoomControls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fotoğrafı uzaklaştır" disabled={zoom <= 1} accessibilityState={{ disabled: zoom <= 1 }} onPress={() => changeZoom(zoom - 0.5)} style={[styles.control, zoom <= 1 && styles.disabled]}><Minus size={22} color="#fff" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Fotoğraf yakınlaştırmasını sıfırla" accessibilityHint={`Yakınlaştırma yüzde ${Math.round(zoom * 100)}`} onPress={() => { apply(1, 0, 0); setZoom(1); }} style={styles.zoomLabel}><Text accessibilityLiveRegion="polite" style={styles.controlText}>%{Math.round(zoom * 100)}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Fotoğrafı yakınlaştır" disabled={zoom >= 3} accessibilityState={{ disabled: zoom >= 3 }} onPress={() => changeZoom(zoom + 0.5)} style={[styles.control, zoom >= 3 && styles.disabled]}><Plus size={22} color="#fff" /></Pressable>
      </View>
      <Text style={styles.hint}>Yakınlaştırmak için iki parmağını veya + düğmesini kullan.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: "#151820", flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  caption: { flex: 1, gap: 4 },
  title: { fontSize: 17, fontWeight: "500", color: "#fff" },
  counter: { color: "#C6CAD5", fontSize: 14 },
  control: { height: 48, width: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#2B303D" },
  controlText: { color: "#fff", fontSize: 15, fontWeight: "500" },
  photoContent: { flex: 1, gap: 12 },
  viewport: { flex: 1, overflow: "hidden" },
  photo: { width: "100%", height: "100%" },
  photoError: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18 },
  zoomControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  zoomLabel: { minWidth: 66, minHeight: 48, alignItems: "center", justifyContent: "center" },
  hint: { textAlign: "center", fontSize: 12, color: "#C6CAD5", paddingHorizontal: 20 },
  navigation: { flexDirection: "row", justifyContent: "space-between", padding: 16, gap: 16 },
  navigationButton: { minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: "#2B303D", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  disabled: { opacity: 0.4 },
});
