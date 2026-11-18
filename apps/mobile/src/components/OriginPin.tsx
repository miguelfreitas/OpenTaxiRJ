import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function OriginPin({ color = colors.pin }: { color?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.head, { backgroundColor: color }]}>
        <View style={styles.core} />
      </View>
      <View style={[styles.stem, { backgroundColor: color }]} />
      <View style={styles.shadow} />
    </View>
  );
}

export function OriginDot() {
  return <View style={styles.dot} />;
}

export function DriverMarker() {
  return (
    <View style={styles.driverWrap}>
      <View style={styles.driverBody}>
        <Text style={styles.driverLetter}>T</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    height: 58,
    width: 44,
  },
  head: {
    alignItems: 'center',
    borderColor: colors.surface,
    borderRadius: 22,
    borderWidth: 3,
    elevation: 5,
    height: 44,
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    width: 44,
  },
  core: {
    backgroundColor: colors.pinCore,
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  stem: {
    height: 12,
    marginTop: -2,
    width: 4,
  },
  shadow: {
    backgroundColor: colors.shadow,
    borderRadius: 4,
    height: 5,
    marginTop: 1,
    opacity: 0.22,
    width: 14,
  },
  dot: {
    backgroundColor: colors.accent,
    borderColor: colors.surface,
    borderRadius: 9,
    borderWidth: 3,
    height: 18,
    width: 18,
  },
  driverWrap: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    elevation: 6,
    height: 48,
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    width: 48,
  },
  driverBody: {
    alignItems: 'center',
    backgroundColor: colors.pin,
    borderColor: colors.text,
    borderRadius: 17,
    borderWidth: 2,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  driverLetter: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
});
