import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GroupSessionManager } from '../services/messaging/GroupSessionManager';
import { MessageRelay } from '../services/messaging/MessageRelay';
import { useStore } from '../services/storage/StateManager';

export default function GroupCreationScreen() {
  const navigation = useNavigation<any>();
  const { setActiveGroup } = useStore();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIdInput, setMemberIdInput] = useState('');
  const [members, setMembers] = useState<string[]>([]); // Storing User IDs
  const [isCreating, setIsCreating] = useState(false);

  const addMember = () => {
    if (memberIdInput.trim() && !members.includes(memberIdInput.trim())) {
      setMembers([...members, memberIdInput.trim()]);
      setMemberIdInput('');
    }
  };

  const removeMember = (id: string) => {
    setMembers(members.filter(m => m !== id));
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setIsCreating(true);

    try {
      // 1. Generate unique Group ID
      const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // 2. Prepare initial roster (mocking deviceId as 1 for added members)
      const initialMembers = members.map(userId => ({
        userId,
        deviceId: 1, // Defaulting to 1 for mock
        identityKey: 'mock-identity-key-for-' + userId
      }));

      // 3. Create Group Session in MLS Manager
      await GroupSessionManager.createGroupSession(groupId, initialMembers);

      // 4. Join Group in Relay
      MessageRelay.joinGroup(groupId);

      // 5. Set active group and navigate
      setActiveGroup(groupId);
      navigation.replace('Chat'); // replace so back button doesn't go to creation
    } catch (e) {
      console.error('Failed to create group', e);
    } finally {
      setIsCreating(false);
    }
  };

  const generateInviteLink = () => {
    // Just a UI mock for generating a deep link string
    return `pim://group/join/mock_${Date.now()}`;
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 border-b border-gray-200">
        <Text className="text-xl font-bold text-gray-900">Create New Group</Text>
      </View>
      <ScrollView className="flex-1 p-4">
        <Text className="text-gray-700 font-semibold mb-1">Group Name</Text>
        <TextInput
          className="bg-gray-100 p-3 rounded-lg mb-4"
          placeholder="E.g. Project Alpha"
          value={groupName}
          onChangeText={setGroupName}
        />

        <Text className="text-gray-700 font-semibold mb-1">Description (Optional)</Text>
        <TextInput
          className="bg-gray-100 p-3 rounded-lg mb-4"
          placeholder="What is this group about?"
          value={description}
          onChangeText={setDescription}
          multiline
        />

        <Text className="text-gray-700 font-semibold mb-1">Add Members (by User ID)</Text>
        <View className="flex-row items-center mb-4">
          <TextInput
            className="flex-1 bg-gray-100 p-3 rounded-l-lg"
            placeholder="User ID (e.g. user2)"
            value={memberIdInput}
            onChangeText={setMemberIdInput}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={addMember} className="bg-blue-500 p-3 rounded-r-lg">
            <Text className="text-white font-bold px-2">Add</Text>
          </TouchableOpacity>
        </View>

        {members.length > 0 && (
          <View className="mb-4">
            <Text className="text-gray-700 font-semibold mb-2">Initial Roster:</Text>
            {members.map(userId => (
              <View key={userId} className="flex-row justify-between items-center bg-gray-50 p-2 rounded mb-2 border border-gray-200">
                <Text className="text-gray-800">{userId}</Text>
                <TouchableOpacity onPress={() => removeMember(userId)}>
                  <Text className="text-red-500 font-semibold">Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6">
          <Text className="text-blue-800 font-semibold mb-1">Invite Link</Text>
          <Text className="text-blue-600 text-sm mb-2">You can also share an invite link after creation.</Text>
          <View className="bg-white p-2 rounded border border-blue-200">
             <Text className="text-gray-500 font-mono text-xs">{generateInviteLink()}</Text>
          </View>
        </View>

        <TouchableOpacity 
          onPress={handleCreateGroup} 
          disabled={!groupName.trim() || isCreating}
          className={`p-4 rounded-full items-center shadow-sm ${!groupName.trim() || isCreating ? 'bg-blue-300' : 'bg-blue-600'}`}
        >
          <Text className="text-white font-bold text-lg">{isCreating ? 'Creating...' : 'Create Secure Group'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
