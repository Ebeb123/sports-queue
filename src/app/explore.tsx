import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, ScrollView, Modal } from 'react-native';
import { Alert } from '../lib/alert';
import { useFocusEffect } from 'expo-router';

import {
  getPlayersNotQueued, getQueue, getWaitingPlayers, getOpenCourts, getActiveMatches,
  getAppConfig, getLastGroupmates, getSessionHeadToHead, enqueueCustomGroup, enqueuePlayer,
  getWaitingGroups, setCustomGroup, disbandCustomGroup, swapMatchPlayer,
  pausePlayer, resumePlayer, leaveQueue, createMatch, endMatch,
  type Level, type Player, type QueueRow, type ActiveMatch, type Rival, type WaitingGroup, type Court,
} from '../db/db';
import { planAutoQueue, balanceTeams, minutesSince } from '../logic/matchmaking';
import { useColors, type Palette } from '../theme';

type FilterLevel = Level | 'All';
const FILTERS: FilterLevel[] = ['All', 'Beginner', 'Intermediate', 'Advance', 'Pro'];

export default function QueueScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [available, setAvailable] = useState<Player[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [groups, setGroups] = useState<WaitingGroup[]>([]);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<FilterLevel>('All');

  const [customOpen, setCustomOpen] = useState(false);
  const [customSel, setCustomSel] = useState<number[]>([]);
  const [customSearch, setCustomSearch] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [customMode, setCustomMode] = useState<'queue' | 'play'>('queue');
  const [customCourtId, setCustomCourtId] = useState<number | null>(null);

  const [swapMatch, setSwapMatch] = useState<ActiveMatch | null>(null);
  const [swapOutId, setSwapOutId] = useState<number | null>(null);
  const [swapSearch, setSwapSearch] = useState('');

  const refresh = useCallback(() => {
    setAvailable(getPlayersNotQueued());
    setQueue(getQueue());
    setMatches(getActiveMatches());
    setGroups(getWaitingGroups());
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const openCourts = useMemo<Court[]>(() => getOpenCourts(), [matches, customOpen]);

  const filteredAvailable = useMemo(() => {
    const q = search.trim().toLowerCase();
    return available.filter((p) => (q === '' || p.name.toLowerCase().includes(q)) && (levelFilter === 'All' || p.level === levelFilter));
  }, [available, search, levelFilter]);
  const sortedQueue = useMemo(() => [...queue].sort((a, b) => (a.status === 'playing' ? 1 : 0) - (b.status === 'playing' ? 1 : 0)), [queue]);
  const waitingList = useMemo(() => queue.filter((q) => q.status === 'waiting'), [queue]);

  const filteredWaitingForCustom = useMemo(() => {
    const q = customSearch.trim().toLowerCase();
    return q === '' ? waitingList : waitingList.filter((p) => p.name.toLowerCase().includes(q));
  }, [waitingList, customSearch]);

  const need = getAppConfig().matchConfig.playersPerMatch;
  const rivals: Rival[] = useMemo(() => (customSel.length ? getSessionHeadToHead(customSel[0]) : []), [customSel]);
  const anchorName = customSel.length ? queue.find((q) => q.player_id === customSel[0])?.name ?? 'Player A' : '';

  const swapCandidates = useMemo(() => {
    if (!swapMatch) return [] as { player_id: number; name: string; level: Level }[];
    const inMatch = new Set([...swapMatch.team1, ...swapMatch.team2].map((p) => p.player_id));
    const all = [
      ...available.map((p) => ({ player_id: p.player_id, name: p.name, level: p.level })),
      ...waitingList.map((p) => ({ player_id: p.player_id, name: p.name, level: p.level })),
    ];
    return all.filter((p) => !inMatch.has(p.player_id));
  }, [swapMatch, available, waitingList]);

  const filteredSwapCandidates = useMemo(() => {
    const q = swapSearch.trim().toLowerCase();
    return q === '' ? swapCandidates : swapCandidates.filter((p) => p.name.toLowerCase().includes(q));
  }, [swapCandidates, swapSearch]);

  function add(id: number) { enqueuePlayer(id); refresh(); }
  function togglePause(r: QueueRow) { r.status === 'paused' ? resumePlayer(r.entry_id) : pausePlayer(r.entry_id); refresh(); }
  function remove(id: number) { leaveQueue(id); refresh(); }

  function handleAutoQueue() {
    const { matchConfig } = getAppConfig();
    const pool = getWaitingPlayers(); const oc = getOpenCourts(); const recent = getLastGroupmates();
    if (!oc.length) { Alert.alert('Auto Queue', 'No open courts available.'); return; }
    const plans = planAutoQueue(pool, oc.length, new Date(), matchConfig, recent);
    if (!plans.length) { Alert.alert('Auto Queue', `Not enough players. Need at least ${matchConfig.playersPerMatch} waiting.`); return; }
    plans.forEach((plan, i) => { const court = oc[i]; createMatch(court.court_id, matchConfig.matchType, plan.team1.map((p) => p.player_id), plan.team2.map((p) => p.player_id)); });
    refresh(); Alert.alert('Auto Queue', `Assigned ${plans.length} match(es).`);
  }

  function finish(m: ActiveMatch, t: 1 | 2) { endMatch(m.match_id, t); refresh(); }

  function openCustom() { setEditingGroupId(null); setCustomSel([]); setCustomSearch(''); setCustomMode('queue'); setCustomCourtId(null); setCustomOpen(true); }
  function openEditGroup(g: WaitingGroup) { setEditingGroupId(g.group_id); setCustomSel(g.members.map((m) => m.player_id)); setCustomSearch(''); setCustomMode('queue'); setCustomCourtId(null); setCustomOpen(true); }
  function disband(g: WaitingGroup) {
    Alert.alert('Disband group', 'Members stay in the queue as individuals.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disband', style: 'destructive', onPress: () => { disbandCustomGroup(g.group_id); refresh(); } },
    ]);
  }
  function toggleCustom(id: number) {
    setCustomSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= need ? prev : [...prev, id]));
  }
  function confirmCustom() {
    if (customSel.length !== need) { Alert.alert('Custom Match', `Select exactly ${need} players.`); return; }

    if (editingGroupId != null) {
      setCustomGroup(editingGroupId, customSel);
      setCustomOpen(false); setEditingGroupId(null); setCustomSel([]); refresh();
      Alert.alert('Group Updated', 'The custom group was changed and keeps its place in line.');
      return;
    }

    if (customMode === 'play') {
      if (customCourtId == null) { Alert.alert('Custom Match', 'Choose a court to play on.'); return; }
      const { matchConfig } = getAppConfig();
      const pool = getWaitingPlayers();
      const chosen = pool.filter((p) => customSel.includes(p.player_id));
      if (chosen.length !== need) { Alert.alert('Custom Match', 'Selected players must all be waiting.'); return; }
      const { team1, team2 } = balanceTeams(chosen);
      createMatch(customCourtId, matchConfig.matchType, team1.map((p) => p.player_id), team2.map((p) => p.player_id));
      setCustomOpen(false); setCustomSel([]); setCustomCourtId(null); refresh();
      Alert.alert('Custom Match', 'The custom match is now on court.');
    } else {
      const { averageWaitMin } = enqueueCustomGroup(customSel);
      setCustomOpen(false); setCustomSel([]); refresh();
      Alert.alert('Custom Match Queued', `Group inserted with an averaged wait of ${averageWaitMin.toFixed(2)} minutes.`);
    }
  }

  function doSwap(inId: number) {
    if (!swapMatch || swapOutId == null) return;
    const res = swapMatchPlayer(swapMatch.match_id, swapOutId, inId);
    if (!res.ok) { Alert.alert('Cannot swap', res.reason ?? ''); return; }
    setSwapMatch(null); setSwapOutId(null); setSwapSearch(''); refresh();
  }

  const Pill = ({ text, kind }: { text: string; kind: 'neutral' | 'playing' | 'wait' }) => {
    const m = { neutral: [C.card2, C.muted], playing: [C.lime, C.onLime], wait: [C.amber, '#241a00'] }[kind];
    return <View style={{ backgroundColor: m[0], borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}><Text style={{ color: m[1], fontSize: 11, fontWeight: '700' }}>{text}</Text></View>;
  };
  const rivalLabel = (r: Rival) => (r.wins > r.losses ? `${anchorName} leads ${r.wins}-${r.losses}` : r.losses > r.wins ? `${r.name} leads ${r.losses}-${r.wins}` : `Tied ${r.wins}-${r.losses}`);

  const now = new Date();
  const waitingCount = waitingList.length;
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
      <Pressable onPress={openCustom} style={({ pressed }) => [styles.customBtn, pressed && styles.pressed]}>
        <Text style={styles.customBtnText}>Custom Match</Text>
      </Pressable>

      {groups.length > 0 && (
        <>
          <View style={styles.headRow}><Text style={styles.h2}>Custom Groups</Text><Text style={styles.count}>{groups.length}</Text></View>
          {groups.map((g) => (
            <View key={g.group_id} style={styles.groupCard}>
              <Text style={styles.groupMembers}>{g.members.map((m) => m.name).join(', ')}</Text>
              <View style={styles.groupBtns}>
                <Pressable onPress={() => openEditGroup(g)} style={({ pressed }) => [styles.miniBtn, { backgroundColor: C.blue }, pressed && styles.pressed]}><Text style={[styles.miniText, { color: '#fff' }]}>Edit</Text></Pressable>
                <Pressable onPress={() => disband(g)} style={({ pressed }) => [styles.miniBtn, { backgroundColor: C.red }, pressed && styles.pressed]}><Text style={[styles.miniText, { color: '#fff' }]}>Disband</Text></Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <View style={styles.headRow}><Text style={styles.h2}>On Courts</Text><Text style={styles.count}>{matches.length}</Text></View>
      {matches.length === 0 ? (
        <Text style={styles.empty}>No matches in progress.</Text>
      ) : (
        matches.map((m) => (
          <View key={m.match_id} style={styles.matchCard}>
            <View style={styles.matchHead}>
              <Text style={styles.courtName}>{m.court_name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable onPress={() => { setSwapMatch(m); setSwapOutId(null); setSwapSearch(''); }} style={({ pressed }) => [styles.editChip, pressed && styles.pressed]}><Text style={styles.editChipText}>Edit</Text></Pressable>
                <Pill text="Playing" kind="playing" />
              </View>
            </View>
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

      {/* ---------- Custom Match / Edit Group modal ---------- */}
      <Modal visible={customOpen} transparent animationType="fade" onRequestClose={() => setCustomOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editingGroupId != null ? 'Edit Group' : 'Custom Match'}  ({customSel.length}/{need})</Text>
            <Text style={styles.modalHint}>Pick players. Selecting the first shows today&apos;s rivals.</Text>

            {rivals.length > 0 && (
              <View style={styles.rivalBox}>
                <Text style={styles.rivalHead}>Rivals for {anchorName} today</Text>
                {rivals.map((r) => {
                  const picked = customSel.includes(r.opponent_id);
                  return (
                    <Pressable key={r.opponent_id} onPress={() => toggleCustom(r.opponent_id)} style={({ pressed }) => [styles.rivalRow, picked && { backgroundColor: C.card2, borderRadius: 12 }, pressed && styles.pressed]}>
                      <Text style={styles.rivalName}>{r.name}</Text>
                      <Text style={styles.rivalRec}>{rivalLabel(r)}</Text>
                      <View style={[styles.pickDot, picked && { backgroundColor: C.lime, borderColor: C.lime }]} />
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.rivalHead}>Waiting players (longest wait first)</Text>
            <TextInput style={styles.modalSearchInput} placeholder="Search by name" placeholderTextColor={C.muted} value={customSearch} onChangeText={setCustomSearch} autoCorrect={false} clearButtonMode="while-editing" />
            <ScrollView style={{ maxHeight: 240 }}>
              {filteredWaitingForCustom.length === 0 ? (
                <Text style={styles.empty}>{waitingList.length === 0 ? 'No waiting players.' : 'No players match your search.'}</Text>
              ) : (
                filteredWaitingForCustom.map((p) => {
                  const picked = customSel.includes(p.player_id);
                  const wait = Math.floor(minutesSince(p.waiting_since, now));
                  return (
                    <Pressable key={p.player_id} onPress={() => toggleCustom(p.player_id)} style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}>
                      <View style={[styles.pickDot, picked && { backgroundColor: C.lime, borderColor: C.lime }]} />
                      <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                      <Pill text={p.level} kind="neutral" />
                      <Pill text={`${wait}m`} kind="wait" />
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            {editingGroupId == null && (
              <>
                <View style={styles.modeRow}>
                  <Pressable onPress={() => setCustomMode('queue')} style={({ pressed }) => [styles.modePill, customMode === 'queue' && styles.modePillOn, pressed && styles.pressed]}>
                    <Text style={[styles.modeText, customMode === 'queue' && styles.modeTextOn]}>Add to Queue</Text>
                  </Pressable>
                  <Pressable onPress={() => setCustomMode('play')} style={({ pressed }) => [styles.modePill, customMode === 'play' && styles.modePillOn, pressed && styles.pressed]}>
                    <Text style={[styles.modeText, customMode === 'play' && styles.modeTextOn]}>Play Now</Text>
                  </Pressable>
                </View>

                {customMode === 'play' && (
                  <>
                    <Text style={styles.rivalHead}>Choose a court</Text>
                    {openCourts.length === 0 ? (
                      <Text style={styles.empty}>No open courts. Free one first or use Add to Queue.</Text>
                    ) : (
                      <View style={styles.courtChips}>
                        {openCourts.map((c) => (
                          <Pressable key={c.court_id} onPress={() => setCustomCourtId(c.court_id)} style={({ pressed }) => [styles.courtChip, customCourtId === c.court_id && styles.courtChipOn, pressed && styles.pressed]}>
                            <Text style={[styles.courtChipText, customCourtId === c.court_id && styles.courtChipTextOn]}>{c.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            <View style={styles.modalBtns}>
              <Pressable onPress={() => { setCustomOpen(false); setEditingGroupId(null); }} style={({ pressed }) => [styles.mBtn, { backgroundColor: C.card2 }, pressed && styles.pressed]}><Text style={[styles.mBtnText, { color: C.text }]}>Cancel</Text></Pressable>
              <Pressable onPress={confirmCustom} style={({ pressed }) => [styles.mBtn, { backgroundColor: customSel.length === need ? C.lime : C.card2 }, pressed && styles.pressed]}>
                <Text style={[styles.mBtnText, { color: customSel.length === need ? C.onLime : C.muted }]}>
                  {editingGroupId != null ? 'Save Group' : customMode === 'play' ? 'Play Now' : 'Add to Queue'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Live match swap modal ---------- */}
      <Modal visible={swapMatch !== null} transparent animationType="fade" onRequestClose={() => setSwapMatch(null)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Match{swapMatch ? `  ${swapMatch.court_name}` : ''}</Text>
            <Text style={styles.modalHint}>{swapOutId == null ? 'Tap the player to replace.' : 'Now tap the player to bring in.'}</Text>

            {swapMatch && (
              <View style={styles.rivalBox}>
                {[...swapMatch.team1.map((p) => ({ ...p, team: 1 })), ...swapMatch.team2.map((p) => ({ ...p, team: 2 }))].map((p) => (
                  <Pressable key={p.player_id} onPress={() => setSwapOutId(p.player_id)} style={({ pressed }) => [styles.rivalRow, swapOutId === p.player_id && { backgroundColor: C.red, borderRadius: 12 }, pressed && styles.pressed]}>
                    <Text style={[styles.rivalName, swapOutId === p.player_id && { color: '#fff' }]}>{p.name}</Text>
                    <Text style={[styles.rivalRec, swapOutId === p.player_id && { color: '#fff' }]}>Team {p.team}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {swapOutId != null && (
              <>
                <Text style={styles.rivalHead}>Bring in</Text>
                <TextInput
                  style={styles.modalSearchInput}
                  placeholder="Search by name"
                  placeholderTextColor={C.muted}
                  value={swapSearch}
                  onChangeText={setSwapSearch}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                <ScrollView style={{ maxHeight: 240 }}>
                  {filteredSwapCandidates.length === 0 ? (
                    <Text style={styles.empty}>{swapCandidates.length === 0 ? 'No bench players available.' : 'No players match your search.'}</Text>
                  ) : (
                    filteredSwapCandidates.map((p) => (
                      <Pressable key={p.player_id} onPress={() => doSwap(p.player_id)} style={({ pressed }) => [styles.pickRow, pressed && styles.pressed]}>
                        <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                        <Pill text={p.level} kind="neutral" />
                        <View style={styles.addTag}><Text style={styles.addTagText}>Swap in</Text></View>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </>
            )}

            <View style={styles.modalBtns}>
              <Pressable onPress={() => { setSwapMatch(null); setSwapOutId(null); setSwapSearch(''); }} style={({ pressed }) => [styles.mBtn, { backgroundColor: C.card2 }, pressed && styles.pressed]}><Text style={[styles.mBtnText, { color: C.text }]}>Done</Text></Pressable>
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
  customBtn: { backgroundColor: C.blue, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  customBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  groupCard: { backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupMembers: { flex: 1, fontSize: 15, color: C.text, fontWeight: '600' },
  groupBtns: { flexDirection: 'row', gap: 8 },
  matchCard: { backgroundColor: C.blue, borderRadius: 22, padding: 16, marginBottom: 10 },
  matchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  courtName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  editChip: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  editChipText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  teamLine: { fontSize: 17, fontWeight: '700', color: '#fff', textAlign: 'center' },
  vs: { fontSize: 12, color: '#dbe0ff', textAlign: 'center', marginVertical: 2 },
  winRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  winBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  winBtnText: { fontWeight: '800', fontSize: 14 },
  miniBtn: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  miniText: { color: '#241a00', fontWeight: '700', fontSize: 12 },
  empty: { color: C.muted, padding: 20, textAlign: 'center' },
  pressed: { opacity: 0.7 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modal: { backgroundColor: C.card, borderRadius: 24, padding: 18 },
  modalTitle: { fontSize: 19, fontWeight: '800', color: C.text },
  modalHint: { fontSize: 12, color: C.muted, marginTop: 4, marginBottom: 12 },
  modalSearchInput: { backgroundColor: C.card2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, fontSize: 14, color: C.text, marginBottom: 8 },
  rivalBox: { backgroundColor: C.card2, borderRadius: 16, padding: 10, marginBottom: 12 },
  rivalHead: { fontSize: 13, fontWeight: '700', color: C.muted, marginBottom: 6, marginTop: 4 },
  rivalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 8 },
  rivalName: { fontSize: 15, color: C.text, fontWeight: '600', flex: 1 },
  rivalRec: { fontSize: 12, color: C.lime, fontWeight: '700' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  pickDot: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: C.muted },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modePill: { flex: 1, backgroundColor: C.card2, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  modePillOn: { backgroundColor: C.lime },
  modeText: { fontSize: 13, color: C.muted, fontWeight: '700' },
  modeTextOn: { color: C.onLime },
  courtChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  courtChip: { backgroundColor: C.card2, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  courtChipOn: { backgroundColor: C.blue },
  courtChipText: { fontSize: 13, color: C.muted, fontWeight: '700' },
  courtChipTextOn: { color: '#fff' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
  mBtn: { flex: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  mBtnText: { fontWeight: '800', fontSize: 15 },
});