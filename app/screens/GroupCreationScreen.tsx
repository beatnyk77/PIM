import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Switch, Clipboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GroupSessionManager } from '../services/messaging/GroupSessionManager';
import { MessageRelay } from '../services/messaging/MessageRelay';
import { useStore } from '../services/storage/StateManager';
import GroupQrCode from '../components/GroupQrCode';
import CryptoJS from 'crypto-js';

export default function GroupCreationScreen() {
  const navigation = useNavigation<any>();
  const { setActiveGroup } = useStore();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIdInput, setMemberIdInput] = useState('');
  const [members, setMembers] = useState<string[]>([]); // Storing User IDs
  const [isCreating, setIsCreating] = useState(false);
  const [isEphemeralLink, setIsEphemeralLink] = useState(true); // Default to one-time / ephemeral
  const [copyFeedback, setCopyFeedback] = useState(false);

  const [groupId] = useState(() => `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);
  const [inviteToken] = useState(() => {
    return CryptoJS.lib.WordArray.random(16).toString(CryptoJS.enc.Hex);
  });

  const handleCopyLink = () => {
    const link = generateInviteLink();
    Clipboard.setString(link);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

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
      // 1. Fetch real identity keys from server/IdentityService for group members
      const initialMembers = [];
      for (const userId of members) {
        const bundle = await MessageRelay.fetchPreKeyBundle(userId);
        if (!bundle || !bundle.identityKey) {
          throw new Error(`Failed to fetch prekey bundle for member: ${userId}`);
        }
        initialMembers.push({
          userId,
          deviceId: bundle.deviceId || 1,
          identityKey: bundle.identityKey,
          role: 'member' as const
        });
      }

      // 2. Create Group Session in MLS Manager
      await GroupSessionManager.createGroupSession(groupId, initialMembers);

      // 3. Register the invite token for this group
      await GroupSessionManager.registerInviteToken(groupId, inviteToken, isEphemeralLink);

      // 4. Join Group in Relay
      MessageRelay.joinGroup(groupId);

      // 5. Set active group and navigate
      setActiveGroup(groupId);
      navigation.replace('Chat'); // replace so back button doesn't go to creation
    } catch (e: any) {
      console.error('Failed to create group', e);
      const { Alert } = require('react-native');
      Alert.alert("Failed to Create Group", e.message || "An unexpected cryptographic error occurred.");
    } finally {
      setIsCreating(false);
    }
  };

  const generateInviteLink = () => {
    const base = `pim://group/join/${groupId}`;
    const params = `token=${inviteToken}&burn=${isEphemeralLink}`;
    return `${base}?${params}`;
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

        <View className="bg-purple-50 p-4 rounded-xl border border-purple-100 mb-6 shadow-sm">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-purple-800 font-semibold text-sm">Secure Invite Link</Text>
            <TouchableOpacity 
              onPress={() => setIsEphemeralLink(!isEphemeralLink)}
              className={`px-3 py-1 rounded-full border ${isEphemeralLink ? 'bg-orange-100 border-orange-300' : 'bg-purple-100 border-purple-300'}`}
            >
              <Text className={`text-[10px] font-extrabold uppercase ${isEphemeralLink ? 'text-orange-700' : 'text-purple-700'}`}>
                {isEphemeralLink ? '⏳ One-Time' : '♾️ Permanent'}
              </Text>
            </TouchableOpacity>
          </View>
          <Text className="text-purple-600 text-xs mb-3">You can scan or copy this E2EE invite link now, or manage it after group creation.</Text>
          
          <View className="items-center bg-white p-3 rounded-lg border border-purple-100 shadow-inner">
            <GroupQrCode value={generateInviteLink()} size={120} />
            <Text className="text-gray-500 font-mono text-[9px] mt-2 select-all w-full text-center bg-gray-50 p-1.5 rounded border border-gray-150" numberOfLines={1}>
              {generateInviteLink()}
            </Text>
            <TouchableOpacity 
              onPress={handleCopyLink} 
              className={`mt-2.5 w-full py-2 rounded-lg items-center ${copyFeedback ? 'bg-green-600' : 'bg-purple-600'} active:opacity-90 shadow-sm`}
            >
              <Text className="text-white font-bold text-xs">
                {copyFeedback ? 'Copied! ✓ 📋' : 'Copy Invite Link'}
              </Text>
            </TouchableOpacity>
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
