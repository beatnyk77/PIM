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
  const [invitePasswordInput, setInvitePasswordInput] = useState('');

  const [conversations, setConversations] = useState<any[]>([]);

  useEffect(() => {
    const buildConversations = async () => {
      const conversationMap = new Map<string, any>();

      // 1. Fetch all MLS groups from the Signal store
      const activeGroups = await GroupSessionManager.getAllGroups();
      for (const group of activeGroups) {
        conversationMap.set(group.groupId, {
          id: group.groupId,
          name: `👥 Group: ${group.groupId}`,
          type: 'group',
          lastMessage: 'No messages yet',
          timestamp: 0
        });
      }

      // 2. Iterate through messages to populate last message and derive direct chats
      for (const m of messages) {
        const msgTime = new Date(m.timestamp).getTime();
        if (m.groupId) {
          // Group message
          const existing = conversationMap.get(m.groupId);
          if (!existing || msgTime > existing.timestamp) {
            conversationMap.set(m.groupId, {
              id: m.groupId,
              name: `👥 Group: ${m.groupId}`,
              type: 'group',
              lastMessage: m.content,
              timestamp: msgTime
            });
          }
        } else {
          // 1:1 message
          const contactId = m.isMe ? 'user2' : m.senderId; // Fallback to 'user2' if sent by me
          if (contactId === 'system') continue;
          
          const existing = conversationMap.get(contactId);
          if (!existing || msgTime > existing.timestamp) {
            conversationMap.set(contactId, {
              id: contactId,
              name: `👤 Chat with ${contactId}`,
              type: 'direct',
              lastMessage: m.content,
              timestamp: msgTime
            });
          }
        }
      }

      // 3. Ensure default user2 is always present if no direct chat was derived
      if (!conversationMap.has('user2')) {
        conversationMap.set('user2', {
          id: 'user2',
          name: '👤 Chat with user2',
          type: 'direct',
          lastMessage: 'No messages yet',
          timestamp: 0
        });
      }

      // Convert map to array and sort by timestamp descending (newest messages first)
      const list = Array.from(conversationMap.values());
      list.sort((a, b) => b.timestamp - a.timestamp);
      setConversations(list);
    };
    buildConversations();
  }, [messages]);

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
        // Enforce decryption check / validation matching password input
        const result = await GroupSessionManager.validateAndBurnInviteToken(token, invitePasswordInput.trim());
        if (result.status === 'burned') {
          Alert.alert("Access Denied 🛡️", "This secure one-time invite link has already been burned and cannot be used!");
          return;
        } else if (result.status === 'expired') {
          Alert.alert("Invite Expired ⏳", "This secure invite link has expired (10-minute validity limit reached)!");
          return;
        } else if (result.status === 'incorrect_password') {
          Alert.alert("Incorrect Password 🔒", "The password/PIN you entered is incorrect. Access denied.");
          return;
        } else if (result.status === 'invalid') {
          Alert.alert("Invalid Invite", "This invite token is invalid or expired.");
          return;
        }
      }

      // Hide modal once validation succeeds
      setShowJoinModal(false);

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
      setInvitePasswordInput('');
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
                <Text className="text-gray-400 text-xs">
                  {item.timestamp > 0 ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
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
          setInvitePasswordInput('');
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

            {inviteLinkInput.includes('pw=true') && (
              <TextInput
                className="bg-gray-100 p-3.5 rounded-xl mb-4 font-mono text-xs border border-gray-200"
                placeholder="🔑 Enter Invite Password/PIN"
                value={invitePasswordInput}
                onChangeText={setInvitePasswordInput}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => {
                  setShowJoinModal(false);
                  setInviteLinkInput('');
                  setInvitePasswordInput('');
                }}
                className="flex-1 bg-gray-100 py-3.5 rounded-full items-center"
              >
                <Text className="text-gray-700 font-bold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleJoinSubmit}
                className="flex-1 bg-indigo-600 py-3.5 rounded-full items-center active:bg-indigo-700 shadow-md"
              >
                <Text className="text-white font-bold font-semibold">Join Group</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <SafetyCheckWizard />
    </SafeAreaView>
  );
}
