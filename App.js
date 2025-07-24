import React, {useEffect, useMemo, useState} from "react";
import {AppState, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View} from "react-native";
import {summarize, recommendDuration} from "./src/analytics.js";
import {createSession, remainingSeconds, SessionStatus} from "./src/focusEngine.js";
import {sessionRepository} from "./src/store.js";
import {durationInsights, comparePeriods} from "./src/insights.js";
import {goalProgress, buildRoutine} from "./src/goals.js";

const palette = {bg:"#0c0c0b", panel:"#171714", line:"#2b2b25", text:"#f2f0e8", muted:"#9b9a8e", lime:"#d7ff64", red:"#ff806f"};

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [intention, setIntention] = useState("");
  const [duration, setDuration] = useState(25);
  const [tab, setTab] = useState("focus");
  const [now, setNow] = useState(Date.now());

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function applyState(state) {
    setSessions(state.sessions);
    setActive(state.active);
    setNow(Date.now());
  }
  useEffect(() => {
    let mounted = true;
    sessionRepository.recover().then(state => {
      if (mounted) { applyState(state); setReady(true); }
    }).catch(() => { if (mounted) setError('Saved sessions could not be loaded. Restart to retry.'); });
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') sessionRepository.recover().then(value => { if (mounted) applyState(value); }).catch(() => setError('Could not restore the timer.'));
    });
    return () => { mounted = false; listener.remove(); };
  }, []);
  async function change(operation) {
    setBusy(true); setError('');
    try { applyState(await operation()); }
    catch (failure) { setError(failure.message || 'Could not save this change. Please retry.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (active?.status !== SessionStatus.RUNNING) return undefined;
    const timer = setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (remainingSeconds(active, timestamp) === 0) {
        sessionRepository.recover(timestamp).then(applyState).catch(() => setError('Could not save the completed session.'));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  const stats = useMemo(() => summarize(sessions, now), [sessions, now]);
  const recommendation = useMemo(() => recommendDuration(sessions), [sessions]);

  function begin() {
    change(() => sessionRepository.start(createSession({id:`session-${Date.now()}`, intention, durationMinutes:duration})));
  }
  const goals = useMemo(() => goalProgress(sessions, {now}), [sessions, now]);
  const routine = useMemo(() => buildRoutine({focusMinutes: duration}), [duration]);

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" />
    <View style={styles.header}><Text style={styles.brand}>unplugged.</Text><Text style={styles.streak}>{stats.completed} done this week</Text></View>
    <View style={styles.tabs}>
      {[["focus","Focus"],["insights","Insights"]].map(([value,label]) => <TouchableOpacity key={value} onPress={()=>setTab(value)} style={[styles.tab,tab===value&&styles.tabActive]}><Text style={[styles.tabText,tab===value&&styles.tabTextActive]}>{label}</Text></TouchableOpacity>)}
    </View>
    {error ? <Text accessibilityRole="alert" style={{color:palette.red,padding:16}}>{error}</Text> : null}
    {!ready ? <Text style={{color:palette.muted,padding:22}}>Restoring your sessions…</Text> : tab === "focus" ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {active ? <SessionCard session={active} now={now} onEvent={event=>{if(!busy) change(()=>sessionRepository.dispatch(event));}} /> : <>
        <Text style={styles.kicker}>START WITH INTENTION</Text>
        <Text style={styles.hero}>What deserves your full attention?</Text>
        <TextInput value={intention} onChangeText={setIntention} placeholder="Finish physics problem set" placeholderTextColor="#66665e" style={styles.input} />
        <Text style={styles.label}>FOCUS LENGTH</Text>
        <View style={styles.durations}>{[15,25,40,55].map(value=><TouchableOpacity key={value} onPress={()=>setDuration(value)} style={[styles.duration,duration===value&&styles.durationActive]}><Text style={[styles.durationText,duration===value&&styles.durationTextActive]}>{value}</Text><Text style={styles.minute}>min</Text></TouchableOpacity>)}</View>
        <TouchableOpacity disabled={!intention.trim() || busy} onPress={begin} style={[styles.primary,!intention.trim()&&styles.disabled]}><Text style={styles.primaryText}>Begin focus session</Text></TouchableOpacity>
        <Text style={{color:palette.muted,marginTop:18}}>Four-block routine: {routine.focusMinutes} focused minutes, {routine.totalMinutes} minutes including breaks.</Text>
        <View style={styles.recommendation}><Text style={styles.recNumber}>{recommendation.minutes} min</Text><View style={{flex:1}}><Text style={styles.recTitle}>Suggested next session</Text><Text style={styles.recBody}>{recommendation.reason}</Text></View></View>
      </>}
    </ScrollView> : <Insights stats={stats} goals={goals} sessions={sessions} />}
  </SafeAreaView>;
}

function SessionCard({session, now, onEvent}) {
  const remaining = remainingSeconds(session, now);
  const progress = 1 - remaining / session.targetSeconds;
  return <View>
    <Text style={styles.kicker}>NOW FOCUSING ON</Text><Text style={styles.sessionTitle}>{session.intention}</Text>
    <View style={styles.timerWrap}><Text style={styles.timer}>{formatTime(remaining)}</Text><View style={styles.track}><View style={[styles.fill,{width:`${progress*100}%`}]} /></View></View>
    <View style={styles.row}>
      <TouchableOpacity style={styles.secondary} onPress={()=>onEvent({type:session.status===SessionStatus.RUNNING?"pause":"resume"})}><Text style={styles.secondaryText}>{session.status===SessionStatus.RUNNING?"Pause":"Resume"}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={()=>onEvent({type:"interrupt",reason:"distraction"})}><Text style={styles.secondaryText}>Log distraction</Text></TouchableOpacity>
    </View>
    <TouchableOpacity style={styles.end} onPress={()=>onEvent({type:"abandon"})}><Text style={styles.endText}>End session early</Text></TouchableOpacity>
    <Text style={styles.interruptions}>{session.interruptions.length} interruptions logged</Text>
  </View>;
}

function Insights({stats, goals, sessions}) {
  const max = Math.max(1,...stats.daily.map(day=>day.minutes));
  const durations = durationInsights(sessions);
  const comparison = comparePeriods(sessions);
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>LAST SEVEN DAYS</Text><Text style={styles.hero}>Patterns, not pressure.</Text>
    <View style={styles.insightCard}>
      <Text style={styles.recTitle}>Your focus goals</Text>
      <Text style={styles.insightLarge}>{goals.todayMinutes} / {goals.dailyMinutes} min today</Text>
      <Text style={styles.recBody}>{goals.weekMinutes} / {goals.weeklyMinutes} min over seven days · {goals.currentStreak} day streak · Best: {goals.longestStreak}</Text>
    </View>
    <View style={styles.statGrid}><Stat value={stats.focusedMinutes} label="focused min"/><Stat value={`${Math.round(stats.completionRate*100)}%`} label="completion"/><Stat value={stats.interruptions} label="interruptions"/></View>
    <View style={styles.chart}>{stats.daily.map(day=><View key={day.date} style={styles.barColumn}><Text style={styles.barValue}>{day.minutes}</Text><View style={[styles.bar,{height:Math.max(4,110*day.minutes/max)}]} /><Text style={styles.day}>{day.date.slice(5)}</Text></View>)}</View>
    <View style={styles.insightCard}><Text style={styles.recTitle}>Most common interruption</Text><Text style={styles.insightLarge}>{stats.topInterruption?.reason ?? "Not enough data yet"}</Text><Text style={styles.recBody}>{stats.topInterruption ? `${stats.topInterruption.count} times this week. Notice the pattern before trying to eliminate it.` : "Log distractions during a session and a pattern will appear here."}</Text></View>
    <View style={styles.insightCard}>
      <Text style={styles.recTitle}>Compared with the previous seven days</Text>
      <Text style={styles.recBody}>{comparison.minuteChange >= 0 ? '+' : ''}{comparison.minuteChange} focused minutes. These are local history summaries, not targets you must beat.</Text>
      <Text style={[styles.recTitle,{marginTop:20}]}>Focus lengths</Text>
      {durations.map(group => <Text key={group.minutes} style={styles.recBody}>{group.minutes} min: {group.completed}/{group.attempts} completed{group.enoughHistory ? '' : ' · still gathering history'}</Text>)}
      <Text style={[styles.recTitle,{marginTop:20}]}>Recent sessions</Text>
      {sessions.slice(-10).reverse().map(session => <View key={session.id} style={{paddingVertical:10}}>
        <Text style={{color:palette.text}}>{session.intention}</Text>
        <Text style={styles.recBody}>{new Date(session.createdAt).toLocaleDateString()} · {session.status} · {Math.floor(session.elapsedBeforeRun / 60)} min</Text>
      </View>)}
      {!sessions.length && <Text style={styles.recBody}>Your completed and ended sessions will appear here.</Text>}
    </View>
  </ScrollView>;
}

function Stat({value,label}) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
function formatTime(seconds){return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:palette.bg},header:{paddingHorizontal:22,paddingTop:14,paddingBottom:12,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},brand:{color:palette.text,fontSize:22,fontWeight:"900",letterSpacing:-1},streak:{color:palette.muted,fontSize:12},tabs:{flexDirection:"row",marginHorizontal:22,borderBottomWidth:1,borderBottomColor:palette.line},tab:{paddingVertical:12,marginRight:24},tabActive:{borderBottomWidth:2,borderBottomColor:palette.lime},tabText:{color:palette.muted,fontWeight:"700"},tabTextActive:{color:palette.text},content:{padding:22,paddingBottom:60},kicker:{color:palette.lime,fontSize:11,fontWeight:"900",letterSpacing:1.5,marginTop:20,marginBottom:12},hero:{color:palette.text,fontSize:44,lineHeight:46,fontWeight:"900",letterSpacing:-2.2,maxWidth:330},input:{backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:16,padding:18,color:palette.text,fontSize:17,marginTop:28},label:{color:palette.muted,fontSize:11,fontWeight:"800",letterSpacing:1.3,marginTop:26,marginBottom:10},durations:{flexDirection:"row",gap:8},duration:{flex:1,backgroundColor:palette.panel,borderWidth:1,borderColor:palette.line,borderRadius:14,paddingVertical:14,alignItems:"center"},durationActive:{backgroundColor:palette.lime,borderColor:palette.lime},durationText:{color:palette.text,fontSize:21,fontWeight:"900"},durationTextActive:{color:palette.bg},minute:{color:palette.muted,fontSize:10},primary:{backgroundColor:palette.lime,borderRadius:15,padding:18,alignItems:"center",marginTop:22},primaryText:{color:palette.bg,fontWeight:"900",fontSize:16},disabled:{opacity:.35},recommendation:{flexDirection:"row",gap:16,backgroundColor:palette.panel,borderRadius:16,padding:18,marginTop:24,borderWidth:1,borderColor:palette.line},recNumber:{color:palette.lime,fontWeight:"900",fontSize:20},recTitle:{color:palette.text,fontWeight:"800",marginBottom:5},recBody:{color:palette.muted,lineHeight:19,fontSize:13},sessionTitle:{color:palette.text,fontWeight:"900",fontSize:38,lineHeight:41,letterSpacing:-1.6},timerWrap:{marginVertical:60},timer:{color:palette.text,fontSize:78,fontWeight:"200",textAlign:"center",fontVariant:["tabular-nums"]},track:{height:5,backgroundColor:palette.line,borderRadius:4,overflow:"hidden",marginTop:24},fill:{height:"100%",backgroundColor:palette.lime},row:{flexDirection:"row",gap:10},secondary:{flex:1,borderRadius:14,borderWidth:1,borderColor:palette.line,padding:16,alignItems:"center"},secondaryText:{color:palette.text,fontWeight:"800"},end:{padding:16,alignItems:"center",marginTop:10},endText:{color:palette.red,fontWeight:"700"},interruptions:{color:palette.muted,textAlign:"center",marginTop:20},statGrid:{flexDirection:"row",gap:8,marginTop:28},stat:{flex:1,backgroundColor:palette.panel,borderRadius:14,padding:14,borderWidth:1,borderColor:palette.line},statValue:{color:palette.text,fontSize:24,fontWeight:"900"},statLabel:{color:palette.muted,fontSize:11,marginTop:3},chart:{height:170,flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",marginTop:34,borderBottomWidth:1,borderBottomColor:palette.line,paddingHorizontal:4},barColumn:{alignItems:"center",width:38},bar:{width:22,backgroundColor:palette.lime,borderTopLeftRadius:5,borderTopRightRadius:5},barValue:{color:palette.muted,fontSize:9,marginBottom:5},day:{color:palette.muted,fontSize:9,marginTop:7,marginBottom:-20},insightCard:{backgroundColor:palette.panel,borderRadius:16,padding:20,marginTop:50,borderWidth:1,borderColor:palette.line},insightLarge:{color:palette.lime,fontSize:26,fontWeight:"900",marginVertical:10}
});

