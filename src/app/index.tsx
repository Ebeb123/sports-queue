import { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { addPlayer, getAllPlayers, updatePlayer, deletePlayer, deletePlayers, LEVELS, type Level, type Player } from '../db/db';
import { useColors, type Palette } from '../theme';

export default function AdminScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [name, setName] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<Level>('Beginner');
  const [players, setPlayers] = useState<Player[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [editing, setEditing] = useState<Player | null>(null);
  const [editName, setEditName] = useState('');
  const [editLevel, setEditLevel] = useState<Level>('Beginner');

  const refresh = useCallback(() => setPlayers(getAllPlayers()), []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q === '' ? players : players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);
  const allSelected = filtered.length > 0 && filtered.every((p) => selected.includes(p.player_id));

  function handleAdd() { const n = name.trim(); if (!n) return; addPlayer(n, selectedLevel); setName(''); setSelectedLevel('Beginner'); refresh(); }
  function toggleSelect(id: number) { setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }
  function toggleSelectAll() { setSelected(allSelected ? [] : filtered.map((p) => p.player_id)); }
  function deleteSelected() {
    if (!selected.length) return;
    Alert.alert('Delete selected players', `Remove ${selected.length} player(s)? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { const r = deletePlayers(selected); setSelected([]); refresh(); if (r.skipped > 0) Alert.alert('Done', `Deleted ${r.deleted}. Skipped ${r.skipped} (in an active match).`); } },
    ]);
  }
  function openEdit(p: Player) { setEditing(p); setEditName(p.name); setEditLevel(p.level); }
  function saveEdit() { if (!editing) return; const n = editName.trim(); if (!n) return; updatePlayer(editing.player_id, n, editLevel); setEditing(null); refresh(); }
  function confirmDelete() {
    if (!editing) return;
    Alert.alert('Delete player', `Remove ${editing.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { const r = deletePlayer(editing.player_id); if (!r.ok) { Alert.alert('Cannot delete', r.reason ?? ''); return; } setEditing(null); refresh(); } },
    ]);
  }

  const LevelPill = ({ level }: { level: Level }) => (
    <View style={styles.pill}><Text style={styles.pillText}>{level}</Text></View>
  );
  const LevelSelector = ({ value, onChange }: { value: Level; onChange: (l: Level) => void }) => (
    <View style={styles.segWrap}>
      {LEVELS.map((l) => (
        <Pressable key={l} onPress={() => onChange(l)} style={({ pressed }) => [styles.segPill, value === l && styles.segPillOn, pressed && styles.pressed]}>
          <Text style={[styles.segText, value === l && styles.segTextOn]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={styles.h1}>Players</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add Player</Text>
        <TextInput style={styles.input} placeholder="Player name" placeholderTextColor={C.muted} value={name} onChangeText={setName} />
        <LevelSelector value={selectedLevel} onChange={setSelectedLevel} />
        <Pressable onPress={handleAdd} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
          <Text style={styles.primaryBtnText}>Add Player</Text>
        </Pressable>
      </View>

      <View style={styles.headRow}><Text style={styles.h2}>All Players</Text><Text style={styles.count}>{filtered.length}</Text></View>
      <TextInput style={styles.input} placeholder="Search by name" placeholderTextColor={C.muted} value={search} onChangeText={setSearch} autoCorrect={false} clearButtonMode="while-editing" />

      <View style={styles.toolbar}>
        <Pressable style={styles.selectAll} onPress={toggleSelectAll}>
          <View style={[styles.checkbox, allSelected && styles.checkboxOn]} />
          <Text style={styles.selectAllText}>Select all</Text>
        </Pressable>
        <Pressable onPress={deleteSelected} disabled={!selected.length} style={({ pressed }) => [styles.delBtn, !selected.length && styles.delBtnOff, pressed && selected.length > 0 && styles.pressed]}>
          <Text style={[styles.delBtnText, !selected.length && { color: C.muted }]}>Delete ({selected.length})</Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {filtered.length === 0 ? (
          <Text style={styles.empty}>No players found.</Text>
        ) : (
          filtered.map((p) => {
            const sel = selected.includes(p.player_id);
            return (
              <Pressable key={p.player_id} onPress={() => toggleSelect(p.player_id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <View style={[styles.checkbox, sel && styles.checkboxOn]} />
                <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                <LevelPill level={p.level} />
                <Pressable onPress={() => openEdit(p)} hitSlop={6} style={({ pressed }) => [styles.editBtn, pressed && styles.pressed]}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              </Pressable>
            );
          })
        )}
      </View>

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.cardTitle}>Edit Player</Text>
            <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholderTextColor={C.muted} />
            <LevelSelector value={editLevel} onChange={setEditLevel} />
            <View style={styles.modalRow}>
              <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.mBtn, { backgroundColor: C.red }, pressed && styles.pressed]}><Text style={styles.mBtnText}>Delete</Text></Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setEditing(null)} style={({ pressed }) => [styles.mBtn, { backgroundColor: C.card2 }, pressed && styles.pressed]}><Text style={[styles.mBtnText, { color: C.text }]}>Cancel</Text></Pressable>
              <Pressable onPress={saveEdit} style={({ pressed }) => [styles.mBtn, { backgroundColor: C.lime }, pressed && styles.pressed]}><Text style={[styles.mBtnText, { color: C.onLime }]}>Save</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  h1: { fontSize: 30, fontWeight: '800', color: C.text, marginBottom: 16 },
  h2: { fontSize: 20, fontWeight: '700', color: C.text },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  count: { fontSize: 14, color: C.muted, fontWeight: '600' },
  card: { backgroundColor: C.card, borderRadius: 24, padding: 18, gap: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  input: { backgroundColor: C.card2, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, fontSize: 15, color: C.text },
  segWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segPill: { backgroundColor: C.card2, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  segPillOn: { backgroundColor: C.lime },
  segText: { fontSize: 13, color: C.muted, fontWeight: '600' },
  segTextOn: { color: C.onLime },
  primaryBtn: { backgroundColor: C.lime, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  primaryBtnText: { color: C.onLime, fontWeight: '800', fontSize: 16 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  selectAllText: { color: C.text, fontSize: 14, fontWeight: '600' },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: C.muted, backgroundColor: 'transparent' },
  checkboxOn: { backgroundColor: C.lime, borderColor: C.lime },
  delBtn: { backgroundColor: C.red, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  delBtnOff: { backgroundColor: C.card2 },
  delBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  list: { backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  rowName: { flex: 1, fontSize: 16, color: C.text, fontWeight: '500' },
  pill: { backgroundColor: C.card2, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 11 },
  pillText: { fontSize: 12, fontWeight: '600', color: C.muted },
  editBtn: { backgroundColor: C.card2, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  editBtnText: { color: C.text, fontWeight: '600', fontSize: 13 },
  empty: { color: C.muted, padding: 20, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: C.card, borderRadius: 24, padding: 20, gap: 14 },
  modalRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mBtn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18 },
  mBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});