import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { useCommitmentStore, Commitment } from '../stores/useCommitmentStore';
import { AiAdvisor } from '../services/ai/AiAdvisor';
import { MemoryIndex } from '../services/ai/MemoryIndex';

export const CommitmentsDashboard = () => {
  const { commitments, toggleCommitment, removeCommitment } = useCommitmentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const embedding = await AiAdvisor.getEmbedding(searchQuery);
      if (embedding) {
        const results = MemoryIndex.search(embedding);
        setSearchResults(results);
      }
    } catch (e) {
      console.error('Search failed', e);
    } finally {
      setIsSearching(false);
    }
  };

  const renderCommitment = ({ item }: { item: Commitment }) => (
    <View style={styles.card}>
      <TouchableOpacity 
        style={styles.content} 
        onPress={() => toggleCommitment(item.id)}
      >
        <Text style={[styles.title, item.status === 'completed' && styles.completedText]}>
          {item.title}
        </Text>
        {item.deadline && (
          <Text style={styles.deadline}>Due: {item.deadline}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity 
        style={styles.deleteButton} 
        onPress={() => removeCommitment(item.id)}
      >
        <Text style={styles.deleteText}>X</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSearchResult = ({ item }: { item: any }) => (
    <View style={styles.resultCard}>
      <Text style={styles.resultText}>{item.text}</Text>
      <Text style={styles.resultMeta}>
        Score: {item.score ? item.score.toFixed(2) : 'N/A'} • {new Date(item.timestamp).toLocaleTimeString()}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Search Section */}
      <View style={styles.section}>
        <Text style={styles.header}>Semantic Search</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.input}
            placeholder="Search your memories..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearch} disabled={isSearching}>
            {isSearching ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Go</Text>
            )}
          </TouchableOpacity>
        </View>
        
        {searchResults.length > 0 && (
          <View style={styles.resultsList}>
            <Text style={styles.subHeader}>Results:</Text>
            <FlatList
              data={searchResults}
              renderItem={renderSearchResult}
              keyExtractor={(item) => item.id}
              scrollEnabled={false} 
            />
          </View>
        )}
      </View>

      {/* Commitments Section */}
      <View style={styles.section}>
        <Text style={styles.header}>My Commitments</Text>
        {commitments.length === 0 ? (
          <Text style={styles.emptyText}>No active commitments found.</Text>
        ) : (
          <FlatList
            data={commitments}
            renderItem={renderCommitment}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  section: {
    marginBottom: 24,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  subHeader: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
    color: '#555',
  },
  list: {
    paddingBottom: 20,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  completedText: {
    textDecorationLine: 'line-through',
    color: '#888',
  },
  deadline: {
    fontSize: 12,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  deleteText: {
    color: '#ff4444',
    fontWeight: 'bold',
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 20,
  },
  // Search Styles
  searchRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  input: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  searchButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  resultCard: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 14,
    color: '#333',
  },
  resultMeta: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
    textAlign: 'right',
  },
  resultsList: {
    maxHeight: 200,
  },
});
