import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import BackdropBottomSheet from './BackdropBottomSheet';
import { Colors } from '../constants/colors';
import { Attendee } from '../types';

interface Props {
  onStart: (attendees: Attendee[]) => void;
  onDismiss: () => void;
  sheetRef: React.RefObject<BottomSheet | null>;
}

export default function AttendeesBottomSheet({ onStart, onDismiss, sheetRef }: Props) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<TextInput>(null);
  const snapPoints = useMemo(() => ['55%'], []);

  const addAttendee = useCallback(() => {
    const name = inputValue.trim();
    if (!name) return;
    setAttendees((prev) => [...prev, { id: Date.now().toString(), name }]);
    setInputValue('');
    inputRef.current?.focus();
  }, [inputValue]);

  const removeAttendee = useCallback((id: string) => {
    setAttendees((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleStart = useCallback(() => {
    Keyboard.dismiss();
    sheetRef.current?.close();
    onStart(attendees);
  }, [attendees, onStart, sheetRef]);

  const handleSkip = useCallback(() => {
    Keyboard.dismiss();
    sheetRef.current?.close();
    onStart([]);
  }, [onStart, sheetRef]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BackdropBottomSheet {...props} />,
    []
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={styles.content}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.inner}
        >
          <Text style={styles.title}>Who's in this meeting?</Text>
          <Text style={styles.subtitle}>Optional — helps AI identify speakers</Text>

          {/* Attendee chips */}
          {attendees.length > 0 && (
            <View style={styles.chips}>
              {attendees.map((a) => (
                <Pressable key={a.id} style={styles.chip} onPress={() => removeAttendee(a.id)}>
                  <Text style={styles.chipText}>{a.name}</Text>
                  <Text style={styles.chipRemove}>×</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Input row */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Add name…"
              placeholderTextColor={Colors.textMuted}
              value={inputValue}
              onChangeText={setInputValue}
              onSubmitEditing={addAttendee}
              returnKeyType="done"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.addBtn, !inputValue.trim() && styles.addBtnDisabled]}
              onPress={addAttendee}
              disabled={!inputValue.trim()}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.startBtn} onPress={handleStart}>
              <Text style={styles.startBtnText}>Start Recording</Text>
            </Pressable>
            <Pressable onPress={handleSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: { backgroundColor: Colors.surface },
  handle: { backgroundColor: Colors.border, width: 40 },
  content: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: -8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 6,
  },
  chipText: { fontSize: 13, color: Colors.textPrimary },
  chipRemove: { fontSize: 16, color: Colors.textMuted, lineHeight: 18 },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 46,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  addBtn: {
    backgroundColor: Colors.indigo,
    borderRadius: 12,
    paddingHorizontal: 18,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actions: {
    gap: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  startBtn: {
    width: '100%',
    height: 52,
    backgroundColor: Colors.indigo,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipText: { color: Colors.textMuted, fontSize: 14 },
});
