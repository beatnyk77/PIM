import { View, Text, Button, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../services/storage/StateManager';
import { useEffect, useState } from 'react';
import { IdentityService } from '../services/auth/IdentityService';
import { MessageRelay } from '../services/messaging/MessageRelay';
import { EventBus } from '../services/EventBus';
import { SafetyCheckWizard } from '../components/SafetyCheckWizard';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { messages, setActiveChat, setActiveGroup, hydrate } = useStore();
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');

  // Derive conversations from messages (simple logic for MVP)
  // Group messages by senderId or groupId to form conversation list
  // For now, we keep the static list but ideally we map `messages` to this.
  const conversations = [
      { id: 'test-chat-id', name: 'Alice (Test)', type: 'direct', lastMessage: 'Secure message...' },
      { id: 'group-123', name: 'Project Alpha', type: 'group', lastMessage: 'Meeting at 5' },
      // Add dynamic extraction later
  ];

  useEffect(() => {
    // Hydrate store from DB
    hydrate();

    // Setup Relay
    const setupRelay = async () => {
       const keys = await IdentityService.loadKeys();
       if (keys) {
         MessageRelay.connect(keys.registrationId.toString());
       }
    };
    setupRelay();

    const onConnected = () => setConnectionStatus('Connected');
    const onDisconnected = () => setConnectionStatus('Disconnected');

    EventBus.on('network.connected', onConnected);
    EventBus.on('network.disconnected', onDisconnected);

    return () => {
      EventBus.off('network.connected', onConnected);
      EventBus.off('network.disconnected', onDisconnected);
    }
  }, []);

  const openChat = (id: string, type: string) => {
      if (type === 'group') {
          setActiveGroup(id);
      } else {
          setActiveChat(id);
      }
      navigation.navigate('Chat');
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="px-4 py-4 flex-row justify-between items-center bg-white border-b border-gray-200">
        <View>
            <Text className="text-2xl font-bold text-gray-900">Chats</Text>
            <Text className="text-xs text-gray-500">{connectionStatus}</Text>
        </View>
        <View className="flex-row gap-2">
            <TouchableOpacity onPress={() => navigation.navigate('Commitments')} className="bg-orange-100 p-2 rounded-full">
                <Text>📊</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')} className="bg-blue-100 p-2 rounded-full">
                <Text>👤</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} className="bg-gray-100 p-2 rounded-full">
                <Text>⚙️</Text>
            </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
            <TouchableOpacity 
                onPress={() => openChat(item.id, item.type)}
                className="bg-white p-4 border-b border-gray-100 flex-row items-center"
            >
                <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${item.type === 'group' ? 'bg-purple-100' : 'bg-green-100'}`}>
                    <Text className="text-lg">{item.type === 'group' ? '👥' : '👤'}</Text>
                </View>
                <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">{item.name}</Text>
                    <Text className="text-gray-500 text-sm" numberOfLines={1}>{item.lastMessage}</Text>
                </View>
                <Text className="text-gray-400 text-xs">Now</Text>
            </TouchableOpacity>
        )}
        ListEmptyComponent={
            <View className="p-8 items-center">
                <Text className="text-gray-400">No conversations yet.</Text>
            </View>
        }
      />
      
      <View className="absolute bottom-6 right-6 flex-col items-end gap-3">
        <TouchableOpacity 
          className="bg-purple-600 px-4 py-3 rounded-full items-center justify-center shadow-lg flex-row"
          onPress={() => navigation.navigate('GroupCreation')}
        >
            <Text className="text-white font-bold mr-1">👥</Text>
            <Text className="text-white font-bold text-sm">New Group</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          className="bg-blue-600 px-4 py-3 rounded-full items-center justify-center shadow-lg flex-row"
          onPress={() => openChat('new-user', 'direct')}
        >
            <Text className="text-white font-bold mr-1">👤</Text>
            <Text className="text-white font-bold text-sm">New Chat</Text>
        </TouchableOpacity>
      </View>

      <SafetyCheckWizard />
    </SafeAreaView>
  );
}
