import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, SafeAreaView, ScrollView, ActivityIndicator, Alert, Switch, Clipboard, TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { GroupSessionManager, GroupMember } from '../services/messaging/GroupSessionManager';
import { useStore } from '../services/storage/StateManager';
import { IdentityService } from '../services/auth/IdentityService';
import GroupQrCode from '../components/GroupQrCode';

export default function GroupDetailsScreen() {
  const navigation = useNavigation();
  const { activeGroup } = useStore();
  const [roster, setRoster] = useState<GroupMember[]>([]);
  const [epoch, setEpoch] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [amIAdmin, setAmIAdmin] = useState(false);

  // Invite link generation states
  const [isBurnOnUse, setIsBurnOnUse] = useState(true);
  const [isTimeLimited, setIsTimeLimited] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [invitePassword, setInvitePassword] = useState('');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Local audit logs
  const [auditLogs, setAuditLogs] = useState<Array<{ timestamp: number, action: string, details: string }>>([]);

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
      
      const myNode = currentRoster.find(m => m.userId === keys?.registrationId.toString());
      if (myNode && myNode.role === 'admin') {
        setAmIAdmin(true);
      } else {
        setAmIAdmin(false);
      }

      // Fetch E2EE decrypted local audit logs
      const logs = await GroupSessionManager.getAdminAuditLogs(activeGroup);
      setAuditLogs(logs);
    } catch (e) {
      console.error('Failed to load group details', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateInvite = async () => {
    if (!activeGroup) return;
    const inviteToken = `inv_${Math.random().toString(36).substring(2, 10)}`;
    const expiresAt = isTimeLimited ? Date.now() + 10 * 60 * 1000 : undefined;
    const password = isPasswordProtected && invitePassword.trim() ? invitePassword.trim() : undefined;

    // Register invite token locally in group storage with optional password/expiry
    await GroupSessionManager.registerInviteToken(activeGroup, inviteToken, isBurnOnUse, password, expiresAt);

    const base = `pim://group/join/${activeGroup}`;
    const link = `${base}?token=${inviteToken}&burn=${isBurnOnUse}&ephemeral=${isTimeLimited}${password ? '&pw=true' : ''}`;
    setGeneratedLink(link);
  };

  const handleCopyLink = () => {
    if (generatedLink) {
      Clipboard.setString(generatedLink);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
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
        <TouchableOpacity onPress={() => (navigation as any).navigate('GroupSettings')}>
            <Text className="text-gray-500 font-bold text-xl">⚙️</Text>
        </TouchableOpacity>
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

          {/* Secure Ephemeral Invite Sharing Card */}
          <View className="bg-white p-4 rounded-xl border border-gray-200 mb-6 shadow-sm">
            <Text className="text-sm text-purple-700 font-bold uppercase tracking-wider mb-3">🛡️ Secure Invite Link (QR + Copy)</Text>
            
            <View className="flex-row justify-between items-center mb-3">
              <View className="flex-1 mr-4">
                <Text className="text-sm font-semibold text-gray-800">Burn on Use (One-Time Invite)</Text>
                <Text className="text-xs text-gray-400">Link self-destructs instantly after being consumed once.</Text>
              </View>
              <Switch
                value={isBurnOnUse}
                onValueChange={setIsBurnOnUse}
                trackColor={{ false: '#e5e7eb', true: '#a855f7' }}
              />
            </View>

            <View className="flex-row justify-between items-center mb-4">
              <View className="flex-1 mr-4">
                <Text className="text-sm font-semibold text-gray-800">Time-Limited Link (10 Minutes)</Text>
                <Text className="text-xs text-gray-400">Link automatically expires after 10 minutes.</Text>
              </View>
              <Switch
                value={isTimeLimited}
                onValueChange={setIsTimeLimited}
                trackColor={{ false: '#e5e7eb', true: '#a855f7' }}
              />
            </View>

            <View className="flex-row justify-between items-center mb-3">
              <View className="flex-1 mr-4">
                <Text className="text-sm font-semibold text-gray-800">Password Protected (Optional)</Text>
                <Text className="text-xs text-gray-400">Require an invite code/PIN to join this group.</Text>
              </View>
              <Switch
                value={isPasswordProtected}
                onValueChange={setIsPasswordProtected}
                trackColor={{ false: '#e5e7eb', true: '#a855f7' }}
              />
            </View>

            {isPasswordProtected && (
              <TextInput
                className="bg-gray-50 p-3 rounded-lg mb-4 text-sm font-semibold border border-gray-200"
                placeholder="Enter Invite Password/PIN"
                value={invitePassword}
                onChangeText={setInvitePassword}
                secureTextEntry
                autoCapitalize="none"
              />
            )}

            <TouchableOpacity
              onPress={handleGenerateInvite}
              className="bg-purple-600 p-3 rounded-xl items-center mb-4 active:bg-purple-700 shadow-sm"
            >
              <Text className="text-white font-bold">Generate Secure invite</Text>
            </TouchableOpacity>

            {generatedLink && (
              <View className="items-center mt-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
                <GroupQrCode value={generatedLink} size={150} />
                
                <Text className="text-gray-500 font-mono text-[10px] text-center mt-3 select-all bg-white p-2 rounded border border-gray-200 w-full" numberOfLines={1}>
                  {generatedLink}
                </Text>

                <TouchableOpacity
                  onPress={handleCopyLink}
                  className={`mt-3 w-full py-2.5 rounded-lg items-center ${copyFeedback ? 'bg-green-600' : 'bg-gray-800'} active:opacity-90`}
                >
                  <Text className="text-white font-bold text-sm">
                    {copyFeedback ? 'Copied! ✓ 📋' : 'Copy Secure Link'}
                  </Text>
                </TouchableOpacity>

                {isBurnOnUse && (
                  <Text className="text-[10px] text-orange-600 font-semibold text-center mt-2">
                    ⏳ Burn-on-use enabled. Link will self-destruct once scanned/joined.
                  </Text>
                )}
              </View>
            )}
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
                        {!isRevoked && member.role === 'admin' && (
                            <View className="ml-2 bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200">
                                <Text className="text-[10px] text-blue-700 font-bold uppercase">Admin</Text>
                            </View>
                        )}
                    </View>
                    <Text className="text-xs text-gray-500 font-mono">Device: {member.deviceId}</Text>
                 </View>
                 
                 {!isMe && !isRevoked && amIAdmin && (
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

          {/* Encrypted Local Group Audit Logs Timeline */}
          <Text className="text-lg font-bold text-gray-900 mt-6 mb-3">🛡️ Security Audit Logs ({auditLogs.length})</Text>
          
          <View className="bg-white rounded-xl border border-gray-200 p-4 mb-8 shadow-sm">
            {auditLogs.length === 0 ? (
              <Text className="text-gray-400 text-xs italic text-center py-2">No admin events recorded yet.</Text>
            ) : (
              [...auditLogs].reverse().map((log, idx) => (
                <View key={idx} className={`flex-row pb-4 relative ${idx === auditLogs.length - 1 ? 'pb-0' : 'border-b border-gray-100 mb-3'}`}>
                  <View className="mr-3 items-center">
                    <View className="w-2.5 h-2.5 rounded-full bg-purple-600 z-10" />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row justify-between items-center mb-1 flex-wrap">
                      <Text className="text-xs font-bold text-gray-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 uppercase tracking-wide">
                        {log.action}
                      </Text>
                      <Text className="text-[10px] text-gray-400 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </Text>
                    </View>
                    <Text className="text-xs text-gray-650 font-mono leading-relaxed bg-gray-50 p-2 rounded mt-1 border border-gray-100">
                      {log.details}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
