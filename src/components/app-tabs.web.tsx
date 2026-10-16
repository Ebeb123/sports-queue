// ---------------------------------------------------------------------------
// WEB TABS  (browser build only — phones use app-tabs.tsx with native tabs)
// ---------------------------------------------------------------------------
// Shows the app in a phone-width column with the same four tabs as the
// mobile app, plus a small "Demo" bar that explains the sample data and lets
// visitors reset it.
// ---------------------------------------------------------------------------
import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps, type TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '../theme';
import { DB_NAME } from '../db/db';
import { resetDatabase } from '../db/sqlite';
import { Alert } from '../lib/alert';

export default function AppTabs() {
  const C = useColors();
  return (
    <View style={[styles.page, { backgroundColor: C.bg }]}>
      <View style={[styles.phone, { backgroundColor: C.bg, borderColor: C.line }]}>
        <DemoBar />
        <Tabs>
          <TabSlot style={{ flex: 1 }} />
          <TabList asChild>
            <BottomBar>
              <TabTrigger name="index" href="/" asChild>
                <TabButton>Admin</TabButton>
              </TabTrigger>
              <TabTrigger name="explore" href="/explore" asChild>
                <TabButton>Queue</TabButton>
              </TabTrigger>
              <TabTrigger name="live" href="/live" asChild>
                <TabButton>Live</TabButton>
              </TabTrigger>
              <TabTrigger name="manage" href="/manage" asChild>
                <TabButton>Manage</TabButton>
              </TabTrigger>
            </BottomBar>
          </TabList>
        </Tabs>
      </View>
    </View>
  );
}

function DemoBar() {
  const C = useColors();
  const reset = () => {
    Alert.alert('Reset demo?', 'This restores the sample players and games. Your changes in this browser will be cleared.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetDatabase(DB_NAME);
          window.location.reload();
        },
      },
    ]);
  };
  return (
    <View style={[styles.demo, { backgroundColor: C.card2, borderBottomColor: C.line }]}>
      <Text style={[styles.demoText, { color: C.muted }]} numberOfLines={2}>
        <Text style={{ color: C.text, fontWeight: '800' }}>Demo</Text> · sample players, saved only in your browser
      </Text>
      <Pressable onPress={reset} style={({ pressed }) => [styles.demoBtn, { borderColor: C.line, opacity: pressed ? 0.6 : 1 }]}>
        <Text style={{ color: C.text, fontSize: 12, fontWeight: '700' }}>Reset</Text>
      </Pressable>
    </View>
  );
}

function BottomBar(props: TabListProps) {
  const C = useColors();
  return <View {...props} style={[styles.bar, { backgroundColor: C.card, borderTopColor: C.line }]} />;
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const C = useColors();
  return (
    <Pressable {...props} style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}>
      <View style={[styles.pill, isFocused && { backgroundColor: C.lime }]}>
        <Text style={[styles.tabText, { color: isFocused ? C.onLime : C.muted }]}>{children}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  phone: { flex: 1, width: '100%', maxWidth: 480, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  demo: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  demoText: { flex: 1, fontSize: 12 },
  demoBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, paddingHorizontal: 6 },
  tab: { flex: 1, alignItems: 'center' },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  tabText: { fontSize: 13, fontWeight: '700' },
});
