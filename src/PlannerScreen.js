import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet} from 'react-native';
import {createTask, planDay} from './planner.js';
import {plannerRepository} from './store.js';

export default function PlannerScreen({sessions, onStart, active, disabled}) {
  const [state, setState] = useState(null);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState('25');
  const [budget, setBudget] = useState(120);
  const [priority, setPriority] = useState(2);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    plannerRepository.reconcile(sessions).then(value => { if (mounted) setState(value); })
      .catch(failure => { if (mounted) setError(failure.message); });
    return () => { mounted = false; };
  }, [sessions]);
  const plan = useMemo(() => state ? planDay(state.tasks, {availableMinutes: budget}) : null, [state, budget]);
  async function save(operation) {
    setBusy(true); setError('');
    try { setState(await operation()); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function add() {
    await save(async () => {
      const task = createTask({id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`, title, minutes: Number(minutes), priority});
      const next = await plannerRepository.add(task);
      setTitle(''); return next;
    });
  }
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.heading}>Make room for what matters.</Text>
    <Text style={styles.muted}>Choose your priorities and the time you have. Breaks count toward your budget.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <TextInput accessibilityLabel="Task title" value={title} onChangeText={setTitle} maxLength={200}
      placeholder="What do you want to finish?" placeholderTextColor="#9b9a8e" style={styles.input}/>
    <TextInput accessibilityLabel="Estimated task minutes" value={minutes} onChangeText={setMinutes}
      keyboardType="number-pad" style={styles.input}/>
    <View style={styles.row}>{[1, 2, 3].map(value => <TouchableOpacity key={value} accessibilityRole="button"
      accessibilityState={{selected: priority === value}} onPress={() => setPriority(value)} style={styles.button}>
      <Text style={priority === value ? styles.accent : styles.text}>{['Low', 'Medium', 'High'][value - 1]}</Text>
    </TouchableOpacity>)}</View>
    <TouchableOpacity disabled={busy || !state || !title.trim()} onPress={add} style={styles.button}>
      <Text style={styles.accent}>Add task</Text>
    </TouchableOpacity>
    <Text style={styles.label}>AVAILABLE TIME</Text>
    <View style={styles.row}>{[60, 120, 180].map(value => <TouchableOpacity key={value} style={styles.button}
      accessibilityState={{selected: budget === value}} onPress={() => setBudget(value)}>
      <Text style={budget === value ? styles.accent : styles.text}>{value} min</Text>
    </TouchableOpacity>)}</View>
    {!state ? <Text style={styles.muted}>Loading your plan…</Text> : <>
      <Text style={styles.label}>{plan.focusMinutes} MIN FOCUS · {plan.totalMinutes} MIN WITH BREAKS</Text>
      {plan.blocks.map((block, index) => <View key={`${block.taskId ?? 'break'}-${index}`} style={styles.card}>
        <Text style={styles.text}>{block.kind === 'break' ? 'Take a break' : block.title} · {block.minutes} min</Text>
        {block.kind === 'focus' && <TouchableOpacity disabled={active || busy || disabled} style={styles.button}
          onPress={() => onStart(block)}><Text style={styles.accent}>{active ? 'Finish your active session first' : 'Start this block'}</Text></TouchableOpacity>}
      </View>)}
      {plan.unscheduled.length > 0 && <Text style={styles.muted}>{plan.unscheduled.reduce((sum, task) => sum + task.minutes, 0)} task minutes remain outside this plan.</Text>}
      {!state.tasks.length && <Text style={styles.muted}>Add a task to create your first focus plan.</Text>}
      {state.tasks.map(task => <View key={task.id} style={styles.card}>
        <Text style={styles.text}>{task.title}</Text>
        <Text style={styles.muted}>{task.completedMinutes} / {task.minutes} focused minutes</Text>
        <TouchableOpacity disabled={busy} onPress={() => save(() => plannerRepository.remove(task.id))}>
          <Text style={styles.error}>Remove task</Text>
        </TouchableOpacity>
      </View>)}
    </>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: {padding: 22, paddingBottom: 60}, heading: {color:'#f2f0e8', fontSize:32, fontWeight:'800', marginVertical:16},
  text: {color:'#f2f0e8', fontSize:16}, muted: {color:'#9b9a8e', lineHeight:22}, accent: {color:'#d7ff64', fontWeight:'700'},
  error: {color:'#ff806f', marginVertical:10}, input: {color:'#f2f0e8', borderColor:'#2b2b25', borderWidth:1, borderRadius:12, padding:16, marginTop:14},
  row: {flexDirection:'row', gap:8}, button: {padding:14, borderRadius:12, backgroundColor:'#171714', marginVertical:8},
  label: {color:'#9b9a8e', fontWeight:'700', marginTop:24, marginBottom:12}, card: {padding:16, borderRadius:14, backgroundColor:'#171714', marginBottom:12}
});
