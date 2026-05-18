import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Cpu } from 'lucide-react-native';
import { Fonts } from './Typography';

interface OfflineIndicatorProps {
  text?: string;
}

export default function OfflineIndicator({ text = 'Gemma 4 · on device' }: OfflineIndicatorProps) {
  return (
    <View style={styles.container}>
      <Cpu size={14} color="#3B82F6" style={styles.icon} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 4,
  },
  icon: {
    marginRight: 6,
  },
  text: {
    color: '#3B82F6',
    fontSize: 12,
    fontFamily: Fonts.semiBold,
    letterSpacing: 0.3,
  },
});
