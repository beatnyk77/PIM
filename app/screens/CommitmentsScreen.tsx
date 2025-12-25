import React from 'react';
import { View, StyleSheet } from 'react-native';
import { CommitmentsDashboard } from '../components/CommitmentsDashboard';

export default function CommitmentsScreen() {
  return (
    <View style={styles.container}>
      <CommitmentsDashboard />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
