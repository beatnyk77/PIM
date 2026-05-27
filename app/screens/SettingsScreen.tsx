import React from 'react';
import { View, Text, Switch, SafeAreaView, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useStore } from '../services/storage/StateManager';
import { useNavigation } from '@react-navigation/native';
import { IdentityService } from '../services/auth/IdentityService';

export default function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const navigation = useNavigation();

  const toggleSwitch = (key: keyof typeof settings) => {
    updateSettings({ [key]: !settings[key] });
  };

  React.useEffect(() => {
    let subscription: any;
    if (settings.panicGestureEnabled) {
      console.log('SettingsScreen: Activating accelerometer face-down sensor monitoring...');
      try {
        const { Accelerometer } = require('expo-sensors');
        Accelerometer.setUpdateInterval(500);
        subscription = Accelerometer.addListener((data: any) => {
          const { z } = data;
          // z ~ 1 when phone is flat face down.
          if (z > 0.85) {
            console.warn('[Sensor Alert] Face-down accelerometer gesture detected! Triggering immediate Panic zeroization.');
            IdentityService.executePanicZeroization().then(() => {
              const { BackHandler } = require('react-native');
              BackHandler.exitApp();
            });
          }
        });
      } catch (e) {
        console.log('SettingsScreen: Native Accelerometer sensors unavailable in current environment. Using software gesture simulation listener.');
        const { EventBus } = require('../services/EventBus');
        const listener = async () => {
          console.warn('[Mock Sensor] Face-down simulated gesture detected! Wiping keys...');
          await IdentityService.executePanicZeroization();
        };
        EventBus.on('sensor.face-down-detected', listener);
        return () => {
          EventBus.off('sensor.face-down-detected', listener);
        };
      }
    }
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [settings.panicGestureEnabled]);

  const handlePanicPurge = () => {
    Alert.alert(
      "⚠️ ACTIVATE PANIC PURGE?",
      "This will physically overwrite your local database files and permanently delete E2EE and hybrid PQ identity keys from the secure hardware enclave. This action CANNOT be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "WIPE EVERYTHING", 
          style: "destructive",
          onPress: async () => {
            console.warn('[UI Panic] Manual Panic button pressed! Zeroizing database...');
            const success = await IdentityService.executePanicZeroization();
            if (success) {
              Alert.alert("Purge Complete", "All local data has been securely deleted. The app will now exit.", [
                { text: "OK", onPress: () => {
                  try {
                    const { BackHandler } = require('react-native');
                    BackHandler.exitApp();
                  } catch (e) {
                    console.log('App successfully zeroized.');
                  }
                }}
              ]);
            } else {
              Alert.alert("Error", "Failed to zeroize all database records safely.");
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="p-4 border-b border-gray-200 flex-row items-center">
        <TouchableOpacity onPress={() => navigation.goBack()} className="mr-4">
            <Text className="text-blue-500 text-lg">Back</Text>
        </TouchableOpacity>
        <Text className="text-xl font-bold">Settings</Text>
      </View>

      <ScrollView className="p-4 flex-1">
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

        <Text className="text-lg font-bold mb-4 mt-4 text-gray-800">Duress & Physical Defenses</Text>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Duress Decoy Vault</Text>
            <Text className="text-gray-500 text-sm">Derives a secondary decoy vault populated with benign chats when unlocking with a decoy password</Text>
          </View>
          <Switch
            value={settings.decoyVaultEnabled}
            onValueChange={() => toggleSwitch('decoyVaultEnabled')}
          />
        </View>

        <View className="flex-row justify-between items-center mb-6">
          <View className="flex-1 mr-4">
            <Text className="text-base font-semibold">Face-down Panic Wiping</Text>
            <Text className="text-gray-500 text-sm">Instantly zeroizes identity keys and scrubs local database storage when device is flipped face-down</Text>
          </View>
          <Switch
            value={settings.panicGestureEnabled}
            onValueChange={() => toggleSwitch('panicGestureEnabled')}
          />
        </View>

        <TouchableOpacity 
          onPress={handlePanicPurge}
          className="bg-red-500 py-3 rounded-lg items-center mb-10"
        >
            <Text className="text-white font-bold text-base">⚠️ ACTIVATE PANIC PURGE</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
