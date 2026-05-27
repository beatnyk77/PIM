import { View, Text, Button, FlatList, TouchableOpacity, SafeAreaView, Alert, Modal, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../services/storage/StateManager';
import { useEffect, useState } from 'react';
import { IdentityService } from '../services/auth/IdentityService';
import { MessageRelay } from '../services/messaging/MessageRelay';
import { EventBus } from '../services/EventBus';
import { SafetyCheckWizard } from '../components/SafetyCheckWizard';
import { GroupSessionManager } from '../services/messaging/GroupSessionManager';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { messages, setActiveChat, setActiveGroup, hydrate } = useStore();
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteLinkInput, setInviteLinkInput] = useState('');

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

  const handleJoinSubmit = async () => {
    if (!inviteLinkInput.trim()) return;
    setShowJoinModal(false);

    try {
      const link = inviteLinkInput.trim();
      if (!link.startsWith('pim://group/join/')) {
        Alert.alert("Invalid Link", "Please enter a valid PIM group invite link.");
        return;
      }

      const urlParts = link.replace('pim://group/join/', '').split('?');
      const groupId = urlParts[0];
      const paramsStr = urlParts[1] || '';
      
      let token = '';
      let burn = false;

      paramsStr.split('&').forEach(param => {
        const [k, v] = param.split('=');
        if (k === 'token') token = v;
        if (k === 'burn') burn = v === 'true';
      });

      if (token) {
        const result = await GroupSessionManager.validateAndBurnInviteToken(token);
        if (result.status === 'burned') {
          Alert.alert("Access Denied 🛡️", "This secure one-time invite link has already been burned and cannot be used!");
          return;
        } else if (result.status === 'invalid') {
          Alert.alert("Invalid Invite", "This invite token is invalid or expired.");
          return;
        }
      }

      const keys = await IdentityService.loadKeys();
      const myId = keys ? keys.registrationId.toString() : 'me';
      const myNode = {
        userId: myId,
        deviceId: keys ? keys.deviceId : 1,
        identityKey: keys ? keys.identityKey.toString() : 'mock-key',
        role: 'member' as const
      };

      await GroupSessionManager.createGroupSession(groupId, [myNode]);
      MessageRelay.joinGroup(groupId);

      setActiveGroup(groupId);
      setInviteLinkInput('');
      navigation.navigate('Chat');
      
      Alert.alert("Success 🎉", `Successfully joined E2EE group: ${groupId}`);
    } catch (e) {
      console.error('Failed to join group', e);
      Alert.alert("Error", "Failed to process group join invite.");
    }
  };

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
          className="bg-indigo-600 px-4 py-3 rounded-full items-center justify-center shadow-lg flex-row"
          onPress={() => setShowJoinModal(true)}
        >
            <Text className="text-white font-bold mr-1">📥</Text>
            <Text className="text-white font-bold text-sm">Join Group</Text>
        </TouchableOpacity>

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

      {/* Join Group Modal */}
      <Modal
        visible={showJoinModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowJoinModal(false);
          setInviteLinkInput('');
        }}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white p-6 rounded-t-3xl shadow-xl">
            <Text className="text-xl font-bold text-gray-900 mb-2">📥 Join Secure Group</Text>
            <Text className="text-gray-500 text-xs mb-4 leading-relaxed">
              Paste a secure scannable deep-link token below. For burn-on-use links, our E2EE local database will verify and immediately void the invite to prevent link hijack replays.
            </Text>

            <TextInput
              className="bg-gray-100 p-3.5 rounded-xl mb-4 font-mono text-xs border border-gray-200"
              placeholder="pim://group/join/group_123?token=..."
              value={inviteLinkInput}
              onChangeText={setInviteLinkInput}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              numberOfLines={3}
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setShowJoinModal(false);
                  setInviteLinkInput('');
                }}
                className="flex-1 bg-gray-100 py-3.5 rounded-full items-center"
              >
                <Text className="text-gray-700 font-bold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleJoinSubmit}
                className="flex-1 bg-indigo-600 py-3.5 rounded-full items-center active:bg-indigo-700 shadow-md"
              >
                <Text className="text-white font-bold">Join Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SafetyCheckWizard />
    </SafeAreaView>
  );
}
