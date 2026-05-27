import React, { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, Switch, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useStore } from '../services/storage/StateManager';

export default function GroupSettingsScreen() {
  const navigation = useNavigation();
  const { activeGroup } = useStore();

  // In-memory component state for Beta UI polish
  const [disappearingMessages, setDisappearingMessages] = useState(false);
  const [aiAssistant, setAiAssistant] = useState(true);
  const [ephemeralLinks, setEphemeralLinks] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="p-4 bg-white border-b border-gray-200 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text className="text-blue-500 font-semibold text-lg">Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView className="flex-1 p-4">
        <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2 ml-1">Privacy & Security</Text>
        <View className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <View className="p-4 border-b border-gray-100 flex-row justify-between items-center">
            <View className="flex-1 mr-4">
              <Text className="text-base font-semibold text-gray-900 mb-1">Disappearing Messages</Text>
              <Text className="text-xs text-gray-500">Messages will self-destruct 1 hour after being read by all members.</Text>
            </View>
            <Switch
              value={disappearingMessages}
              onValueChange={setDisappearingMessages}
              trackColor={{ false: '#e5e7eb', true: '#3b82f6' }}
            />
          </View>
          <View className="p-4 flex-row justify-between items-center">
            <View className="flex-1 mr-4">
              <Text className="text-base font-semibold text-gray-900 mb-1">Ephemeral Invite Links</Text>
              <Text className="text-xs text-gray-500">Newly generated invite links expire after 1 use or 10 minutes.</Text>
            </View>
            <Switch
              value={ephemeralLinks}
              onValueChange={setEphemeralLinks}
              trackColor={{ false: '#e5e7eb', true: '#3b82f6' }}
            />
          </View>
        </View>

        <Text className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-2 ml-1">Features</Text>
        <View className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <View className="p-4 flex-row justify-between items-center">
            <View className="flex-1 mr-4">
              <Text className="text-base font-semibold text-gray-900 mb-1">AI Assistant</Text>
              <Text className="text-xs text-gray-500">Enable Smart Replies and Tone Detection in this group.</Text>
            </View>
            <Switch
              value={aiAssistant}
              onValueChange={setAiAssistant}
              trackColor={{ false: '#e5e7eb', true: '#a855f7' }}
            />
          </View>
        </View>
        
        <Text className="text-center text-gray-400 text-xs mt-4">Group settings apply to the active group session only.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
