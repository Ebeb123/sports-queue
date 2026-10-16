import { useCallback, useMemo, useState } from 'react';
import { Text, StyleSheet, View, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { getActiveMatches, getWaitingPlayers, getAppConfig, getLastGroupmates, getOpenCourts, type ActiveMatch, type WaitingPlayer } from '../db/db';import { previewNextUp, minutesSince } from '../logic/matchmaking';
import { useColors, type Palette } from '../theme';

function fmt(mins: number): string {
  const s = Math.max(0, Math.floor(mins * 60));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export default function LiveScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [now, setNow] = useState(() => new Date());
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [pool, setPool] = useState<WaitingPlayer[]>([]);
  const [cfg, setCfg] = useState(() => getAppConfig());

  const load = useCallback(() => { setMatches(getActiveMatches()); setPool(getWaitingPlayers()); setCfg(getAppConfig()); }, []);
  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(() => { setNow(new Date()); load(); }, 1000);
    return () => clearInterval(id);
  }, [load]));

  const nextUp = previewNextUp(pool, now, cfg.matchConfig, getLastGroupmates(), getOpenCourts().length);
    const nextIds = new Set(nextUp.map((p) => p.player_id));
  const names = (t: { name: string }[]) => t.map((m) => m.name).join(' & ');

  const Pill = ({ text }: { text: string }) => (
    <View style={{ backgroundColor: C.card2, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}><Text style={{ color: C.muted, fontSize: 11, fontWeight: '700' }}>{text}</Text></View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={styles.h1}>Live</Text>

      <Text style={styles.label}>Now playing</Text>
      {matches.length === 0 ? (
        <Text style={styles.empty}>No matches in progress.</Text>
      ) : (
        matches.map((m) => {
          const el = minutesSince(m.started_at, now);
          const over = el >= cfg.matchLimitMin;
          return (
            <View key={m.match_id} style={styles.matchCard}>
              <View style={styles.matchHead}><Text style={styles.courtName}>{m.court_name}</Text><Text style={[styles.timer, { color: over ? '#ffd0d0' : '#fff' }]}>{fmt(el)}{over ? '  OVER' : ''}</Text></View>
              <Text style={styles.team}>{names(m.team1)}</Text>
              <Text style={styles.vs}>vs</Text>
              <Text style={styles.team}>{names(m.team2)}</Text>
            </View>
          );
        })
      )}

      <Text style={styles.label}>Next up</Text>
      {nextUp.length === 0 ? (
        <Text style={styles.empty}>Waiting for enough players.</Text>
      ) : (
        <View style={styles.nextCard}>
          {nextUp.map((p) => (
            <View key={p.player_id} style={styles.nextRow}><Text style={styles.nextName}>{p.name}</Text><Pill text={p.level} /></View>
          ))}
        </View>
      )}

      <View style={styles.headRow}><Text style={styles.h2}>Waiting</Text><Text style={styles.count}>{pool.length}</Text></View>
      <View style={styles.card}>
        {pool.length === 0 ? (
          <Text style={styles.empty}>Queue is empty.</Text>
        ) : (
          pool.map((p) => (
            <View key={p.player_id} style={[styles.row, nextIds.has(p.player_id) && { backgroundColor: C.card2, borderRadius: 16 }]}>
              <Text style={styles.rowName}>{p.name}</Text>
              <Pill text={p.level} />
              <Text style={styles.waitTime}>{Math.floor(minutesSince(p.waiting_since, now))}m</Text>
            </View>
          ))
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
  label: { fontSize: 14, color: C.muted, fontWeight: '600', marginTop: 20, marginBottom: 10 },
  empty: { color: C.muted, padding: 20, textAlign: 'center' },
  matchCard: { backgroundColor: C.blue, borderRadius: 22, padding: 16, marginBottom: 10 },
  matchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  courtName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  timer: { fontSize: 16, fontWeight: '800' },
  team: { fontSize: 18, fontWeight: '700', color: '#fff', textAlign: 'center' },
  vs: { fontSize: 12, color: '#dbe0ff', textAlign: 'center', marginVertical: 2 },
  nextCard: { backgroundColor: C.lime, borderRadius: 22, padding: 8 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, paddingHorizontal: 12 },
  nextName: { fontSize: 16, fontWeight: '700', color: C.onLime },
  card: { backgroundColor: C.card, borderRadius: 24, paddingHorizontal: 6, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  rowName: { flex: 1, fontSize: 16, color: C.text, fontWeight: '500' },
  waitTime: { fontSize: 14, color: C.muted, fontWeight: '600' },
});