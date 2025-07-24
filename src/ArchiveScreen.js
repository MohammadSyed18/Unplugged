import React, {useMemo, useState} from 'react';
import {ScrollView, View, Text, TextInput, TouchableOpacity, Switch, Share, StyleSheet} from 'react-native';
import {sessionRepository} from './store.js';
import {exportHistory, previewImport} from './archiveTools.js';
import {sessionsToCsv} from './insights.js';

export default function ArchiveScreen({sessions, active, onImported}) {
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [redact, setRedact] = useState(false);
  const [days, setDays] = useState(null);
  const selected = useMemo(() => {
    const from = days === null ? -Infinity : Date.now() - days * 86_400_000;
    return exportHistory(sessions, {from, redact});
  }, [sessions, days, redact]);
  async function share(format) {
    setError(''); setBusy(true);
    try {
      const archive = JSON.parse(selected.raw);
      await Share.share({title: 'Unplugged focus history', message: format === 'csv' ? sessionsToCsv(archive.sessions) : selected.raw});
    } catch (failure) { setError(failure.message || 'Could not open sharing.'); }
    finally { setBusy(false); }
  }
  async function inspect() {
    setError(''); setBusy(true); setPreview(null);
    try { setPreview(previewImport(await sessionRepository.load(), raw)); }
    catch (failure) { setError(failure.message || 'Could not inspect this archive.'); }
    finally { setBusy(false); }
  }
  async function importArchive() {
    if (!preview || busy) return;
    setError(''); setBusy(true);
    try {
      const state = await sessionRepository.importArchive(raw);
      onImported(state); setRaw(''); setPreview(null);
    } catch (failure) { setError(failure.message || 'Could not save this archive.'); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.heading}>Your history, in your hands.</Text>
    <Text style={styles.muted}>Export a backup or bring completed sessions from another device. Active sessions stay on their original device.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Text style={styles.label}>EXPORT HISTORY</Text>
    <View style={styles.row}>{[[null,'All'],[7,'7 days'],[30,'30 days']].map(([value,label]) =>
      <TouchableOpacity key={label} style={styles.button} onPress={() => setDays(value)} accessibilityState={{selected: days === value}}>
        <Text style={days === value ? styles.accent : styles.text}>{label}</Text>
      </TouchableOpacity>)}</View>
    <View style={styles.row}><Switch value={redact} onValueChange={setRedact} accessibilityLabel="Hide intention and distraction text in export"/>
      <Text style={styles.muted}>Hide intentions and distraction reasons</Text></View>
    <Text style={styles.muted}>{selected.summary.incomingSessions} sessions · {selected.summary.focusedMinutes} focused minutes</Text>
    <TouchableOpacity disabled={busy} style={styles.button} onPress={() => share('json')}><Text style={styles.accent}>Share JSON backup</Text></TouchableOpacity>
    <TouchableOpacity disabled={busy} style={styles.button} onPress={() => share('csv')}><Text style={styles.accent}>Share spreadsheet CSV</Text></TouchableOpacity>
    <Text style={styles.muted}>A redacted export is for sharing. Keep an unredacted backup for restoring existing session IDs.</Text>
    <Text style={styles.label}>IMPORT A BACKUP</Text>
    <TextInput accessibilityLabel="JSON archive to import" multiline value={raw} onChangeText={value => {setRaw(value); setPreview(null);}}
      placeholder="Paste an Unplugged JSON archive" placeholderTextColor="#9b9a8e" style={styles.input} maxLength={5_000_001}/>
    <TouchableOpacity disabled={busy || !raw.trim() || Boolean(active)} style={styles.button} onPress={inspect}>
      <Text style={styles.accent}>{active ? 'Finish your session before importing' : 'Preview import'}</Text>
    </TouchableOpacity>
    {preview && <View style={styles.card}>
      <Text style={styles.text}>{preview.added} new · {preview.duplicates} already saved</Text>
      <Text style={styles.muted}>{preview.retainedSessions} sessions after import. {preview.dropped > 0 ? `${preview.dropped} oldest sessions fall outside the 1,000-session history limit.` : 'No sessions removed by the history limit.'}</Text>
      <TouchableOpacity disabled={busy} style={styles.button} onPress={importArchive}><Text style={styles.accent}>Import these sessions</Text></TouchableOpacity>
    </View>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  page:{padding:22,paddingBottom:60},heading:{color:'#f2f0e8',fontSize:30,fontWeight:'800',marginVertical:16},
  muted:{color:'#9b9a8e',lineHeight:22,flexShrink:1},text:{color:'#f2f0e8'},accent:{color:'#d7ff64',fontWeight:'700'},
  label:{color:'#9b9a8e',fontWeight:'700',marginTop:28,marginBottom:12},row:{flexDirection:'row',gap:10,alignItems:'center',marginVertical:10},
  button:{padding:14,borderRadius:12,backgroundColor:'#171714',marginVertical:8},card:{padding:16,borderColor:'#2b2b25',borderWidth:1,borderRadius:12},
  error:{color:'#ff806f',marginVertical:10},input:{minHeight:160,color:'#f2f0e8',padding:16,borderRadius:12,borderWidth:1,borderColor:'#2b2b25',textAlignVertical:'top'}
});
