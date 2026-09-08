import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';

import {
  getPlayersNotQueued, getQueue, getWaitingPlayers, getOpenCourts, getActiveMatches,
  getAppConfig, getLastGroupmates, enqueuePlayer, pausePlayer, resumePlayer, leaveQueue,
  createMatch, endMatch, type Level, type Player, type QueueRow, type ActiveMatch,
} from '../db/db';
import { planAutoQueue, minutesSince } from '../logic/matchmaking';
import { useColors, type Palette } from '../theme';

type FilterLevel = Level | 'All';
const FILTERS: FilterLevel[] = ['All', 'Beginner', 'Intermediate', 'Advance', 'Pro'];

export default function QueueScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [available, setAvailable] = useState<Player[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<FilterLevel>('All');

  const refresh = useCallback(() => { setAvailable(getPlayersNotQueued()); setQueue(getQueue()); setMatches(getActiveMatches()); }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter((p) => (q === '' || p.name.toLowerCase().includes(q)) && (levelFilter === 'All' || p.level === levelFilter));
  }, [available, search, levelFilter]);
  const sortedQueue = useMemo(() => [...queue].sort((a, b) => (a.status === 'playing' ? 1 : 0) - (b.status === 'playing' ? 1 : 0)), [queue]);

  function add(id: number) { enqueuePlayer(id); refresh(); }
  function togglePause(r: QueueRow) { r.status === 'paused' ? resumePlayer(r.entry_id) : pausePlayer(r.entry_id); refresh(); }
  function remove(id: number) { leaveQueue(id); refresh(); }
  function handleAutoQueue() {
    const { matchConfig } = getAppConfig();
    const pool = getWaitingPlayers(); const openCourts = getOpenCourts(); const recent = getLastGroupmates();
    if (!openCourts.length) { Alert.alert('Auto Queue', 'No open courts available.'); return; }
    const plans = planAutoQueue(pool, openCourts.length, new Date(), matchConfig, recent);
    if (!plans.length) { Alert.alert('Auto Queue', `Not enough players. Need at least ${matchConfig.playersPerMatch} waiting.`); return; }
    plans.forEach((plan, i) => { const court = openCourts[i]; createMatch(court.court_id, matchConfig.matchType, plan.team1.map((p) => p.player_id), plan.team2.map((p) => p.player_id)); });
    refresh(); Alert.alert('Auto Queue', `Assigned ${plans.length} match(es).`);
  }
  function finish(m: ActiveMatch, t: 1 | 2) { endMatch(m.match_id, t); refresh(); }

  const Pill = ({ text, kind }: { text: string; kind: 'neutral' | 'playing' | 'wait' }) => {
    const m = { neutral: [C.card2, C.muted], playing: [C.lime, C.onLime], wait: [C.amber, '#241a00'] }[kind];
    return <View style={{ backgroundColor: m[0], borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}><Text style={{ color: m[1], fontSize: 11, fontWeight: '700' }}>{text}</Text></View>;
  };

  const now = new Date();
  const waitingCount = queue.filter((q) => q.status === 'waiting').length;
  const names = (t: { name: string }[]) => t.map((m) => m.name).join(' & ');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={styles.h1}>Queue</Text>

      <Text style={styles.label}>Add players</Text>
      <TextInput style={styles.input} placeholder="Search by name" placeholderTextColor={C.muted} value={search} onChangeText={setSearch} autoCorrect={false} clearButtonMode="while-editing" />
      <View style={styles.segWrap}>
        {FILTERS.map((f) => (
          <Pressable key={f} onPress={() => setLevelFilter(f)} style={({ pressed }) => [styles.segPill, levelFilter === f && styles.segPillOn, pressed && styles.pressed]}>
            <Text style={[styles.segText, levelFilter === f && styles.segTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.card}>
        {filteredAvailable.length === 0 ? (
          <Text style={styles.empty}>{available.length === 0 ? 'No available players. Add some in Admin.' : 'No players match.'}</Text>
        ) : (
          filteredAvailable.map((p) => (
            <Pressable key={p.player_id} onPress={() => add(p.player_id)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
              <Pill text={p.level} kind="neutral" />
              <View style={styles.addTag}><Text style={styles.addTagText}>Add</Text></View>
            </Pressable>
          ))
        )}
      </View>

      <Pressable onPress={handleAutoQueue} style={({ pressed }) => [styles.autoBtn, pressed && styles.pressed]}>
        <Text style={styles.autoBtnText}>Auto Queue</Text>
      </Pressable>

      <View style={styles.headRow}><Text style={styles.h2}>On Courts</Text><Text style={styles.count}>{matches.length}</Text></View>
      {matches.length === 0 ? (
        <Text style={styles.empty}>No matches in progress.</Text>
      ) : (
        matches.map((m) => (
          <View key={m.match_id} style={styles.matchCard}>
            <View style={styles.matchHead}><Text style={styles.courtName}>{m.court_name}</Text><Pill text="Playing" kind="playing" /></View>
            <Text style={styles.teamLine}>{names(m.team1)}</Text>
            <Text style={styles.vs}>vs</Text>
            <Text style={styles.teamLine}>{names(m.team2)}</Text>
            <View style={styles.winRow}>
              <Pressable onPress={() => finish(m, 1)} style={({ pressed }) => [styles.winBtn, { backgroundColor: C.blue }, pressed && styles.pressed]}><Text style={[styles.winBtnText, { color: '#fff' }]}>Team 1 Won</Text></Pressable>
              <Pressable onPress={() => finish(m, 2)} style={({ pressed }) => [styles.winBtn, { backgroundColor: C.lime }, pressed && styles.pressed]}><Text style={[styles.winBtnText, { color: C.onLime }]}>Team 2 Won</Text></Pressable>
            </View>
          </View>
        ))
      )}

      <View style={styles.headRow}><Text style={styles.h2}>Current Queue</Text><Text style={styles.count}>{waitingCount} waiting</Text></View>
      <View style={styles.card}>
        {sortedQueue.length === 0 ? (
          <Text style={styles.empty}>Queue is empty.</Text>
        ) : (
          sortedQueue.map((q) => {
            const wait = Math.floor(minutesSince(q.waiting_since, now));
            return (
              <View key={q.entry_id} style={[styles.row, q.status === 'playing' && { opacity: 0.5 }]}>
                <Text style={styles.rowName} numberOfLines={1}>{q.name}</Text>
                <Pill text={q.level} kind="neutral" />
                {q.status === 'playing' ? <Pill text="Playing" kind="playing" /> : q.status === 'paused' ? <Pill text="Paused" kind="wait" /> : <Pill text={`${wait}m`} kind="wait" />}
                {q.status !== 'playing' && (
                  <>
                    <Pressable onPress={() => togglePause(q)} style={({ pressed }) => [styles.miniBtn, { backgroundColor: C.amber }, pressed && styles.pressed]}><Text style={styles.miniText}>{q.status === 'paused' ? 'Resume' : 'Pause'}</Text></Pressable>
                    <Pressable onPress={() => remove(q.entry_id)} style={({ pressed }) => [styles.miniBtn, { backgroundColor: C.red }, pressed && styles.pressed]}><Text style={[styles.miniText, { color: '#fff' }]}>Leave</Text></Pressable>
                  </>
                )}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  h1: { fontSize: 30, fontWeight: '800', color: C.text, marginBottom: 16 },
  h2: { fontSize: 20, fontWeight: '700', color: C.text },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  count: { fontSize: 14, color: C.muted, fontWeight: '600' },
  label: { fontSize: 14, color: C.muted, fontWeight: '600', marginBottom: 10 },
  input: { backgroundColor: C.card2, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 16, fontSize: 15, color: C.text },
  segWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 14 },
  segPill: { backgroundColor: C.card2, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  segPillOn: { backgroundColor: C.lime },
  segText: { fontSize: 13, color: C.muted, fontWeight: '600' },
  segTextOn: { color: C.onLime },
  card: { backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  rowName: { flex: 1, fontSize: 16, color: C.text, fontWeight: '500' },
  addTag: { backgroundColor: C.lime, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  addTagText: { color: C.onLime, fontWeight: '800', fontSize: 13 },
  autoBtn: { backgroundColor: C.lime, borderRadius: 18, paddingVertical: 17, alignItems: 'center', marginTop: 22 },
  autoBtnText: { color: C.onLime, fontWeight: '800', fontSize: 17 },
  matchCard: { backgroundColor: C.blue, borderRadius: 22, padding: 16, marginBottom: 10 },
  matchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  courtName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  teamLine: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  vs: { fontSize: 12, color: '#dbe0ff', textAlign: 'center', marginVertical: 2 },
  winRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  winBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  winBtnText: { fontWeight: '800', fontSize: 14 },
  miniBtn: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  miniText: { color: '#241a00', fontWeight: '700', fontSize: 12 },
  empty: { color: C.muted, padding: 20, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});