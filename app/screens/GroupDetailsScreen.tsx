import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GroupSessionManager, GroupMember } from '../services/messaging/GroupSessionManager';
import { useStore } from '../services/storage/StateManager';
import { IdentityService } from '../services/auth/IdentityService';

export default function GroupDetailsScreen() {
  const navigation = useNavigation();
  const { activeGroup } = useStore();
  const [roster, setRoster] = useState<GroupMember[]>([]);
  const [epoch, setEpoch] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    loadGroupData();
  }, [activeGroup]);

  const loadGroupData = async () => {
    if (!activeGroup) return;
    setIsLoading(true);
    try {
      const keys = await IdentityService.loadKeys();
      if (keys) setMyId(keys.registrationId.toString());

      const context = await GroupSessionManager.getGroupContext(activeGroup);
      if (context) {
        setEpoch(context.epoch);
      }

      const currentRoster = await GroupSessionManager.getGroupRoster(activeGroup);
      setRoster(currentRoster);
    } catch (e) {
      console.error('Failed to load group details', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!activeGroup) return;
    Alert.alert(
      "Revoke Member",
      `Are you sure you want to revoke ${userId}? This will trigger a key rotation.`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Revoke", 
          style: "destructive",
          onPress: async () => {
            try {
               await GroupSessionManager.revokeGroupMember(activeGroup, userId);
               // Refresh UI
               await loadGroupData();
            } catch (e) {
               console.error('Revocation failed', e);
               Alert.alert("Error", "Failed to revoke member.");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="p-4 bg-white border-b border-gray-200 flex-row justify-between items-center">
        <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text className="text-blue-500 font-semibold text-lg">Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Group Info</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <ScrollView className="flex-1 p-4">
          <View className="bg-white p-4 rounded-xl border border-gray-200 mb-6 shadow-sm">
            <Text className="text-sm text-gray-500 font-semibold mb-1 uppercase tracking-wider">Group ID</Text>
            <Text className="text-gray-900 font-mono mb-4">{activeGroup}</Text>

            <Text className="text-sm text-gray-500 font-semibold mb-1 uppercase tracking-wider">Security Epoch</Text>
            <View className="flex-row items-center">
                <Text className="text-lg font-bold text-green-600 mr-2">{epoch}</Text>
                <Text className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Rotates on Revocation</Text>
            </View>
          </View>

          <Text className="text-lg font-bold text-gray-900 mb-2">Members ({roster.length})</Text>
          
          {roster.map((member, index) => {
             const isMe = member.userId === myId;
             const isRevoked = member.status === 'revoked';

             return (
               <View key={index} className={`bg-white p-4 rounded-xl border mb-3 flex-row justify-between items-center ${isRevoked ? 'border-red-200 bg-red-50' : 'border-gray-200 shadow-sm'}`}>
                 <View>
                    <View className="flex-row items-center mb-1">
                        <Text className={`font-semibold text-base ${isRevoked ? 'text-red-700 line-through' : 'text-gray-900'}`}>
                            {member.userId} {isMe && '(You)'}
                        </Text>
                        {isRevoked && (
                            <View className="ml-2 bg-red-100 px-2 py-0.5 rounded-full border border-red-200">
                                <Text className="text-[10px] text-red-700 font-bold uppercase">Revoked</Text>
                            </View>
                        )}
                    </View>
                    <Text className="text-xs text-gray-500 font-mono">Device: {member.deviceId}</Text>
                 </View>
                 
                 {!isMe && !isRevoked && (
                     <TouchableOpacity 
                        onPress={() => handleRevoke(member.userId)}
                        className="bg-red-50 px-4 py-2 rounded-lg border border-red-200 active:bg-red-100"
                     >
                         <Text className="text-red-600 font-semibold text-sm">Revoke</Text>
                     </TouchableOpacity>
                 )}
               </View>
             );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
