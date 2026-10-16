import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView } from 'react-native';
import { Alert } from '../lib/alert';
import { useFocusEffect } from 'expo-router';

import { getCourts, addCourt, setCourtStatus, removeCourt, startNewSession, resetAllData, type Court } from '../db/db';
import { useColors, type Palette } from '../theme';

export default function ManageScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourtName, setNewCourtName] = useState('');
  const refresh = useCallback(() => setCourts(getCourts()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function handleNewSession() {
    Alert.alert('Start New Session', 'Clears the queue and per-session game counts. Player records are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start New', style: 'destructive', onPress: () => { startNewSession(); refresh(); Alert.alert('Done', 'A new session has started.'); } },
    ]);
  }
  function handleReset() {
    Alert.alert('Reset All Data', 'Permanently deletes every player, court, match, and record. There is no undo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete Everything', style: 'destructive', onPress: () => { resetAllData(); refresh(); Alert.alert('Done', 'All data cleared.'); } },
    ]);
  }
  function handleAddCourt() { const n = newCourtName.trim(); if (!n) return; addCourt(n); setNewCourtName(''); refresh(); }
  function toggleCourt(c: Court) {
    if (c.status === 'occupied') { Alert.alert('Court in use', 'You cannot close a court while a match is playing.'); return; }
    setCourtStatus(c.court_id, c.status === 'open' ? 'closed' : 'open'); refresh();
  }
  function confirmRemove(c: Court) {
    Alert.alert('Remove court', `Delete ${c.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { const r = removeCourt(c.court_id); if (!r.ok) { Alert.alert('Cannot remove', r.reason ?? ''); return; } refresh(); } },
    ]);
  }
  const dot = (s: Court['status']) => (s === 'open' ? C.green : s === 'occupied' ? C.amber : C.red);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={styles.h1}>Manage</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session</Text>
        <Pressable onPress={handleNewSession} style={({ pressed }) => [styles.btn, { backgroundColor: C.red }, pressed && styles.pressed]}><Text style={styles.btnText}>Start New Session</Text></Pressable>
        <Text style={styles.hint}>Clears the queue and per-session game counts. Player records are kept.</Text>
      </View>

      <View style={styles.headRow}><Text style={styles.h2}>Courts</Text><Text style={styles.count}>{courts.length}</Text></View>
      <View style={styles.addRow}>
        <TextInput style={styles.input} placeholder="New court name" placeholderTextColor={C.muted} value={newCourtName} onChangeText={setNewCourtName} />
        <Pressable onPress={handleAddCourt} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}><Text style={styles.addBtnText}>Add</Text></Pressable>
      </View>
      <View style={styles.list}>
        {courts.map((c) => (
          <View key={c.court_id} style={styles.row}>
            <View style={[styles.statusDot, { backgroundColor: dot(c.status) }]} />
            <View style={{ flex: 1 }}><Text style={styles.courtName}>{c.name}</Text><Text style={styles.courtStatus}>{c.status}</Text></View>
            <Pressable onPress={() => toggleCourt(c)} disabled={c.status === 'occupied'} style={({ pressed }) => [styles.miniBtn, c.status === 'occupied' ? { backgroundColor: C.card2 } : c.status === 'open' ? { backgroundColor: C.amber } : { backgroundColor: C.green }, pressed && c.status !== 'occupied' && styles.pressed]}>
              <Text style={[styles.miniText, c.status === 'occupied' && { color: C.muted }]}>{c.status === 'occupied' ? 'In use' : c.status === 'open' ? 'Close' : 'Open'}</Text>
            </Pressable>
            <Pressable onPress={() => confirmRemove(c)} style={({ pressed }) => [styles.miniBtn, { backgroundColor: C.red }, pressed && styles.pressed]}><Text style={[styles.miniText, { color: '#fff' }]}>Remove</Text></Pressable>
          </View>
        ))}
      </View>

      <Text style={[styles.h2, { marginTop: 28, marginBottom: 12 }]}>Danger Zone</Text>
      <Pressable onPress={handleReset} style={({ pressed }) => [styles.btn, { backgroundColor: '#7f1d1d' }, pressed && styles.pressed]}><Text style={styles.btnText}>Reset All Data</Text></Pressable>
      <Text style={styles.hint}>Deletes all players, courts, matches, and records. Cannot be undone.</Text>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  h1: { fontSize: 30, fontWeight: '800', color: C.text, marginBottom: 16 },
  h2: { fontSize: 20, fontWeight: '700', color: C.text },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  count: { fontSize: 14, color: C.muted, fontWeight: '600' },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 18, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  hint: { fontSize: 12, color: C.muted },
  btn: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  input: { flex: 1, backgroundColor: C.card2, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, fontSize: 15, color: C.text },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  addBtn: { backgroundColor: C.lime, borderRadius: 14, paddingHorizontal: 22, justifyContent: 'center' },
  addBtnText: { color: C.onLime, fontWeight: '800' },
  list: { backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  courtName: { fontSize: 16, color: C.text, fontWeight: '600' },
  courtStatus: { fontSize: 12, color: C.muted, marginTop: 2, textTransform: 'capitalize' },
  miniBtn: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  miniText: { color: '#241a00', fontWeight: '700', fontSize: 12 },
  pressed: { opacity: 0.7 },
});