import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { useCommitmentStore, Commitment } from '../stores/useCommitmentStore';
import { AiAdvisor } from '../services/ai/AiAdvisor';
import { MemoryIndex } from '../services/ai/MemoryIndex';
import { summarizeSourceText } from '../services/commitments/commitmentComposer';

export const CommitmentsDashboard = () => {
  const { commitments, toggleCommitment, removeCommitment, addCommitment } = useCommitmentStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleAddCommitment = async () => {
    const title = newTitle.trim();
    const deadline = newDeadline.trim();

    if (!title) {
      setFormError('Add a task title first.');
      return;
    }

    setIsAdding(true);
    setFormError(null);
    try {
      addCommitment(title, deadline || undefined, { source: 'manual' });
      setNewTitle('');
      setNewDeadline('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const embedding = await AiAdvisor.getEmbedding(searchQuery);
      if (embedding) {
        const results = await MemoryIndex.search(embedding);
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
        <View style={styles.metaRow}>
          <Text style={styles.sourceBadge}>
            {item.source === 'manual' ? 'Manual' : 'Captured from chat'}
          </Text>
          {item.sourceText ? (
            <Text style={styles.sourceText} numberOfLines={2}>
              {summarizeSourceText(item.sourceText)}
            </Text>
          ) : null}
        </View>
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
      {/* Manual Capture Section */}
      <View style={styles.section}>
        <Text style={styles.header}>Capture Commitment</Text>
        <Text style={styles.helperText}>
          Add action items yourself so they do not depend on AI detection.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="What needs to get done?"
          value={newTitle}
          onChangeText={(text) => {
            setNewTitle(text);
            setFormError(null);
          }}
          returnKeyType="next"
        />

        <TextInput
          style={styles.input}
          placeholder="Due date or note (optional)"
          value={newDeadline}
          onChangeText={setNewDeadline}
          returnKeyType="done"
          onSubmitEditing={handleAddCommitment}
        />

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddCommitment}
          disabled={isAdding}
        >
          {isAdding ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.addButtonText}>Add to list</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Search Section */}
      <View style={styles.section}>
        <Text style={styles.header}>Semantic Search</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
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
  helperText: {
    color: '#666',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
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
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  errorText: {
    color: '#b42318',
    fontSize: 12,
    marginBottom: 8,
  },
  addButton: {
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
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
  metaRow: {
    marginTop: 8,
  },
  sourceBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4b5563',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sourceText: {
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 15,
    marginTop: 2,
  },
  resultsList: {
    maxHeight: 200,
  },
});
