import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IdentityService, IdentityKeys } from '../services/auth/IdentityService';

// Helper to display ArrayBuffer as Hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}

export default function ProfileScreen() {
  const [keys, setKeys] = useState<IdentityKeys | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIdentity();
  }, []);

  const loadIdentity = async () => {
    setLoading(true);
    const loadedKeys = await IdentityService.loadKeys();
    setKeys(loadedKeys);
    setLoading(false);
  };

  const handleRegenerate = async () => {
    const newKeys = await IdentityService.generateIdentity();
    setKeys(newKeys);
  };

  return (
    <SafeAreaView className="flex-1 bg-white p-4">
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <Text className="text-2xl font-bold mb-6 text-gray-900">User Identity</Text>

        {loading ? (
          <Text className="text-gray-500">Loading identity...</Text>
        ) : keys ? (
          <View className="space-y-6">
            <View className="bg-gray-100 p-4 rounded-lg">
              <Text className="text-sm font-semibold text-gray-500 mb-1">REGISTRATION ID</Text>
              <Text className="text-xl font-mono text-gray-900">{keys.registrationId}</Text>
            </View>

            <View className="bg-gray-100 p-4 rounded-lg">
              <Text className="text-sm font-semibold text-gray-500 mb-1">IDENTITY KEY (First 16 bytes)</Text>
              <Text className="text-xs font-mono text-gray-600 break-all">
                {bufferToHex(keys.identityKey).substring(0, 32)}...
              </Text>
            </View>

            <View className="mt-4">
               <Text className="text-xs text-gray-400 italic">
                 Your identity keys are stored securely on this device.
               </Text>
            </View>
          </View>
        ) : (
          <View className="items-center py-10">
            <Text className="text-red-500 mb-4">No Identity Found</Text>
            <TouchableOpacity 
              onPress={handleRegenerate}
              className="bg-blue-600 px-6 py-3 rounded-full"
            >
              <Text className="text-white font-semibold">Generate New Identity</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
