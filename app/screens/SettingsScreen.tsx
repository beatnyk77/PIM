import React from 'react';
import { View, Text, Switch, SafeAreaView, TouchableOpacity } from 'react-native';
import { useStore } from '../services/storage/StateManager';
import { useNavigation } from '@react-navigation/native';

export default function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const navigation = useNavigation();

  const toggleSwitch = (key: keyof typeof settings) => {
    updateSettings({ [key]: !settings[key] });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
            <Text className="text-blue-500 text-lg">Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold">Settings</Text>
      </View>

      <View className="p-4">
        <Text className="text-lg font-bold mb-4 text-gray-800">AI Features</Text>
        
        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">AI Assistant</Text>
            <Text className="text-gray-500 text-sm">Enable AI reply suggestions and analysis</Text>
          </View>
          <Switch
            value={settings.aiEnabled}
            onValueChange={() => toggleSwitch('aiEnabled')}
          />
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Task Detection</Text>
            <Text className="text-gray-500 text-sm">Automatically detect and extract tasks from messages</Text>
          </View>
          <Switch
            value={settings.taskDetectionEnabled}
            onValueChange={() => toggleSwitch('taskDetectionEnabled')}
            disabled={!settings.aiEnabled}
          />
        </View>

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Privacy</Text>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Read Receipts</Text>
            <Text className="text-gray-500 text-sm">Send and receive read receipts</Text>
          </View>
          <Switch
            value={settings.readReceiptsEnabled}
            onValueChange={() => toggleSwitch('readReceiptsEnabled')}
          />
        </View>

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Messaging Controls</Text>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Delayed Send (5s)</Text>
            <Text className="text-gray-500 text-sm">Gives you a moment to cancel sent messages</Text>
          </View>
          <Switch
            value={settings.delayedSendEnabled}
            onValueChange={() => toggleSwitch('delayedSendEnabled')}
          />
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Default Self-Destruct</Text>
            <Text className="text-gray-500 text-sm">Auto-delete messages after a set time</Text>
          </View>
          <View className="flex-row items-center">
              <TouchableOpacity 
                onPress={() => updateSettings({ defaultSelfDestructTime: 0 })}
                className={`px-2 py-1 rounded border mr-2 ${settings.defaultSelfDestructTime === 0 ? 'bg-blue-100 border-blue-500' : 'bg-white border-gray-300'}`}
              >
                  <Text>Off</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => updateSettings({ defaultSelfDestructTime: 30 })}
                className={`px-2 py-1 rounded border ${settings.defaultSelfDestructTime === 30 ? 'bg-blue-100 border-blue-500' : 'bg-white border-gray-300'}`}
              >
                  <Text>30s</Text>
              </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
